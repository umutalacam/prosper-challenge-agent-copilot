#
# FixNode — the start of a fix turn: the user clicked "Fix with copilot" on a
# finding of a call's AI analysis (api/calls/copilot_analyzer.py). The finding
# already says what went wrong and what to change, so there's nothing to ask the
# model here: it becomes the turn's goal, and the build loop takes over —
# planner → executor → reviewer → wrap_up, as for any build. Unlike a typed
# build, the goal isn't shown: the editor's fix card already shows the finding.
#

from collections.abc import AsyncIterator

from api.copilot.nodes.base import CopilotNode
from api.copilot.turn import Event, Turn


class FixNode(CopilotNode):
    name = "fix"
    activity = "Reading the finding…"

    async def run(self, turn: Turn) -> AsyncIterator[Event]:
        yield self._activity()
        turn.intent = "build"  # so wrap_up checks the agent is still valid
        turn.goal = FixNode.goal_of(turn.fix or {})

    def next(self, turn: Turn) -> str | None:
        return "planner"

    @staticmethod
    def goal_of(finding: dict) -> str:
        """The turn's goal, one self-contained sentence the planner and reviewer work from.

        :param finding: ``{node, cause, suggestion}`` from the call analysis.
        :return: The goal.
        """
        where = f" in node '{finding['node']}'" if finding.get("node") else ""
        goal = f"Fix a problem a real call ran into{where}: {finding.get('cause', '').strip()}"
        suggestion = (finding.get("suggestion") or "").strip()
        return f"{goal} Suggested fix: {suggestion}" if suggestion else goal
