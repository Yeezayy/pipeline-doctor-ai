import json
import subprocess
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage
from pydantic import ValidationError

from app.ai.diagnostician import AIUnavailable
from app.ai.patcher import PatchGenerator
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.integrations.gitlab import GitLabClient
from app.models.entities import Analysis, Project
from app.schemas.fix import FixProposal
from app.services import demo, fixes

SHA = "a" * 40
CI = "variables:\n  PASSWORD: fixture-source-secret\nbuild:\n  image: alpine:3.21\n  script: python -m pytest\n"


def proposal(**changes):
    return FixProposal.model_validate(
        {
            "status": "ready",
            "summary": "Use Python",
            "explanation": "The job image needs Python.",
            "edits": [{"old_text": "image: alpine:3.21", "new_text": "image: python:3.12-slim"}],
            "verification_steps": ["Rerun the affected test job."],
            "limitations": [],
            "fixes_tested": False,
        }
        | changes
    )


def assert_applies(tmp_path, original, diff):
    (tmp_path / ".gitlab-ci.yml").write_bytes(original.encode())
    result = subprocess.run(
        ["git", "apply", "--unidiff-zero", "-"],
        input=diff,
        text=True,
        cwd=tmp_path,
        capture_output=True,
    )
    assert result.returncode == 0, result.stderr
    return (tmp_path / ".gitlab-ci.yml").read_bytes().decode()


@pytest.mark.parametrize(
    "source", [CI, CI.rstrip("\n"), CI.replace("\n", "\r\n"), "image: alpine:3.21"]
)
def test_generated_diff_applies_with_git_and_preserves_unrelated_secrets(tmp_path, source):
    diff = fixes.build_diff(source, proposal())
    assert "fixture-source-secret" not in diff
    assert "[REDACTED]" not in diff
    assert assert_applies(tmp_path, source, diff) == source.replace(
        "alpine:3.21", "python:3.12-slim"
    )


@pytest.mark.parametrize(
    "edits",
    [
        [{"old_text": "not in file", "new_text": "image: python:3.12-slim"}],
        [{"old_text": "image: alpine:3.21", "new_text": "image: alpine:3.21"}],
        [{"old_text": "image: alpine:3.21", "new_text": "image: [broken"}],
        [{"old_text": "PASSWORD: fixture-source-secret", "new_text": "PASSWORD: changed-secret"}],
        [
            {
                "old_text": "image: alpine:3.21",
                "new_text": "image: python\nTOKEN: glpat-invented-secret-value",
            }
        ],
        [{"old_text": "[REDACTED]", "new_text": "invented-value"}],
        [
            {"old_text": "image: alpine:3.21", "new_text": "image: python"},
            {"old_text": "alpine:3.21", "new_text": "python"},
        ],
    ],
)
def test_invalid_edits_are_rejected(edits):
    with pytest.raises((ValueError, fixes.yaml.YAMLError)):
        fixes.build_diff(CI, proposal(edits=edits))


def test_ambiguous_match_is_rejected():
    with pytest.raises(ValueError, match="uniquely"):
        fixes.build_diff("image: alpine:3.21\njob:\n  image: alpine:3.21\n", proposal())


def test_custom_gitlab_yaml_tags_can_be_parsed(tmp_path):
    source = "image: alpine:3.21\njob:\n  script: !reference [.shared, script]\n"
    assert "!reference" in assert_applies(tmp_path, source, fixes.build_diff(source, proposal()))


@pytest.mark.parametrize(
    "changes",
    [
        {"fixes_tested": True},
        {"path": "other-file"},
        {"edits": []},
        {"status": "needs_context"},
        {"verification_steps": []},
    ],
)
def test_model_cannot_claim_a_verified_or_unscoped_patch(changes):
    with pytest.raises(ValidationError):
        proposal(**changes)


@pytest.fixture
def live_analysis(monkeypatch):
    settings = get_settings()
    settings.demo_mode = False
    settings.gitlab_token = "fixture-gitlab-token"
    with SessionLocal() as db:
        db.add(
            Project(
                id="live-7",
                gitlab_id=7,
                name="team/app",
                web_url="https://gitlab.com/team/app",
                source="live",
            )
        )
        db.commit()
        db.add(
            Analysis(
                id="analysis-1",
                project_id="live-7",
                pipeline_id=123,
                job_id=9,
                job_name="build",
                source="live",
                diagnosis=demo.diagnosis(1043),
                pipeline={"sha": SHA},
            )
        )
        db.commit()
    ci = AsyncMock(return_value=CI)
    monkeypatch.setattr(GitLabClient, "ci_file", ci)
    generator = SimpleNamespace(propose=AsyncMock(return_value=proposal()))
    monkeypatch.setattr(fixes, "PatchGenerator", lambda: generator)
    return ci, generator


