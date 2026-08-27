import { sendAlertEmail } from "../../clients/email.ts";
import { logError, logEvent } from "../../lib/logging.ts";
import {
  alreadySent,
  mutedKinds,
  recordSent,
  sentThisWeek,
  viewerContacts,
} from "../../repositories/alerts.ts";
import { subscribedViewers } from "../../repositories/feeds.ts";
import { pruneSignals } from "../../repositories/signals.ts";
import type { Bindings } from "../../types.ts";
import { DETECTORS } from "./detectors.ts";
import type { AlertCandidate } from "./types.ts";

const WEEKLY_CAP = 8;
const PER_EMAIL_CAP = 6;
const PER_KIND_CAP = 2;
const VIEWER_CONCURRENCY = 15;

export async function previewAlerts(env: Bindings, origin: string) {
  return runAlerts(env, origin, { send: false });
}

export async function dispatchAlerts(env: Bindings, origin: string) {
  return runAlerts(env, origin, { send: true });
}

async function runAlerts(env: Bindings, origin: string, options: { send: boolean }) {
  const found = await Promise.all(
    DETECTORS.map((detector) =>
      detector
        .find(env, options)
        .then((candidates) => candidates.map((candidate) => ({ candidate, detector })))
        .catch((error: unknown) => {
          logError("detector_failed", error, { kind: detector.kind });

          return [];
        }),
    ),
  );
  const flat = found.flat();

  if (flat.length === 0) {
    logEvent(options.send ? "alerts_dispatched" : "alerts_previewed", {
      candidates: 0,
      emails: 0,
      feeds: 0,
    });

    return { candidates: 0, emails: 0, feeds: 0 };
  }

  const byViewer = new Map<string, { candidate: AlertCandidate; priority: number }[]>();

  for (const entry of flat) {
    byViewer.set(entry.candidate.viewerId, [
      ...(byViewer.get(entry.candidate.viewerId) ?? []),
      { candidate: entry.candidate, priority: entry.detector.priority },
    ]);
  }

  const [contacts, subscribers] = await Promise.all([
    viewerContacts(env.DB, [...byViewer.keys()]),
    subscribedViewers(env.DB, [...byViewer.keys()]),
  ]);
  let emails = 0;
  let feeds = 0;

  for (const chunk of chunked([...byViewer.entries()], VIEWER_CONCURRENCY)) {
    // oxlint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      chunk.map(([viewerId, entries]) =>
        dispatchToViewer(
          env,
          origin,
          options,
          viewerId,
          entries,
          contacts.get(viewerId),
          subscribers.has(viewerId),
        ),
      ),
    );

    for (const result of results) {
      emails += result.emails;
      feeds += result.feeds;
    }
  }

  if (options.send) {
    await pruneSignals(env.DB);
  }

  logEvent("alerts_dispatched", { candidates: flat.length, emails, feeds });

  return { candidates: flat.length, emails, feeds };
}

type ViewerEntry = { candidate: AlertCandidate; priority: number };
type ViewerContact = { email: string; name: string };

async function dispatchToViewer(
  env: Bindings,
  origin: string,
  options: { send: boolean },
  viewerId: string,
  entries: ViewerEntry[],
  contact: ViewerContact | undefined,
  isSubscriber: boolean,
): Promise<{ emails: number; feeds: number }> {
  const none = { emails: 0, feeds: 0 };

  if (!contact && !isSubscriber) {
    return none;
  }

  const [muted, recent] = await Promise.all([
    mutedKinds(env.DB, viewerId),
    sentThisWeek(env.DB, viewerId),
  ]);
  const budget = Math.max(0, WEEKLY_CAP - recent);

  if (budget === 0) {
    return none;
  }

  const kinds = [...new Set(entries.map((entry) => entry.candidate.kind))];
  const history = await Promise.all(
    kinds.map(async (kind) => [kind, await alreadySent(env.DB, viewerId, kind)] as const),
  );
  const seen = new Map(history);
  const ordered = entries.filter(
    (entry) =>
      !muted.has(entry.candidate.kind) && !seen.get(entry.candidate.kind)?.has(entry.candidate.key),
  );
  const perKind = new Map<string, number>();
  const fresh = ordered
    .slice()
    .sort((left, right) => left.priority - right.priority)
    .filter((entry) => {
      const used = perKind.get(entry.candidate.kind) ?? 0;

      if (used >= PER_KIND_CAP) {
        return false;
      }

      perKind.set(entry.candidate.kind, used + 1);

      return true;
    })
    .slice(0, Math.min(budget, PER_EMAIL_CAP))
    .map((entry) => entry.candidate);

  if (fresh.length === 0) {
    return none;
  }

  if (!options.send) {
    return contact ? { emails: 1, feeds: 0 } : { emails: 0, feeds: 1 };
  }

  try {
    if (contact) {
      await sendAlertEmail(
        env,
        contact.email,
        fresh.map((candidate) => ({
          headline: candidate.headline,
          detail: candidate.detail,
          url: `${origin}${candidate.path}`,
        })),
      );
    }

    await recordSent(
      env.DB,
      fresh.map((candidate) => ({
        viewerId,
        kind: candidate.kind,
        key: candidate.key,
        titleId: candidate.titleId,
        detail: candidate.detail,
        channel: contact ? ("email" as const) : ("feed" as const),
      })),
    );

    return contact ? { emails: 1, feeds: 0 } : { emails: 0, feeds: 1 };
  } catch (error) {
    logError("alert_dispatch_failed", error, { viewerId });

    return none;
  }
}

function chunked<T>(items: T[], size: number) {
  const groups: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
}
