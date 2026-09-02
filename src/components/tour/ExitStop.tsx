import { ButtonLink, TextLink } from "../../ui";

import styles from "./ExitStop.module.css";

const MCP_SNIPPET = `{
  "mcpServers": {
    "marquee": {
      "url": "https://marquee.pashi.app/mcp",
      "headers": { "Authorization": "Bearer mq_your_token" }
    }
  }
}`;

export function ExitStop({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <div className={styles.exit}>
      <div className={styles.ways}>
        <div className={styles.way}>
          <p className={styles.head}>For people</p>
          <p className={styles.body}>
            Tell him what you pay for and the shelves narrow to what you can actually press play on.
          </p>
          <ButtonLink to={isSignedIn ? "/" : "/sign-in?returnTo=%2F"} variant="primary" size="lg">
            {isSignedIn ? "Find your seat" : "Get a ticket"}
          </ButtonLink>
        </div>

        <div className={styles.way}>
          <p className={styles.head}>For agents</p>
          <p className={styles.body}>
            Nine tools over MCP, scoped one per tool, and nothing writes without confirming first.
          </p>
          <pre className={styles.snippet}>
            <code>{MCP_SNIPPET}</code>
          </pre>
        </div>

        <div className={styles.way}>
          <p className={styles.head}>For everywhere else</p>
          <p className={styles.body}>
            Cut a key on the notebook and what is coming turns up in your calendar and your reader
            instead.
          </p>
          <ul className={styles.links}>
            <li>
              <TextLink to="/notebook">The notebook</TextLink>
            </li>
            <li>
              <TextLink to="/revival">The revival house</TextLink>
            </li>
            <li>
              <TextLink to="/usher">How he got the job</TextLink>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
