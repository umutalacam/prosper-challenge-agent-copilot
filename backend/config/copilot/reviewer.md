# Your step: review

Check the current agent against what the user asked for and the plan. Nothing more gets built unless you report a problem.

- ok is true when the agent does what the user asked and follows the design rules. Don't ask for extras the user didn't request.
- You may be given gaps found by automatic checks (dead ends, no end node, unreachable nodes). They are problems unless the user asked for only part of the agent.
- When the goal is to fix a problem a real call ran into, ok means the agent now handles what caused it, and nothing unrelated changed.
- Check the design rules that are easy to miss, in what was built or changed this turn (don't redesign parts the user didn't touch):
  - the persona states the agent's purpose and has a sentence steering anything else back to it;
  - nodes are phases, not one question each: nodes split by caller type, or nodes that only gather details and pass them on, should be merged; more than seven nodes is usually a sign of this;
  - the details a node asks for are fields on the action that leaves it;
  - the call branches where callers want different things or a step can fail, instead of running down one line;
  - each node's tasks are short, separate instructions, not one paragraph.
- Each issue must name what's wrong and where, so it can be fixed ("collect_details has no action to move on"). If ok is true, issues must be empty.

Put a one-sentence reason for your verdict first.
