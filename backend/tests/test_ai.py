from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage
from pydantic import ValidationError

from app.ai.diagnostician import AIUnavailable, Diagnostician
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


async def test_invented_evidence_is_removed():
    model = MagicMock()
    model.with_structured_output.return_value.ainvoke = AsyncMock(
        return_value=PipelineDiagnosis(**diagnosis(1048))
    )
    result = await Diagnostician(model).analyze(
        job={"name": "test", "status": "failed"},
        pipeline={},
        logs="No matching evidence",
        ci=None,
        context="",
    )
    assert result.evidence == []
    assert result.confidence <= 0.5


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
