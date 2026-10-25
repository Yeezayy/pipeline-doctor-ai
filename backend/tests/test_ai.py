import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage
from pydantic import ValidationError

from app.ai.diagnostician import AIUnavailable, Diagnostician
from app.core.config import Settings, get_settings
from app.schemas.diagnosis import PipelineDiagnosis
from app.services.demo import diagnosis


def test_schema_bounds_and_no_false_verification():
    data = diagnosis(1048)
    assert PipelineDiagnosis(**data).confidence == 0.94
    for bad in (
        {"confidence": 1.1},
        {"severity": "unknown"},
        {"fixes_tested": True},
        {"suggested_fixes": []},
    ):
        with pytest.raises(ValidationError):
            PipelineDiagnosis(**(data | bad))


async def test_structured_llm_and_sanitized_payload():
    model = MagicMock()
    runnable = model.with_structured_output.return_value
    runnable.ainvoke = AsyncMock(return_value=PipelineDiagnosis(**diagnosis(1048)))
    engine = Diagnostician(model)
    error = diagnosis(1048)["evidence"][0]
    result = await engine.analyze(
        job={"name": "docker-build", "status": "failed"},
        pipeline={"id": 1},
        logs=f"token=do-not-transmit\n{error}",
        ci=None,
        context="password=do-not-transmit-either",
    )
    payload = runnable.ainvoke.call_args.args[0][1].content
    assert "do-not-transmit" not in payload
    assert result.evidence == [error]
    assert not result.fixes_tested
    model.with_structured_output.assert_called_once_with(PipelineDiagnosis, method="json_schema")


@pytest.mark.parametrize("mode", ["json_schema", "prompt_json"])
async def test_invented_evidence_is_removed(mode):
    get_settings().llm_output_mode = mode
    model = MagicMock()
    model.with_structured_output.return_value.ainvoke = AsyncMock(
        return_value=PipelineDiagnosis(**diagnosis(1048))
    )
    model.ainvoke = AsyncMock(return_value=AIMessage(content=json.dumps(diagnosis(1048))))
    result = await Diagnostician(model).analyze(
        job={"name": "test", "status": "failed"},
        pipeline={},
        logs="No matching evidence",
        ci=None,
        context="",
    )
    assert result.evidence == []
    assert result.confidence <= 0.5


async def test_prompt_json_validates_redacts_and_preserves_exact_evidence():
    get_settings().llm_output_mode = "prompt_json"
    data = diagnosis(1048)
    data["root_cause"] += " token=private-output-value"
    model = MagicMock()
    model.ainvoke = AsyncMock(return_value=AIMessage(content=json.dumps(data)))
    result = await Diagnostician(model).analyze(
        job={"name": "build", "status": "failed"},
        pipeline={"id": 1},
        logs="token=private-input-value\n" + data["evidence"][0],
        ci=None,
        context="password=private-context-value",
    )
    model.with_structured_output.assert_not_called()
    model.ainvoke.assert_awaited_once()
    system, user = model.ainvoke.call_args.args[0]
    assert '"additionalProperties": false' in system.content
    assert "No Markdown fences" in system.content
    for name in PipelineDiagnosis.model_fields:
        assert name in system.content
    assert "private-input-value" not in user.content
    assert "private-context-value" not in user.content
    assert "private-output-value" not in result.model_dump_json()
    assert result.evidence == [data["evidence"][0]]
    assert result.fixes_tested is False


@pytest.mark.parametrize(
    "content",
    [
        "",
        "Not JSON",
        '{"summary": "Truncated',
        "```json\n" + json.dumps(diagnosis(1048)) + "\n```",
        "[]",
        json.dumps(diagnosis(1048) | {"fixes_tested": True}),
        json.dumps(diagnosis(1048) | {"confidence": "0.94"}),
        json.dumps(diagnosis(1048) | {"confidence": 1.1}),
        json.dumps(diagnosis(1048) | {"unexpected": "Do not accept extra fields"}),
        [],
    ],
)
async def test_prompt_json_fails_closed_on_invalid_output(content):
    get_settings().llm_output_mode = "prompt_json"
    model = MagicMock()
    model.ainvoke = AsyncMock(return_value=AIMessage(content=content))
    with pytest.raises(AIUnavailable, match="invalid diagnosis"):
        await Diagnostician(model).analyze(
            job={"name": "build", "status": "failed"}, pipeline={}, logs="", ci=None, context=""
        )
    # No automatic fallback, repair request, tools or additional provider calls.
    model.with_structured_output.assert_not_called()
    model.ainvoke.assert_awaited_once()


async def test_prompt_json_rejects_truncation_even_with_parseable_content():
    get_settings().llm_output_mode = "prompt_json"
    model = MagicMock()
    model.ainvoke = AsyncMock(
        return_value=AIMessage(
            content=json.dumps(diagnosis(1048)), response_metadata={"finish_reason": "length"}
        )
    )
    with pytest.raises(AIUnavailable, match="invalid diagnosis"):
        await Diagnostician(model).analyze(
            job={"name": "build", "status": "failed"}, pipeline={}, logs="", ci=None, context=""
        )


def test_output_mode_must_be_explicit_and_known():
    assert Settings().llm_output_mode == "json_schema"
    with pytest.raises(ValidationError):
        Settings(llm_output_mode="automatic")


async def test_invalid_provider_response():
    model = MagicMock()
    model.with_structured_output.return_value.ainvoke = AsyncMock(
        side_effect=ValueError("sensitive detail")
    )
    with pytest.raises(AIUnavailable, match="invalid diagnosis"):
        await Diagnostician(model).analyze(
            job={"name": "test", "status": "failed"}, pipeline={}, logs="", ci=None, context=""
        )


async def test_chat_context_and_redaction():
    model = MagicMock()
    model.ainvoke = AsyncMock(return_value=AIMessage(content="Check login. token=private-value"))
    answer = await Diagnostician(model).chat(diagnosis(1048), {"id": 1048}, [], "What next?")
    assert "private-value" not in answer
    prompt = model.ainvoke.call_args.args[0]
    assert "Dockerfile" in prompt[1].content
    assert "What next?" == prompt[-1].content
