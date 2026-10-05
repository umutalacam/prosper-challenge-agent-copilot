import type { CallFinding } from "@/shared/types/call";

/**
 * A finding's identity within a call: where and why. Stable while the analysis
 * stands, new when a rerun (after a flag) writes different findings.
 */
export function findingKey({ node, cause }: Pick<CallFinding, "node" | "cause">): string {
  return `${node ?? ""}\n${cause}`;
}
