import type { CallIssueKind } from "@/shared/types/call";

/** How an issue group reads, in the Issues pane and on its copilot card: what happened and where. */
export function groupLabel({ kind, node }: { kind: CallIssueKind; node: string | null }): string {
  const where = node ? ` in ${node}` : "";
  switch (kind) {
    case "stuck":
      return `Stuck${where}`;
    case "error":
      return `Errors${where}`;
    case "long_stay":
      return `Long stays${where}`;
  }
}