def test_live_endpoint_uses_saved_commit_and_sanitizes_the_model_input(
    client, live_analysis, tmp_path
):
    response = client.post("/api/analyses/analysis-1/fixes")
    assert response.status_code == 200
    result = response.json()
    live_analysis[0].assert_awaited_once_with(7, SHA)
    sent = live_analysis[1].propose.call_args.kwargs
    assert "fixture-source-secret" not in sent["ci"]
    assert sent["base_sha"] == SHA
    assert result["status"] == "ready"
    assert result["applicability_checked"] and result["yaml_syntax_valid"]
    assert not result["fixes_tested"]
    assert result["base_sha"] == SHA and result["path"] == ".gitlab-ci.yml"
    assert "fixture-source-secret" not in response.text
    assert "python:3.12-slim" in assert_applies(tmp_path, CI, result["diff"])


@pytest.mark.parametrize("ci", [None, "", "x" * 16001])
def test_incomplete_source_returns_no_patch_and_does_not_call_the_llm(client, live_analysis, ci):
    live_analysis[0].return_value = ci
    result = client.post("/api/analyses/analysis-1/fixes").json()
    assert result["status"] == "needs_context" and result["diff"] is None
    assert result["yaml_syntax_valid"] is None
    live_analysis[1].propose.assert_not_awaited()


def test_invalid_proposal_does_not_expose_a_patch_and_releases_the_ai_slot(client, live_analysis):
    live_analysis[1].propose.return_value = proposal(
        edits=[{"old_text": "missing", "new_text": "something"}]
    )
    assert client.post("/api/analyses/analysis-1/fixes").status_code == 502
    live_analysis[1].propose.return_value = proposal()
    assert client.post("/api/analyses/analysis-1/fixes").status_code == 200


def test_missing_saved_commit_is_rejected_before_gitlab(client, live_analysis):
    with SessionLocal() as db:
        db.get(Analysis, "analysis-1").pipeline = {}
        db.commit()
    assert client.post("/api/analyses/analysis-1/fixes").status_code == 409
    live_analysis[0].assert_not_awaited()


def test_model_can_request_context_without_inventing_a_diff(client, live_analysis):
    live_analysis[1].propose.return_value = proposal(
        status="needs_context", edits=[], explanation="The dependency manifest is needed."
    )
    result = client.post("/api/analyses/analysis-1/fixes").json()
    assert result["status"] == "needs_context" and result["diff"] is None
    assert "manifest" in result["explanation"]


def test_demo_patch_and_context_only_examples(client, tmp_path):
    client.get("/api/projects").raise_for_status()
    for pipeline_id in (1043, 1048):
        analysis = client.post(
            "/api/analyses",
            json={"project_id": "demo-1", "pipeline_id": pipeline_id, "job_id": pipeline_id * 10},
        ).json()
        response = client.post(f"/api/analyses/{analysis['id']}/fixes")
        assert response.status_code == 200
        result = response.json()
        assert result["source"] == "demo" and not result["fixes_tested"]
        if pipeline_id == 1043:
            assert "python:3.12-slim" in assert_applies(
                tmp_path, demo.ci_file(pipeline_id), result["diff"]
            )
        else:
            assert result["status"] == "needs_context" and result["diff"] is None


@pytest.mark.parametrize("mode", ["json_schema", "prompt_json"])
async def test_patch_generator_validates_both_output_modes(mode):
    get_settings().llm_output_mode = mode
    model = MagicMock()
    model.with_structured_output.return_value.ainvoke = AsyncMock(return_value=proposal())
    model.ainvoke = AsyncMock(return_value=AIMessage(content=proposal().model_dump_json()))
    result = await PatchGenerator(model).propose(
        diagnosis=demo.diagnosis(1043), ci="image: alpine:3.21", base_sha=SHA
    )
    assert result.status == "ready" and not result.fixes_tested
    if mode == "json_schema":
        model.with_structured_output.assert_called_once_with(FixProposal, method="json_schema")
    else:
        model.with_structured_output.assert_not_called()
        assert "ci_source" in model.ainvoke.call_args.args[0][1].content


@pytest.mark.parametrize(
    "content", ["not json", "{}", "[]", "```json\n{}\n```", json.dumps({"fixes_tested": True})]
)
async def test_patch_generator_rejects_invalid_output_without_a_fallback(content):
    get_settings().llm_output_mode = "prompt_json"
    model = MagicMock()
    model.ainvoke = AsyncMock(return_value=AIMessage(content=content))
    with pytest.raises(AIUnavailable, match="invalid patch"):
        await PatchGenerator(model).propose(diagnosis={}, ci="image: alpine", base_sha=SHA)
    model.ainvoke.assert_awaited_once()
    model.with_structured_output.assert_not_called()
