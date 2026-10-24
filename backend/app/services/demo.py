"""Deterministic, explicitly simulated incidents. Never used in live mode."""

from datetime import UTC, datetime, timedelta
from hashlib import sha256

INCIDENTS = [
    (
        "docker-build",
        "build",
        "Dockerfile not found",
        "failed to read dockerfile: open Dockerfile: no such file or directory",
        "The build context does not contain the requested Dockerfile.",
        "Verify the working directory, commit the Dockerfile, or pass docker build -f path/to/Dockerfile with the correct context.",
    ),
    (
        "typescript-build",
        "build",
        "TypeScript compilation failed",
        "src/main.ts(18,7): error TS2322: Type 'string' is not assignable to type 'number'.",
        "A TypeScript assignment violates the declared type.",
        "Inspect src/main.ts:18 and align the value and declared type; run npm run build locally.",
    ),
    (
        "unit-tests",
        "test",
        "Missing Python dependency",
        "ModuleNotFoundError: No module named 'httpx'",
        "The test environment does not have httpx installed.",
        "Declare httpx in the project's dependency manifest and install dependencies before pytest.",
    ),
    (
        "validate-ci",
        "validate",
        "Invalid YAML configuration",
        ".gitlab-ci.yml: mapping values are not allowed in this context at line 12, column 9",
        "The YAML parser rejected the CI configuration.",
        "Inspect indentation and unquoted colons near line 12, then validate with GitLab CI Lint.",
    ),
    (
        "registry-push",
        "deploy",
        "Registry authentication failed",
        "unauthorized: authentication required",
        "The registry rejected the push credentials or permissions.",
        "Check registry login, protected CI variables and token scope; never print credentials in the job log.",
    ),
    (
        "integration-tests",
        "test",
        "Incompatible job image",
        "/bin/sh: python: not found",
        "The job image does not provide a Python executable on PATH.",
        "Use a Python image (for example python:3.12-slim) or install Python explicitly in the job image.",
    ),
]
PROJECT = {
    "id": "demo-1",
    "gitlab_id": 1,
    "name": "acme / storefront",
    "web_url": "https://gitlab.com",
    "source": "demo",
}


def pipelines():
    base = datetime.now(UTC).replace(hour=10, minute=30, second=0, microsecond=0)
    return [
        {
            "id": 1048 - i,
            "status": "failed" if i < 6 else "success",
            "ref": ["main", "feat/checkout", "fix/dependencies"][i % 3],
            "sha": sha256(f"simulated-commit-{i}".encode()).hexdigest()[:40],
            "web_url": "",
            "created_at": (base - timedelta(hours=i * 3)).isoformat(),
            "source": "demo",
        }
        for i in range(9)
    ]


def incident_index(pipeline_id):
    return 1048 - pipeline_id


def jobs(pipeline_id):
    i = incident_index(pipeline_id)
    if not 0 <= i < 9:
        return []
    name, stage = INCIDENTS[i][:2] if i < 6 else ("build-and-test", "test")
    return [
        {
            "id": pipeline_id * 10,
            "name": name,
            "stage": stage,
            "status": "failed" if i < 6 else "success",
            "duration": 42 + i * 13,
        }
    ]


def trace(pipeline_id):
    i = incident_index(pipeline_id)
    error = INCIDENTS[i][3] if i < 6 else "All checks passed."
    return (
        f"Running with gitlab-runner 18.0.0 (SIMULATED)\nPreparing the docker executor\nFetching changes with git depth set to 20...\nChecking out commit on main\n$ running {jobs(pipeline_id)[0]['name']}\n{error}\nCleaning up project directory and file based variables\n"
        + ("ERROR: Job failed: exit code 1" if i < 6 else "Job succeeded")
    )


def diagnosis(pipeline_id):
    i = incident_index(pipeline_id)
    if not 0 <= i < 6:
        raise ValueError("No demo failure for this pipeline")
    _, _, summary, evidence, cause, fix = INCIDENTS[i]
    return {
        "summary": summary,
        "root_cause": cause,
        "severity": "high" if i == 4 else "medium",
        "confidence": 0.94 if i != 4 else 0.79,
        "evidence": [evidence],
        "hypotheses": ["This is a curated simulated incident, not a live LLM result."],
        "suggested_fixes": [fix, "Review the change and rerun the affected job to verify it."],
        "explanation": f"The supplied simulated trace contains: {evidence}\n{cause} The recommendation has not been executed or tested.",
        "fixes_tested": False,
    }
