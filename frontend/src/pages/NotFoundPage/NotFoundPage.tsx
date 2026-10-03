import { ButtonLink, EmptyState } from "@/shared/ui";

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="This address doesn't match any page."
      action={
        <ButtonLink to="/" variant="primary">
          Go to agents
        </ButtonLink>
      }
    />
  );
}
