import { errorMessage, useAgentList, useBotStatus, useDeployAgent } from "@/shared/api";
import { useNow } from "@/shared/hooks/useNow";
import { Banner, BrandLogo, ButtonLink, EmptyState } from "@/shared/ui";
import { AgentList } from "./components/AgentList/AgentList";
import { AgentPrompt } from "./components/AgentPrompt/AgentPrompt";
import { BotStatusLine } from "./components/BotStatusLine/BotStatusLine";
import styles from "./AgentListPage.module.scss";

const CLOCK_TICK_MS = 60_000;

/**
 * Route: / — the home page. The Prosper logo, a prompt box that starts a new agent
 * with the copilot, then every agent: which one answers calls, how much each is
 * used, and deploying.
 */
export function AgentListPage() {
  const agents = useAgentList();
  const bot = useBotStatus();
  const deploy = useDeployAgent();
  const now = useNow(CLOCK_TICK_MS);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <BrandLogo product="Agent Composer" centered />
          <h1 className={styles.title}>
            Build voice agents <span className={styles.titleAccent}>with a single prompt</span>
          </h1>
          <p className={styles.lede}>
            Describe the agent in plain English. The copilot builds its conversation graph live on
            the canvas — then test it with a call and deploy.
          </p>
        </header>

        <AgentPrompt />

        <section className={styles.agents} aria-labelledby="agents-heading">
          <div className={styles.agentsHeader}>
            <div>
              <h2 id="agents-heading" className={styles.heading}>
                Your agents
              </h2>
              {agents.data && (
                <p className={styles.count}>
                  {agents.data.length} {agents.data.length === 1 ? "agent" : "agents"}
                </p>
              )}
            </div>
            <ButtonLink to="/agents/new" size="sm">
              + Blank agent
            </ButtonLink>
          </div>

          <BotStatusLine
            status={bot.data}
            error={bot.isError ? errorMessage(bot.error) : null}
            agents={agents.data}
          />

          {deploy.isError && (
            <Banner
              onDismiss={() => {
                deploy.reset();
              }}
            >
              Couldn't deploy: {errorMessage(deploy.error)}
            </Banner>
          )}

          {agents.isPending ? (
            <EmptyState title="Loading agents…" />
          ) : agents.isError ? (
            <EmptyState
              title="Agent API unavailable"
              description={`Start it with \`make api\` (or \`make dev\`), then reload. (${errorMessage(agents.error)})`}
            />
          ) : agents.data.length === 0 ? (
            <EmptyState
              title="No agents yet"
              description="Describe one above and the copilot builds it, or start from a blank agent."
            />
          ) : (
            <AgentList
              agents={agents.data}
              deployed={
                bot.data?.agent_id && bot.data.version != null
                  ? { agentId: bot.data.agent_id, version: bot.data.version }
                  : null
              }
              deployingAgentId={deploy.isPending ? deploy.variables : null}
              onDeploy={(agentId) => {
                deploy.mutate(agentId);
              }}
              now={now}
            />
          )}
        </section>
      </div>
    </div>
  );
}
