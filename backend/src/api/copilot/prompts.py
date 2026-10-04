#
# PromptLibrary — the copilot's config folder (backend/config/copilot/): each
# node's prompt, the executor's tools and the deciding nodes' answer schemas.
# Every file is read on use, so edits apply on the next turn without a restart.
#
#   shared.md      what every node knows: how agents work, the design rules
#   <node>.md      that node's job, appended to shared.md
#   tools.json     the executor's tools, in OpenAI's function-tool format
#   schemas.json   {node: JSON Schema} for the nodes that answer in JSON
#

import json
from pathlib import Path
from typing import Any

from api.copilot.turn import Turn


class PromptLibrary:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def system(self, node: str) -> str:
        return self._read("shared.md") + "\n\n" + self._read(f"{node}.md")

    def tools(self) -> list[dict[str, Any]]:
        return json.loads(self._read("tools.json"))

    def schema(self, node: str) -> dict[str, Any]:
        return json.loads(self._read("schemas.json"))[node]

    def chat(self, node: str, turn: Turn, context: str | None = None) -> list[dict[str, Any]]:
        """The messages for one of `node`'s model calls, with `context` from earlier nodes last."""
        snapshot = {
            "role": "developer",
            "content": "The current agent, as it is in the editor now:\n```json\n"
            + json.dumps(turn.agent, indent=2)
            + "\n```",
        }
        # The snapshot goes right before the newest prompt, so it's the freshest context.
        chat = [{"role": "system", "content": self.system(node)}, *turn.messages[:-1], snapshot, turn.messages[-1]]
        if context:
            chat.append({"role": "developer", "content": context})
        return chat

    def _read(self, name: str) -> str:
        return (self.directory / name).read_text()
