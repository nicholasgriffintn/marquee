import { AuthFlow, AuthProvider, type ExternalAuthProvider } from "@ngriffin_uk/auth-react";
import { Link, useSearchParams } from "react-router-dom";

import { UsherMark } from "../components/usher/UsherMark";
import { useResource } from "../hooks/useResource";
import { classNames } from "../lib/class-names";
import { ButtonLink, Heading, Page, Text } from "../ui";

import styles from "./SignInPage.module.css";

const CLASS_NAMES = {
  signIn: styles.flow,
  title: styles.hiddenTitle,
  description: styles.hiddenTitle,
  providerList: styles.providers,
  providerButton: styles.provider,
  separator: styles.separator,
  error: styles.error,
  status: styles.status,
  form: styles.form,
  field: styles.field,
  label: styles.label,
  input: styles.input,
  inputContainer: styles.inputWrap,
  inputIcon: styles.inputIcon,
  button: styles.provider,
  magicLinkButton: styles.provider,
  linkButton: styles.link,
  actions: styles.actions,
} as const;

export function SignInPage({
  isSignedIn,
  isSessionLoading,
}: {
  isSignedIn: boolean;
  isSessionLoading: boolean;
}) {
  const [params] = useSearchParams();
  const { data, error } = useResource<{
    providers: ExternalAuthProvider[];
    magicLink: boolean;
  }>("/api/auth/methods");
  const methods = data ?? (error ? { providers: [], magicLink: false } : null);
  const returnTo = params.get("returnTo") ?? "/";

  return (
    <Page className={styles.page}>
      <div className={styles.bulbs} aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => (
          <i key={index} className={classNames(index === 6 && styles.dead)} />
        ))}
      </div>

      <div className={styles.inner}>
        <div className={styles.figure} aria-hidden="true">
          <UsherMark face={isSignedIn ? "pleased" : "idle"} className={styles.figureMark} />
        </div>

        <div className={styles.window}>
          <p className={styles.eyebrow}>
            <span>Box office</span>
            <em>Open all hours</em>
          </p>

          {isSignedIn ? (
            <div className={styles.body}>
              <Heading level={1} size="title" family="serif" tone="ink" className={styles.title}>
                You already have a ticket.
              </Heading>
              <Text tone="ink" className={styles.line}>
                Same seat as last time. Nobody has moved it.
              </Text>
              <ButtonLink to={returnTo} variant="primary" size="lg">
                Go on through
              </ButtonLink>
            </div>
          ) : (
            <div className={styles.body}>
              <Heading level={1} size="title" family="serif" tone="ink" className={styles.title}>
                Admit one.
              </Heading>
              <Text tone="ink" className={styles.line}>
                Tickets are free. I only need to know whose seat it is, so I can keep your shelf and
                stop offering you things you have already seen.
              </Text>

              {isSessionLoading || methods === null ? (
                <p className={styles.status}>Opening the window…</p>
              ) : methods.providers.length === 0 && !methods.magicLink ? (
                <p className={styles.error}>
                  The window is shut. No sign-in method is configured on this deployment.
                </p>
              ) : (
                <AuthProvider
                  config={{
                    endpoint: "/api/auth",
                    capabilities: {
                      magicLink: methods.magicLink,
                      password: false,
                      passkeys: false,
                      signUp: false,
                      recovery: false,
                      signOut: false,
                    },
                    // oxlint-disable-next-line no-map-spread -- a handful of auth providers, spread is clearest
                    providers: methods.providers.map((provider) => ({
                      ...provider,
                      values: { returnTo },
                    })),
                    classNames: CLASS_NAMES,
                    copy: {
                      signInTitle: "",
                      signInDescription: "",
                      signInSeparator: "or",
                      magicLinkSubmit: "Post me a ticket",
                    },
                    onRedirect: (url) => {
                      window.location.href = url;
                    },
                    mapError: () =>
                      "That did not work. Try again, or come back when the queue has gone.",
                  }}
                >
                  <AuthFlow />
                </AuthProvider>
              )}

              <p className={styles.small}>
                Signing in lets Marquee keep your shelf, ratings, notes and viewing preferences. By
                continuing, you agree to the <Link to="/terms">terms of use</Link> and acknowledge
                the <Link to="/privacy">privacy policy</Link>.
              </p>
            </div>
          )}

          <p className={styles.stub} aria-hidden="true">
            <span>Admit one</span>
            <em>Marquee · est. 1974</em>
          </p>
        </div>
      </div>
    </Page>
  );
}
