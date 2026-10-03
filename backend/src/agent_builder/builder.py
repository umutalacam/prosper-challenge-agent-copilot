#
# AgentBuilder — loads a declarative agent (JSON / dict) and compiles its node
# graph into Pipecat Flows objects.
#
#   JSON  ->  AgentConfig (validated)  ->  Pipecat Flows NodeConfig graph
#
# This is the seam between "agent as data" (what the Phase 2 Composer produces)
# and "agent as a running conversation" (what the voice pipeline, api/bot/pipeline.py, executes). Keeping the
# compile + validation here means the pipeline never touches the graph internals.
#

import json
from pathlib import Path
from typing import Union

from loguru import logger
from pipecat_flows import FlowManager, FlowsFunctionSchema, NodeConfig

from .schema import AgentConfig, Edge, Node


class AgentBuilder:
    """Builds a runnable Pipecat Flows graph from a declarative AgentConfig."""

    def __init__(self, config: AgentConfig):
        self.config = config
        self._nodes_by_name = {n.name: n for n in config.nodes}
        self._validate()

    # ---- loading -----------------------------------------------------------
    @classmethod
    def from_dict(cls, data: dict) -> "AgentBuilder":
        return cls(AgentConfig.from_dict(data))

    @classmethod
    def from_json(cls, path: Union[str, Path]) -> "AgentBuilder":
        data = json.loads(Path(path).read_text())
        return cls.from_dict(data)

    # ---- validation --------------------------------------------------------
    def _validate(self) -> None:
        names = set(self._nodes_by_name)
        if not names:
            raise ValueError("Agent has no nodes.")
        if len(names) != len(self.config.nodes):
            raise ValueError("Node names must be unique.")
        if self.config.initial_node not in names:
            raise ValueError(
                f"initial_node '{self.config.initial_node}' is not a defined node."
            )
        for node in self.config.nodes:
            # An end node finishes the call, so it can't lead anywhere.
            if node.end and node.edges:
                raise ValueError(
                    f"End node '{node.name}' can't have actions "
                    f"({', '.join(edge.function for edge in node.edges)}); it ends the call."
                )
            functions = [edge.function for edge in node.edges]
            if len(functions) != len(set(functions)):
                raise ValueError(
                    f"Action names in node '{node.name}' must be unique."
                )
            for edge in node.edges:
                if edge.target not in names:
                    raise ValueError(
                        f"Edge '{edge.function}' in node '{node.name}' targets "
                        f"unknown node '{edge.target}'."
                    )
                if edge.target == node.name:
                    raise ValueError(
                        f"Edge '{edge.function}' in node '{node.name}' leads back to "
                        f"'{node.name}'; an action must move to another node."
                    )
                # The start node is where every call begins; nothing leads back into it.
                if edge.target == self.config.initial_node:
                    raise ValueError(
                        f"Edge '{edge.function}' in node '{node.name}' targets the "
                        f"start node '{edge.target}'; nothing can lead into the start node."
                    )

    # ---- compilation -------------------------------------------------------
    def build_initial_node(self) -> NodeConfig:
        """Return the entry NodeConfig; downstream nodes are built lazily on transition."""
        return self._make_node(self._nodes_by_name[self.config.initial_node])

    def _make_node(self, node: Node) -> NodeConfig:
        node_config: NodeConfig = {
            "name": node.name,
            "role_message": node.role_message or self.config.persona,
            "task_messages": node.task_messages,
            "functions": [self._make_edge_function(edge) for edge in node.edges],
        }
        if node.pre_actions:
            node_config["pre_actions"] = node.pre_actions
        # Explicit post_actions win; otherwise a terminal node ends the call.
        if node.post_actions:
            node_config["post_actions"] = node.post_actions
        elif node.end:
            node_config["post_actions"] = [{"type": "end_conversation"}]
        return node_config

    def _make_edge_function(self, edge: Edge) -> FlowsFunctionSchema:
        async def handler(args: dict, flow_manager: FlowManager):
            # Persist what the caller gave us so later nodes can use it.
            flow_manager.state.update(args)
            logger.info(f"[{edge.function}] -> {edge.target} | collected: {args}")
            next_node = self._make_node(self._nodes_by_name[edge.target])
            return {"status": "success", **args}, next_node

        return FlowsFunctionSchema(
            name=edge.function,
            description=edge.description,
            properties=edge.properties,
            required=edge.required,
            handler=handler,
        )
