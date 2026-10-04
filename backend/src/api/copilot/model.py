#
# CopilotModel — the only code that talks to OpenAI. Nodes call it in one of three
# ways: decide (a JSON answer matching a strict schema), say (plain text) or act
# (a message that may call tools).
#

import json
from typing import Any


class CopilotError(Exception):
    """The turn can't go on (a refusal, an unreadable answer, a broken graph)."""


class CopilotModel:
    def __init__(self, client: Any, model: str) -> None:
        self._client = client  # an openai.AsyncOpenAI (or a stand-in with the same call)
        self._model = model

    async def decide(self, chat: list[dict[str, Any]], name: str, schema: dict[str, Any]) -> dict[str, Any]:
        """A JSON answer that matches `schema` (structured outputs, strict mode)."""
        message = await self._create(
            chat,
            response_format={"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}},
        )
        if getattr(message, "refusal", None):
            raise CopilotError(f"The model refused: {message.refusal}")
        try:
            answer = json.loads(message.content or "")
        except json.JSONDecodeError as error:
            raise CopilotError(f"The model's {name} answer wasn't valid JSON.") from error
        if not isinstance(answer, dict):
            raise CopilotError(f"The model's {name} answer wasn't a JSON object.")
        return answer

    async def say(self, chat: list[dict[str, Any]]) -> str:
        """A plain-text answer."""
        message = await self._create(chat)
        return message.content or ""

    async def act(self, chat: list[dict[str, Any]], tools: list[dict[str, Any]]) -> Any:
        """The model's message, which may call `tools` (message.tool_calls)."""
        return await self._create(chat, tools=tools)

    async def _create(self, chat: list[dict[str, Any]], **options: Any) -> Any:
        response = await self._client.chat.completions.create(model=self._model, messages=chat, **options)
        return response.choices[0].message
