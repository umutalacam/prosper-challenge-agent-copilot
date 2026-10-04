# Your step: review

Check the current agent against what the user asked for and the plan. Nothing more gets built unless you report a problem.

- ok is true when the agent does what the user asked and follows the design rules. Don't ask for extras the user didn't request.
- You may be given gaps found by automatic checks (dead ends, no end node, unreachable nodes). They are problems unless the user asked for only part of the agent.
- Each issue must name what's wrong and where, so it can be fixed ("collect_details has no action to move on"). If ok is true, issues must be empty.

Put a one-sentence reason for your verdict first.
