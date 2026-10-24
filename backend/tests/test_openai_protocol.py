import json

import httpx
from langchain_openai import ChatOpenAI

from app.ai.diagnostician import Diagnostician
from app.services.demo import diagnosis


async def test_real_langchain_chain_over_mocked_openai_http():
    """Exercise LangChain/OpenAI serialization and parsing, not just a mocked model."""
    data = diagnosis(1048)
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
        result = await Diagnostician(model).analyze(
            job={"name": "build", "status": "failed"},
            pipeline={"id": 1},
            logs="token=never-transmit\n" + data["evidence"][0],
            ci=None,
            context="",
        )
    assert result.summary == "Dockerfile not found"
    assert requests[0]["response_format"]["type"] == "json_schema"
    schema = requests[0]["response_format"]["json_schema"]["schema"]
    assert set(schema["required"]) == set(schema["properties"])
    assert schema["additionalProperties"] is False
    assert "default" not in schema["properties"]["fixes_tested"]
    assert "never-transmit" not in json.dumps(requests[0])
