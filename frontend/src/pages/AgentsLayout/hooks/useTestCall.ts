import { useDeployAgent } from "@/shared/api";

/**
 * Test call: deploy the agent to the voice bot, then open the voice client in a
 * new tab. Resolves once the tab is pointed at the client; rejects (tab closed)
 * if the deploy fails.
 */
export function useTestCall() {
  const deploy = useDeployAgent();

  const start = async (agentId: string): Promise<void> => {
    // Open the tab now, while still inside the click: browsers block window.open
    // after an await. It's pointed at the client once the deploy lands.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const { client_url } = await deploy.mutateAsync(agentId);
      if (tab) tab.location.href = client_url;
      else window.open(client_url, "_blank", "noopener");
    } catch (error) {
      tab?.close();
      throw error;
    }
  };

  return { start, pending: deploy.isPending, error: deploy.error, reset: deploy.reset };
}
