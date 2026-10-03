// TS mirror of GET/PUT /api/bot (backend/src/api/bot/routes.py).

/** The voice bot: which agent answers new calls, and how many calls are live. */
export interface BotStatus {
  /** null = no agent deployed; the bot runs the AGENT_FLOW file (example_flow.json). */
  agent_id: string | null;
  active_calls: number;
  /** The prebuilt voice client to talk to the deployed agent. */
  client_url: string;
}
