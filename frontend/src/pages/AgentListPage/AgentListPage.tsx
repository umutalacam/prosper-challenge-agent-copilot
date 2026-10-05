import { errorMessage, useAgentList, useBotStatus, useDeployAgent } from "@/shared/api";
import { Banner, BrandLogo, ButtonLink, EmptyState } from "@/shared/ui";
import { AgentTable } from "./components/AgentTable/AgentTable";
import { BotStatusCard } from "./components/BotStatusCard/BotStatusCard";
import styles from "./AgentListPage.module.scss";

/** Route: / — every agent, which version the voice bot answers with, and deploying. */
export function AgentListPage() {
  const agents = useAgentList();
  const bot = useBotStatus();
  const deploy = useDeployAgent();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <BrandLogo product="Agent Composer" />
          <ButtonLink to="/agents/new" variant="primary">
            + New agent
          </ButtonLink>
        </header>

        <BotStatusCard
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

        <section className={styles.section} aria-labelledby="agents-heading">
          <h1 id="agents-heading" className={styles.heading}>
            Agents
          </h1>
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
              description="An agent is a graph of conversation nodes connected by actions."
              action={
                <ButtonLink to="/agents/new" variant="primary">
                  Create your first agent
                </ButtonLink>
              }
            />
          ) : (
            <AgentTable
              agents={agents.data}
              deployed={
                bot.data?.agent_id && bot.data.version != null
                  ? { agentId: bot.data.agent_id, version: bot.data.version }
                  : null
              }
              clientUrl={bot.data?.client_url}
              deployingAgentId={deploy.isPending ? deploy.variables : null}
              onDeploy={(agentId) => {
                deploy.mutate(agentId);
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}
