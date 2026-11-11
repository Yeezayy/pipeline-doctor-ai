import json

import httpx
import pytest
from langchain_openai import ChatOpenAI

from app.ai.diagnostician import Diagnostician
from app.ai.patcher import PatchGenerator
from app.core.config import get_settings
from app.services.demo import diagnosis


@pytest.mark.parametrize("mode", ["json_schema", "prompt_json"])
@pytest.mark.parametrize("kind", ["diagnosis", "patch"])
async def test_real_langchain_chain_over_mocked_openai_http(mode, kind):
    """Exercise LangChain/OpenAI serialization and parsing, not just a mocked model."""
    get_settings().llm_output_mode = mode
    data = (
        diagnosis(1048)
        if kind == "diagnosis"
        else {
            "status": "ready",
            "summary": "Use Python",
            "explanation": "The image must provide Python.",
            "edits": [{"old_text": "image: alpine:3.21", "new_text": "image: python:3.12-slim"}],
            "verification_steps": ["Rerun the job."],
            "limitations": [],
            "fixes_tested": False,
        }
    )
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "id": "fixture-completion",
                "object": "chat.completion",
                "created": 1,
                "model": "gpt-4.1-mini",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": json.dumps(data)},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 100, "completion_tokens": 100, "total_tokens": 200},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        model = ChatOpenAI(
            model="gpt-4.1-mini",
            api_key="fixture-not-a-real-key",
            http_async_client=http,
            max_retries=0,
        )
        if kind == "diagnosis":
            result = await Diagnostician(model).analyze(
                job={"name": "build", "status": "failed"},
                pipeline={"id": 1},
                logs="token=never-transmit\n" + data["evidence"][0],
                ci=None,
                context="",
            )
        else:
            result = await PatchGenerator(model).propose(
                diagnosis=diagnosis(1043),
                ci="image: alpine:3.21\n# token=never-transmit",
                base_sha="a" * 40,
            )
    assert result.summary == data["summary"]
    assert len(requests) == 1
    if mode == "json_schema":
        assert requests[0]["response_format"]["type"] == "json_schema"
        schema = requests[0]["response_format"]["json_schema"]["schema"]
        assert set(schema["required"]) == set(schema["properties"])
        assert schema["additionalProperties"] is False
        assert "default" not in schema["properties"]["fixes_tested"]
    else:
        assert not {"response_format", "tools", "tool_choice"}.intersection(requests[0])
        assert '"fixes_tested"' in requests[0]["messages"][0]["content"]
    assert "never-transmit" not in json.dumps(requests[0])
