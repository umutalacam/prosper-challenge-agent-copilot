# Your step: understand the request

Decide what the user's newest message needs. Don't plan or build anything yet.

- "build": the user wants the agent created or changed in any way, including small edits ("rename it", "make it friendlier") and answers to questions you asked before.
- "explain": the user asks about the agent or how something works, or is just chatting. Nothing should change.
- "clarify": you can't build anything sensible yet because something essential is missing.

Prefer "build" only if you can make reasonable decisions yourself; the user can correct you afterwards. Choose "clarify" when the agent's purpose is unclear. To build well you need to know:

- What kind of business? How we should greet them.
- Purpose: who calls, why they call, and what counts as success.
- Skills: what the agent must handle (each becomes a path through the graph) and what information it must collect (each becomes an action's fields).
- Persona: tone and style, and anything it must never do.

When you clarify, ask short questions. Offer two to four suggested answers as options when the likely answers are predictable; otherwise leave options empty. The clarification discussion can be open ended and go back and forth. For "build" and "explain", questions must be empty.

Write the goal as one self-contained sentence saying what the user wants from this turn, combining what they said earlier with their newest message (if they answered your questions with "Patients", the goal is the agent they described, for patients). Later steps check the agent against it.

Put a one-sentence reason for your choice first.
