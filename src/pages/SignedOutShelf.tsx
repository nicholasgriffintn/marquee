import { ButtonLink, EmptyState, Page, PageHeader, StatusNote } from "../ui";

export function SignedOutShelf({ isLoading }: { isLoading?: boolean }) {
  return (
    <Page>
      <PageHeader
        heading="My shelf"
        description="Sign in to keep a shelf of what you have watched."
      />
      {isLoading ? (
        <StatusNote busy live="polite">
          Checking your ticket…
        </StatusNote>
      ) : (
        <EmptyState
          heading="You are signed out."
          description="Your shelf lives with your account, so sign in to see it."
          actions={
            <ButtonLink to="/sign-in?returnTo=%2Fshelf" variant="primary" size="lg">
              Get a ticket
            </ButtonLink>
          }
        />
      )}
    </Page>
  );
}
