import { Outlet } from "react-router";
import { AppMenu } from "./components/AppMenu/AppMenu";
import styles from "./AgentsLayout.module.scss";

/**
 * The editor's shell: the routed page fills the viewport (the canvas runs edge to
 * edge) and the hamburger menu floats over its top-left corner.
 */
export function AgentsLayout() {
  return (
    <div className={styles.layout}>
      <AppMenu />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
