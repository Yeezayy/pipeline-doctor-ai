import json
import re
from difflib import unified_diff
from itertools import pairwise

import yaml
from fastapi import HTTPException

from app.ai.diagnostician import AIUnavailable
from app.ai.patcher import PatchGenerator
from app.core.security import redact
from app.integrations.gitlab import gitlab_client
from app.schemas.fix import FixEdit, FixOut, FixProposal
from app.services import demo

MAX_CI_CHARS = 16_000
LIMITATION = "Only the root .gitlab-ci.yml is available; included files are not expanded. GitLab CI validation and jobs have not been run."


def blocked(analysis, base_sha: str, explanation: str) -> FixOut:
    return FixOut(
        analysis_id=analysis.id,
        base_sha=base_sha,
        source=analysis.source,
        status="needs_context",
        summary="More context is needed before proposing a patch",
        explanation=explanation,
        diff=None,
        applicability_checked=False,
        yaml_syntax_valid=None,
        verification_steps=[],
        limitations=[LIMITATION],
    )


def build_diff(ci: str, proposal: FixProposal) -> str:
    """Match exact edits to the original file and produce the diff on the server."""
    source = ci.replace("\r\n", "\n")
    edits = []
    for edit in proposal.edits:
        old, new = edit.old_text.replace("\r\n", "\n"), edit.new_text.replace("\r\n", "\n")
        if old == new or source.count(old) != 1:
            raise ValueError("Edit does not uniquely match the source")
        if "[REDACTED]" in old + new or redact(old) != old or redact(new) != new:
            raise ValueError("Edits must not contain or modify secrets")
        start = source.index(old)
        edits.append((start, start + len(old), new))
    edits.sort()
    if any(left[1] > right[0] for left, right in pairwise(edits)):
        raise ValueError("Overlapping edits")
    updated = source
    for start, end, replacement in reversed(edits):
        updated = updated[:start] + replacement + updated[end:]
    if len(updated) > 40_000:
        raise ValueError("Proposed configuration is too large")
    tree = yaml.compose(updated, Loader=yaml.SafeLoader)
    if not isinstance(tree, yaml.MappingNode):
        raise ValueError("CI configuration must be a YAML mapping")
    if "\r\n" in ci and "\n" not in ci.replace("\r\n", ""):
        updated = updated.replace("\n", "\r\n")

    def diff_with_context(context):
        rows = unified_diff(
            ci.splitlines(keepends=True),
            updated.splitlines(keepends=True),
            fromfile="a/.gitlab-ci.yml",
            tofile="b/.gitlab-ci.yml",
            n=context,
        )
        return "".join(
            row if row.endswith("\n") else row + "\n\\ No newline at end of file\n" for row in rows
        )

    diff = diff_with_context(3)
    if redact(diff) != diff:
        # Exclude unrelated secrets from context without changing the patch's source text.
        diff = diff_with_context(0)
    if not diff or redact(diff) != diff:
        raise ValueError("A safe applicable diff could not be produced")
    return diff


async def propose(analysis, project) -> FixOut:
    base_sha = str(analysis.pipeline.get("sha", ""))
    if not re.fullmatch(r"[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?", base_sha):
        raise HTTPException(
            409, "This analysis has no immutable commit SHA; create a new diagnosis first"
        )
    if analysis.source == "demo":
        ci = demo.ci_file(analysis.pipeline_id)
    else:
        async with gitlab_client() as client:
            ci = await client.ci_file(project.gitlab_id, base_sha)
    if ci is None or not ci.strip():
        return blocked(
            analysis,
            base_sha,
            "The root CI file is empty, missing, inaccessible or too large to retrieve at this commit. Check the project's CI file path and access.",
        )
    if len(ci) > MAX_CI_CHARS:
        return blocked(
            analysis,
            base_sha,
            "The CI file exceeds the 16,000-character patch limit. A complete source file is required to produce an applicable patch.",
        )
    if analysis.source == "demo":
        if analysis.pipeline_id != 1043:
            return blocked(
                analysis,
                base_sha,
                "This simulated incident needs repository files or project settings that are not available. Try pipeline #1043 for a fixed example patch replacing an incompatible job image.",
            )
        proposal = FixProposal(
            status="ready",
            summary="Use a Python image for the integration test job",
            explanation="The simulated job runs Python in an Alpine image that does not provide it. This example changes only the job image.",
            edits=[FixEdit(old_text="image: alpine:3.21", new_text="image: python:3.12-slim")],
            verification_steps=[
                "Review dependencies required by the integration tests and rerun the affected job."
            ],
            limitations=["Fixed simulated example; no LLM request was made."],
            fixes_tested=False,
        )
    else:
        diagnosis = json.loads(redact(json.dumps(analysis.diagnosis)))
        proposal = await PatchGenerator().propose(
            diagnosis=diagnosis,
            ci=redact(ci.replace("\r\n", "\n"), preserve_lines=True),
            base_sha=base_sha,
        )
    if proposal.status == "needs_context":
        result = blocked(analysis, base_sha, redact(proposal.explanation))
        result.summary = redact(proposal.summary)
        result.limitations += [redact(item) for item in proposal.limitations]
        return result
    try:
        diff = build_diff(ci, proposal)
    except (ValueError, yaml.YAMLError) as exc:
        raise AIUnavailable(
            "The proposed patch could not be matched safely to the source or produced invalid YAML; no patch was returned. Retry with more context."
        ) from exc
    return FixOut(
        analysis_id=analysis.id,
        base_sha=base_sha,
        source=analysis.source,
        status="ready",
        summary=redact(proposal.summary),
        explanation=redact(proposal.explanation),
        diff=diff,
        applicability_checked=True,
        yaml_syntax_valid=True,
        verification_steps=[
            "Check that your checkout matches base commit " + base_sha + ".",
            "git apply --check --unidiff-zero pipeline-doctor-ci.patch",
            "Validate the configuration with GitLab CI Lint before applying or rerunning jobs.",
            *[redact(item) for item in proposal.verification_steps],
        ],
        limitations=[LIMITATION, *[redact(item) for item in proposal.limitations]],
    )
