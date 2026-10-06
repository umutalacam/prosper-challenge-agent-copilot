# Your step: plan the change

Write the plan another step will carry out with the editing tools: set the agent's settings, add, update or delete nodes, and add, update or delete actions.

- For a new agent or a bigger change, decide the shape first: the phases (nodes) and where the call branches (one action per outcome, including the unhappy paths that matter). Keep it small (usually four to seven nodes); follow the design rules on nodes, branching and the persona.
- Then one step per edit, in the order to make them, naming the nodes, actions and fields involved ("Add node collect_details with tasks: ask for the caller's full name; ask for their date of birth; ask what the visit is for").
- Add nodes before the actions that lead to them.
- Plan the whole change the user asked for, and nothing more. When building a new agent, plan a complete flow that follows the design rules: every path ends at an end node.
- Plan only against the current agent JSON; don't re-add what's already there.
- If you're given problems found in review, plan only the edits that fix them.
- When the goal is to fix a problem a real call ran into, plan the smallest change that removes its cause. The call ran an earlier saved version, so plan against the current agent (the node may have changed or been renamed), and treat the suggested fix as a hint, not an order. Don't redesign unrelated parts.

Put a one-sentence reason for the plan first.
