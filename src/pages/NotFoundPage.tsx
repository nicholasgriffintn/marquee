import { UsherMark } from "../components/usher/UsherMark";
import { ButtonLink, EmptyState, Page, PageHeader, TextLink } from "../ui";

import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  return (
    <Page>
      <PageHeader heading="Not found" description="That page does not exist." />
      <EmptyState
        mark={<UsherMark face="unimpressed" crop="head" className={styles.mark} />}
        heading="Wrong door."
        description="Nothing showing down here. The screens are the other way."
        actions={
          <>
            <ButtonLink to="/" variant="primary" size="lg">
              Back to tonight
            </ButtonLink>
            <TextLink to="/usher" variant="aside">
              Who are you, anyway?
            </TextLink>
          </>
        }
      />
    </Page>
  );
}
