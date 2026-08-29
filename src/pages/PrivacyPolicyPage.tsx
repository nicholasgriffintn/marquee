import { Link } from "react-router-dom";

import { Heading, Page } from "../ui";

import styles from "./LegalPage.module.css";

const UPDATED = "28 August 2026";

export function PrivacyPolicyPage() {
  return (
    <Page as="article" className={styles.page} labelledBy="privacy-title">
      <header className={styles.masthead}>
        <div>
          <Heading
            level={1}
            size="display"
            family="serif"
            tone="ink"
            id="privacy-title"
            className={styles.title}
          >
            Privacy policy.
          </Heading>
          <p className={styles.standfirst}>
            What Marquee remembers, why it remembers it, and how you stay in control.
          </p>
        </div>

        <aside className={styles.summary} aria-label="Privacy policy summary">
          <strong>The short version</strong>
          <p>
            Marquee uses your information to keep your shelf, shape recommendations, send the alerts
            you ask for, and keep the service working safely. It does not sell personal information
            or use it for advertising.
          </p>
          <span className={styles.updated}>Last updated {UPDATED}</span>
        </aside>
      </header>

      <div className={styles.layout}>
        <nav className={styles.contents} aria-label="Privacy policy contents">
          <strong>On this page</strong>
          <ol>
            <li>
              <a href="#who">Who is responsible</a>
            </li>
            <li>
              <a href="#data">Information we use</a>
            </li>
            <li>
              <a href="#purposes">Why we use it</a>
            </li>
            <li>
              <a href="#ai">AI and profiling</a>
            </li>
            <li>
              <a href="#sharing">Who receives it</a>
            </li>
            <li>
              <a href="#storage">Cookies and storage</a>
            </li>
            <li>
              <a href="#retention">How long we keep it</a>
            </li>
            <li>
              <a href="#rights">Your rights</a>
            </li>
            <li>
              <a href="#children">Children</a>
            </li>
            <li>
              <a href="#changes">Changes and contact</a>
            </li>
          </ol>
        </nav>

        <div className={styles.copy}>
          <section className={styles.section} id="who">
            <h2>1. Who is responsible</h2>
            <p>
              Marquee is a film and television discovery and watch-tracking service operated in the
              United Kingdom by Nicholas Griffin. Nicholas Griffin is the controller of the personal
              information described in this policy.
            </p>
            <p>
              For privacy questions or requests, email{" "}
              <a href="mailto:me@nicholasgriffin.co.uk">me@nicholasgriffin.co.uk</a>. You can also
              read the <Link to="/terms">terms of use</Link> that apply to the service.
            </p>
          </section>

          <section className={styles.section} id="data">
            <h2>2. Information we use</h2>

            <h3>Account and sign-in details</h3>
            <p>
              If you use an email sign-in link, Marquee stores your email address and creates a
              display name from the part before the @ sign. If you sign in with GitHub, GitHub
              provides your account ID, username, display name and avatar. Marquee does not ask for
              access to your repositories. It also stores protected records for sign-in sessions and
              any API or feed keys you create.
            </p>

            <h3>Your shelf and preferences</h3>
            <p>Depending on the features you use, this can include:</p>
            <ul>
              <li>
                titles and episodes you save, their status, ratings, notes, progress and dates;
              </li>
              <li>streaming services, genres, people and other viewing preferences you select;</li>
              <li>
                curator requests, answers to the Usher, recommendation feedback, pinned shelves and
                preferences Marquee infers from your activity;
              </li>
              <li>alert choices, followed people, calendar and feed subscriptions; and</li>
              <li>names and viewing preferences you choose to record for people you watch with.</li>
            </ul>

            <h3>Imports and connected services</h3>
            <p>
              If you connect Trakt, Marquee receives your Trakt username, watch history, ratings,
              watchlist and upcoming calendar data. It stores encrypted access credentials so it can
              sync when you ask. If you import a Letterboxd CSV, the file is read in your browser
              and only the recognised title, year, rating and watched-date rows are sent to Marquee;
              the original file is not kept.
            </p>

            <h3>Device, location and use of the service</h3>
            <p>
              Like any online service, Marquee and its host receive technical request information
              such as your IP address, browser, device and request time. Marquee records limited
              interaction events such as searches, title views, shelf changes, recommendation
              feedback, plays and exits to streaming providers. When you are signed in, these may be
              associated with your account so recommendations can respond to what worked.
            </p>
            <p>
              For nearby cinema showings, Marquee uses the approximate location supplied by
              Cloudflare at the network edge. This is roughly town-level, not precise GPS. It is
              used to find nearby venues and is not stored against your account. Marquee may retain
              an aggregated map cell to decide which areas need fresher listings.
            </p>

            <h3>Information used before sign-in</h3>
            <p>
              Marquee can remember your selected streaming services in local browser storage. The AI
              curator also uses a random guest identifier so follow-up requests stay together; it
              does not identify you by name.
            </p>
            <p>
              Marquee is not designed to collect special-category information. Avoid putting health,
              political, religious or similarly sensitive information about yourself or anyone else
              into notes, guest details or curator requests.
            </p>
            <p>
              An email address or GitHub profile is required only if you want a persistent account.
              Without one, you can still browse the public catalogue but Marquee cannot keep a
              private shelf or notebook for you. Other information is optional, although a feature
              may not work without the information it needs.
            </p>
          </section>

          <section className={styles.section} id="purposes">
            <h2>3. Why we use it</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Purpose</th>
                    <th scope="col">What this covers</th>
                    <th scope="col">Lawful basis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Provide your account</td>
                    <td>
                      Sign-in, sessions, your shelf, notebook, feeds, API access and the settings
                      you choose.
                    </td>
                    <td>Performance of our contract with you.</td>
                  </tr>
                  <tr>
                    <td>Personalise Marquee</td>
                    <td>
                      Recommendations, search, AI curator results, learned preferences and reminders
                      based on your activity.
                    </td>
                    <td>
                      Performance of our contract and our legitimate interest in making the service
                      useful to each viewer.
                    </td>
                  </tr>
                  <tr>
                    <td>Optional alerts and links</td>
                    <td>Email alerts, Trakt sync, Letterboxd import and any export you request.</td>
                    <td>
                      Your consent where required, and performance of the service you ask us to
                      provide.
                    </td>
                  </tr>
                  <tr>
                    <td>Protect the service</td>
                    <td>
                      Authentication, rate limits, abuse prevention, troubleshooting and security
                      records.
                    </td>
                    <td>
                      Our legitimate interests in keeping Marquee secure and reliable, and legal
                      obligations where they apply.
                    </td>
                  </tr>
                  <tr>
                    <td>Understand and improve it</td>
                    <td>
                      Limited usage events, performance information and aggregate recommendation
                      results.
                    </td>
                    <td>
                      Our legitimate interests in understanding whether the free service works and
                      improving it without advertising trackers.
                    </td>
                  </tr>
                  <tr>
                    <td>Meet legal duties</td>
                    <td>
                      Responding to lawful requests, protecting rights and resolving disputes.
                    </td>
                    <td>Legal obligation and legitimate interests in legal claims.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={styles.notice}>
              <strong>Your right to object</strong>
              <p>
                You can object to processing based on legitimate interests, including product
                analytics and recommendation profiling. Email the address above and explain what you
                want stopped. Marquee will stop unless there is a compelling legal reason to
                continue.
              </p>
            </div>
          </section>

          <section className={styles.section} id="ai">
            <h2>4. AI and preference profiling</h2>
            <p>
              Marquee uses Cloudflare Workers AI to make and explain recommendations, summarise
              viewing preferences and help the Usher respond. A request can include what you typed,
              selected services, relevant catalogue records and a limited view of your shelf,
              ratings and notes. Do not include information in a request that you would not want
              processed for that purpose.
            </p>
            <p>
              Requests travel through Cloudflare AI Gateway, which keeps a log of them. That log
              holds a copy of the whole request, including anything about you the request carried,
              together with the model's reply. Replies may also be held in the Gateway response
              cache and reused for a later request that matches; the short brief Marquee writes
              about a single title is cached for a day. Marquee does not attach your account
              identifier to these requests. It sends the name of the feature and a random reference
              created for that one decision, which cannot be traced back to you.
            </p>
            <p>
              Cloudflare states in its{" "}
              <a
                href="https://developers.cloudflare.com/workers-ai/platform/data-usage/"
                target="_blank"
                rel="noreferrer"
              >
                Workers AI data-use terms
              </a>{" "}
              that customer content is not used to train AI models or improve Cloudflare or
              third-party services without explicit consent. Guest and member curator conversation
              turns are kept together for follow-ups and deleted after one hour of inactivity.
              Separately, Marquee's own usage analytics record the first 200 characters of what you
              typed when you ask the curator, so that broken and unanswerable requests can be found
              and fixed.
            </p>
            <p>
              Marquee also builds preference profiles from ratings, viewing activity and answers.
              These profiles only alter entertainment suggestions and reminders. They do not make
              decisions with legal or similarly significant effects. You can inspect, rewrite, pause
              or forget learned preferences in the Notebook.
            </p>
          </section>

          <section className={styles.section} id="sharing">
            <h2>5. Who receives information</h2>
            <p>Marquee shares information only where needed to run a feature:</p>
            <ul>
              <li>
                <strong>Cloudflare</strong> hosts the site and provides its database, files,
                security, logs, usage analytics, email delivery and AI processing.
              </li>
              <li>
                <strong>GitHub</strong> provides the profile fields described above if you choose
                GitHub sign-in.
              </li>
              <li>
                <strong>Trakt</strong> receives and returns viewing information only if you connect
                it and ask Marquee to import, sync or send changes.
              </li>
              <li>
                Professional advisers, authorities or another operator may receive information if
                this is reasonably necessary to comply with law, protect rights, investigate abuse,
                or transfer the service with appropriate safeguards.
              </li>
            </ul>
            <p>
              Marquee does not sell personal information. It does not disclose your private shelf,
              notes or profile to other viewers. Following a link to a streaming service, cinema or
              other external site takes you to that organisation, which then handles your visit
              under its own privacy policy.
            </p>
            <p>
              Cloudflare, GitHub and Trakt are based in or may process information in the United
              States and other countries. Where UK personal data is transferred to a country without
              UK adequacy regulations, Marquee relies on safeguards recognised by UK law, such as
              the UK International Data Transfer Addendum, and requires service providers to protect
              the information. Email the privacy contact above if you want more information or a
              copy of the relevant safeguards.
            </p>
          </section>

          <section className={styles.section} id="storage">
            <h2>6. Cookies and local storage</h2>
            <p>
              Marquee does not use advertising cookies or third-party analytics cookies. It uses the
              following first-party storage for security or features you request:
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Purpose</th>
                    <th scope="col">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>marquee_session</code>
                    </td>
                    <td>Keeps a signed-in account secure.</td>
                    <td>Until its sign-in expiry or until you sign out.</td>
                  </tr>
                  <tr>
                    <td>Sign-in flow cookies</td>
                    <td>Protect an OAuth or email sign-in and return you to the requested page.</td>
                    <td>Up to 10 minutes.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>marquee_guest</code>
                    </td>
                    <td>Keeps anonymous AI curator follow-ups in the same conversation.</td>
                    <td>30 days; conversation content expires sooner as described above.</td>
                  </tr>
                  <tr>
                    <td>Streaming-service preference</td>
                    <td>Remembers services selected before sign-in.</td>
                    <td>Until you change it or clear browser storage.</td>
                  </tr>
                  <tr>
                    <td>Exit-warning preference</td>
                    <td>Remembers if you ask not to see the external-link warning again.</td>
                    <td>Until you clear browser storage.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              These are strictly necessary security records or preferences set at your request, so
              Marquee does not show a consent banner for them. You can clear local storage and
              cookies in your browser, but doing so signs you out and resets those preferences.
            </p>
          </section>

          <section className={styles.section} id="retention">
            <h2>7. How long we keep information</h2>
            <ul>
              <li>
                Account details, your shelf, notes, preferences and derived recommendations are kept
                while your account remains open, unless you delete an item sooner or ask for the
                account to be erased.
              </li>
              <li>
                Trakt credentials are kept until you unlink Trakt. Alert addresses and feed or API
                keys are kept until you replace, remove or revoke them.
              </li>
              <li>
                AI curator conversations expire after one hour of inactivity. Temporary sign-in and
                connection records expire after their short security window.
              </li>
              <li>
                Usage and security records are kept only for as long as reasonably needed to analyse
                service trends, investigate incidents and establish legal claims. Where possible,
                longer-term statistics are aggregated so they no longer identify a viewer.
              </li>
            </ul>
            <p>
              Information may be kept longer where law requires it, a dispute is active, or deletion
              is temporarily impossible in a protected backup. It will not be used for a new purpose
              while retained only for those reasons.
            </p>
          </section>

          <section className={styles.section} id="rights">
            <h2>8. Your rights</h2>
            <p>
              Depending on the circumstances, UK data protection law gives you the right to ask for
              a copy of your information, correct it, erase it, restrict its use, object to its use,
              or receive information you supplied in a portable format. Where processing relies on
              consent, you can withdraw that consent at any time without affecting earlier use.
            </p>
            <p>
              Use the Notebook controls where available or email{" "}
              <a href="mailto:me@nicholasgriffin.co.uk">me@nicholasgriffin.co.uk</a>. Marquee may
              need to verify that the request relates to you and will normally respond within one
              month.
            </p>
            <p>
              If a privacy concern is not resolved, you can complain to the{" "}
              <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">
                Information Commissioner&rsquo;s Office
              </a>
              , Wycliffe House, Water Lane, Wilmslow, Cheshire SK9 5AF, telephone 0303 123 1113.
            </p>
          </section>

          <section className={styles.section} id="children">
            <h2>9. Children</h2>
            <p>
              Marquee is not directed at children under 13 and they should not create an account. If
              you believe a child has provided personal information without suitable permission,
              email the address above so it can be removed.
            </p>
          </section>

          <section className={styles.section} id="changes">
            <h2>10. Changes and contact</h2>
            <p>
              This policy will be updated when Marquee changes how it handles personal information.
              The date at the top will change, and a prominent notice or email will be used where a
              change materially affects your rights or what you reasonably expect.
            </p>
            <p>
              Questions, objections and rights requests can be sent to Nicholas Griffin at{" "}
              <a href="mailto:me@nicholasgriffin.co.uk">me@nicholasgriffin.co.uk</a>.
            </p>
          </section>
        </div>
      </div>
    </Page>
  );
}
