import { ButtonLink, Heading, Page, Text } from "../../ui";
import { UsherMark } from "./UsherMark";

import styles from "./ManagersDoor.module.css";

export function ManagersDoor() {
  return (
    <Page className={styles.office}>
      <div className={styles.inner}>
        <div className={styles.door} aria-hidden="true">
          <div className={styles.glass}>
            <p className={styles.name}>Manager</p>
            <p className={styles.sub}>Knock and wait</p>
          </div>
          <p className={styles.note}>
            Back in
            <br />
            ten minutes
          </p>
          <span className={styles.handle} />
        </div>

        <div className={styles.copy}>
          <Heading level={1} size="heading">
            Manager&apos;s office.
          </Heading>
          <Text tone="muted" className={styles.lede}>
            This part of the building is not yours. The screens are the other way.
          </Text>

          <div className={styles.aside}>
            <UsherMark face="unimpressed" crop="head" className={styles.mark} />
            <Text family="serif" italic className={styles.asideLine}>
              He is not in. He is never in.
            </Text>
          </div>

          <ButtonLink to="/" variant="primary" size="lg">
            Back to tonight
          </ButtonLink>
        </div>
      </div>
    </Page>
  );
}
