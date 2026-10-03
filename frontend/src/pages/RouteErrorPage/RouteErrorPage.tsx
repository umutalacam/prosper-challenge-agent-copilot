import { isRouteErrorResponse, useRouteError } from "react-router";
import { errorMessage } from "@/shared/api";
import { ButtonLink, EmptyState } from "@/shared/ui";
import styles from "./RouteErrorPage.module.scss";

/** Router error boundary: catches render errors anywhere below it. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : errorMessage(error);

  return (
    <div className={styles.page}>
      <EmptyState
        title="Something went wrong"
        description={message}
        action={
          <ButtonLink to="/" variant="primary" reloadDocument>
            Reload
          </ButtonLink>
        }
      />
    </div>
  );
}
