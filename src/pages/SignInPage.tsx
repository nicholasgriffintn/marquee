import { AuthFlow, AuthProvider, type ExternalAuthProvider } from "@ngriffin_uk/auth-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { UsherMark } from "../components/usher/UsherMark";
import { requestJson } from "../lib/api";

const CLASS_NAMES = {
  signIn: "box-office-flow",
  title: "box-office-title",
  description: "box-office-description",
  providerList: "box-office-providers",
  providerButton: "box-office-provider",
  separator: "box-office-separator",
  error: "box-office-error",
  status: "box-office-status",
  form: "box-office-form",
  field: "box-office-field",
  label: "box-office-label",
  input: "box-office-input",
  inputContainer: "box-office-input-wrap",
  inputIcon: "box-office-input-icon",
  button: "box-office-provider",
  magicLinkButton: "box-office-provider",
  linkButton: "box-office-link",
  actions: "box-office-actions",
} as const;

export function SignInPage({
  isSignedIn,
  isSessionLoading,
}: {
  isSignedIn: boolean;
  isSessionLoading: boolean;
}) {
  const [params] = useSearchParams();
  const [methods, setMethods] = useState<{
    providers: ExternalAuthProvider[];
    magicLink: boolean;
  } | null>(null);
  const returnTo = params.get("returnTo") ?? "/";

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<{
          providers: ExternalAuthProvider[];
          magicLink: boolean;
        }>("/api/auth/methods", { signal: controller.signal });

        setMethods(response);
      } catch {
        setMethods({ providers: [], magicLink: false });
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  return (
    <section className="page-section box-office">
      <div className="box-office-bulbs" aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => (
          <i key={index} className={index === 6 ? "dead" : ""} />
        ))}
      </div>

      <div className="box-office-inner">
        <div className="box-office-figure" aria-hidden="true">
          <UsherMark face={isSignedIn ? "pleased" : "idle"} className="usher-figure" />
        </div>

        <div className="box-office-window">
          <p className="box-office-eyebrow">
            <span>Box office</span>
            <em>Open all hours</em>
          </p>

          {isSignedIn ? (
            <div className="box-office-body">
              <h1>You already have a ticket.</h1>
              <p className="box-office-line">Same seat as last time. Nobody has moved it.</p>
              <Link className="button-link" to={returnTo}>
                Go on through
              </Link>
            </div>
          ) : (
            <div className="box-office-body">
              <h1>Admit one.</h1>
              <p className="box-office-line">
                Tickets are free. I only need to know whose seat it is, so I can keep your shelf and
                stop offering you things you have already seen.
              </p>

              {isSessionLoading || methods === null ? (
                <p className="box-office-status">Opening the window…</p>
              ) : methods.providers.length === 0 && !methods.magicLink ? (
                <p className="box-office-error">
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

              <p className="box-office-small">
                We keep your name and avatar, nothing else. Your shelf stays yours.
              </p>
            </div>
          )}

          <p className="box-office-stub" aria-hidden="true">
            <span>Admit one</span>
            <em>Marquee · est. 1974</em>
          </p>
        </div>
      </div>
    </section>
  );
}
