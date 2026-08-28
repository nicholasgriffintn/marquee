import { Link } from "react-router-dom";

import { Heading, Page } from "../ui";

import styles from "./LegalPage.module.css";

const UPDATED = "28 August 2026";

export function TermsPage() {
  return (
    <Page as="article" className={styles.page} labelledBy="terms-title">
      <header className={styles.masthead}>
        <div>
          <Heading
            level={1}
            size="display"
            family="serif"
            tone="ink"
            id="terms-title"
            className={styles.title}
          >
            Terms of use.
          </Heading>
          <p className={styles.standfirst}>
            The simple arrangement between Marquee and everyone who comes through the doors.
          </p>
        </div>

        <aside className={styles.summary} aria-label="Terms of use summary">
          <strong>The short version</strong>
          <p>
            Marquee is a free discovery and watch-tracking service. Use it lawfully, keep your
            account secure, and treat recommendations and third-party availability as guidance
            rather than a promise.
          </p>
          <span className={styles.updated}>Last updated {UPDATED}</span>
        </aside>
      </header>

      <div className={styles.layout}>
        <nav className={styles.contents} aria-label="Terms of use contents">
          <strong>On this page</strong>
          <ol>
            <li>
              <a href="#agreement">The agreement</a>
            </li>
            <li>
              <a href="#service">What Marquee provides</a>
            </li>
            <li>
              <a href="#accounts">Accounts and eligibility</a>
            </li>
            <li>
              <a href="#rules">Acceptable use</a>
            </li>
            <li>
              <a href="#content">Your content</a>
            </li>
            <li>
              <a href="#third-parties">Third parties</a>
            </li>
            <li>
              <a href="#ownership">Ownership</a>
            </li>
            <li>
              <a href="#changes">Service changes</a>
            </li>
            <li>
              <a href="#liability">Responsibility</a>
            </li>
            <li>
              <a href="#ending">Ending use</a>
            </li>
            <li>
              <a href="#law">Law and contact</a>
            </li>
          </ol>
        </nav>

        <div className={styles.copy}>
          <section className={styles.section} id="agreement">
            <h2>1. The agreement</h2>
            <p>
              These terms are an agreement between you and Nicholas Griffin, the United Kingdom
              operator of Marquee. They apply when you browse Marquee, create an account, use the
              iOS app or access its feeds, API or MCP tools.
            </p>
            <p>
              By using Marquee, you agree to these terms. If you do
              not agree, do not use the service. Read the <Link to="/privacy">privacy policy</Link>{" "}
              alongside these terms to understand how personal information is handled.
            </p>
          </section>

          <section className={styles.section} id="service">
            <h2>2. What Marquee provides</h2>
            <p>
              Marquee helps people discover films and television, see where titles may be available,
              keep a personal shelf and episode history, receive requested alerts, and get
              personalised or AI-assisted recommendations. The Revival House also presents selected
              archive films through Marquee or the archive that holds them.
            </p>
            <p>
              The service is currently free. Marquee is not a subscription streaming provider and
              does not sell cinema tickets or third-party subscriptions. Except for material clearly
              presented as playing within the Revival House, links take you to another provider to
              watch, rent, buy or book.
            </p>
            <p>
              Availability, prices, schedules, ratings, metadata and rights information come from
              outside sources and change frequently. Marquee takes reasonable care in assembling
              them but cannot promise that every listing is complete, current or correct. Check the
              relevant provider before paying or travelling. AI recommendations are suggestions, not
              statements of fact or professional advice.
            </p>
          </section>

          <section className={styles.section} id="accounts">
            <h2>3. Accounts and eligibility</h2>
            <ul>
              <li>You must be at least 13 to create an account.</li>
              <li>
                If you are under 18, use Marquee only with permission from a parent or guardian.
              </li>
              <li>
                Keep sign-in links, sessions, feed URLs and API tokens private. Anything done using
                them is treated as activity on your account unless you tell Marquee they were
                compromised.
              </li>
              <li>
                Provide information you are entitled to use and tell Marquee promptly if you think
                someone else has accessed your account.
              </li>
            </ul>
            <p>
              Email <a href="mailto:me@nicholasgriffin.co.uk">me@nicholasgriffin.co.uk</a> if you
              need help securing an account.
            </p>
          </section>

          <section className={styles.section} id="rules">
            <h2>4. Acceptable use</h2>
            <p>You may use Marquee for lawful personal purposes. You must not:</p>
            <ul>
              <li>break the law or infringe another person&rsquo;s rights through the service;</li>
              <li>
                submit malicious code, probe or bypass security, evade rate limits, or access
                another person&rsquo;s account or private information;
              </li>
              <li>
                use automation in a way that overloads, disrupts or degrades Marquee, except through
                an interface and credentials Marquee provides for that purpose;
              </li>
              <li>
                misuse archive streams, artwork, metadata or other third-party material contrary to
                its licence or source terms; or
              </li>
              <li>use Marquee to develop, distribute or promote unlawful or harmful material.</li>
            </ul>
            <p>
              Reasonable security research is welcome when carried out safely and reported privately
              before public disclosure. It must not involve accessing other viewers&rsquo; data,
              damaging the service or retaining information you do not need.
            </p>
          </section>

          <section className={styles.section} id="content">
            <h2>5. Your ratings, notes and requests</h2>
            <p>
              You keep ownership of the ratings, notes, prompts, guest details and other material
              you enter. You give Marquee a limited, non-exclusive licence to host, copy, analyse,
              transform and transmit that material only as needed to operate, secure and improve the
              service and provide the features you request. This licence ends when the material is
              deleted, except where a temporary backup or legal requirement applies.
            </p>
            <p>
              You are responsible for what you enter and must have the right to use it. Do not add
              unlawful material or another person&rsquo;s sensitive information. If you record the
              name or preferences of someone you watch with, do so with their knowledge and keep it
              to what Marquee needs to make a group recommendation.
            </p>
            <p>
              Notes and shelves are not published to other viewers. They may be processed by the
              service providers named in the privacy policy and sent to a connected service only
              when the feature requires it or you direct Marquee to do so.
            </p>
          </section>

          <section className={styles.section} id="third-parties">
            <h2>6. Connected services and external sites</h2>
            <p>
              GitHub sign-in, Trakt connections, archive players, streaming providers, cinemas and
              other external links are operated by other organisations. Their own terms and privacy
              policies apply once you use them. Marquee does not control their accounts, payments,
              content, availability or security.
            </p>
            <p>
              Connecting Trakt authorises Marquee to read the viewing data you select and, only
              after confirmation, send eligible shelf changes back. You can unlink it from the
              Notebook. A Letterboxd import copies recognised rows into Marquee; it does not create
              an ongoing connection to Letterboxd.
            </p>
            <p>
              Data and media credits are listed on the{" "}
              <Link to="/sources">services and sources page</Link>. External material remains
              subject to the rights and attribution shown there or at its source.
            </p>
          </section>

          <section className={styles.section} id="ownership">
            <h2>7. Marquee and third-party rights</h2>
            <p>
              The Marquee name, original interface, design, writing and character artwork are
              protected by intellectual property law unless stated otherwise. These terms let you
              use the service; they do not transfer those rights or allow you to reuse Marquee
              branding in a way that suggests endorsement.
            </p>
            <p>
              Film and television titles, posters, trailers, metadata, logos and archive prints may
              belong to their creators, licensors or source institutions. A public-domain or licence
              assessment in the Revival House describes why Marquee can present a particular copy;
              it is not legal advice or a general licence for you to republish that work in another
              country or context.
            </p>
          </section>

          <section className={styles.section} id="changes">
            <h2>8. Changes to the service or these terms</h2>
            <p>
              Marquee may add, change or remove features, sources and integrations as the catalogue,
              law, costs and technical systems change. Because the service is free, it may also be
              paused or discontinued. Reasonable notice will be given where practical, particularly
              if a change affects access to stored account information.
            </p>
            <p>
              These terms may change for the same reasons. The updated date will always appear at
              the top. A prominent notice or email will be used where a material change affects your
              rights. Continued use after the new terms take effect means you accept them; if you do
              not, you can stop using Marquee and ask for your account to be deleted.
            </p>
          </section>

          <section className={styles.section} id="liability">
            <h2>9. Our responsibility to you</h2>
            <p>
              Marquee will provide the service with reasonable care and skill. It does not promise
              uninterrupted access, that every feature will suit you, or that third-party listings
              and AI output will always be accurate. Keep your own copy of any notes you cannot
              afford to lose.
            </p>
            <p>
              Marquee is responsible for loss or damage that is a foreseeable result of breaching
              these terms or failing to use reasonable care and skill. It is not responsible for
              unforeseeable loss, business loss arising from personal use, failures outside its
              reasonable control, or a third party&rsquo;s separate service.
            </p>
            <p>
              Nothing in these terms excludes or limits liability where doing so would be unlawful,
              including liability for death or personal injury caused by negligence, fraud or
              fraudulent misrepresentation. Nothing here affects your mandatory consumer rights.
            </p>
          </section>

          <section className={styles.section} id="ending">
            <h2>10. Ending or restricting use</h2>
            <p>
              You can stop using Marquee at any time, unlink connected services and revoke feed or
              API keys in the Notebook. Email the contact address below to close your account and
              request deletion of its personal information.
            </p>
            <p>
              Marquee may restrict or end access where reasonably necessary to address a serious or
              repeated breach of these terms, protect viewers or the service, comply with law, or
              respond to a security risk. Where appropriate, you will be told what happened and
              given a reasonable chance to resolve it.
            </p>
            <p>
              Provisions about ownership, responsibility, disputes and any accrued rights continue
              after use ends where their nature requires it.
            </p>
          </section>

          <section className={styles.section} id="law">
            <h2>11. Law, disputes and contact</h2>
            <p>
              These terms are governed by the law of England and Wales. The courts of England and
              Wales have jurisdiction, but if you are a consumer living elsewhere in the United
              Kingdom you may also bring a claim in the courts where you live and keep any mandatory
              protections provided by your local law.
            </p>
            <p>
              Please try to resolve a concern directly first. Contact Nicholas Griffin at{" "}
              <a href="mailto:me@nicholasgriffin.co.uk">me@nicholasgriffin.co.uk</a> and include
              enough detail to identify the issue without sending passwords, sign-in links or API
              tokens.
            </p>
          </section>
        </div>
      </div>
    </Page>
  );
}
