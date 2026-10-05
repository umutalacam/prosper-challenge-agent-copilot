// TS mirror of GET/PUT /api/bot (backend/src/api/bot/routes.py).

/** The voice bot: which agent version is deployed, and how many calls are live. */
export interface BotStatus {
  /** The deployed agent; null = nothing deployed, so calls are refused. */
  agent_id: string | null;
  /** The deployed (pinned) version; later saves need a redeploy to reach callers. */
  version: number | null;
  /** When it was deployed (ISO 8601). */
  deployed_at: string | null;
  active_calls: number;
  /** The prebuilt voice client to talk to the deployed agent. */
  client_url: string;
}
