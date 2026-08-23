import { titlePath } from "../../src/domain/catalog.ts";
import { sendArrivalEmail } from "../clients/email.ts";
import { logError } from "../lib/logging.ts";
import {
  alreadyAlerted,
  confirmedArrivals,
  markAnnounced,
  noteAlert,
  recentAlertCount,
  waitingViewers,
  type Arrival,
} from "../repositories/arrivals.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { pruneSignals } from "../repositories/signals.ts";
import type { Bindings } from "../types.ts";

const WEEKLY_ALERT_CAP = 6;
const PER_EMAIL_CAP = 5;

function providerNames(titles: Awaited<ReturnType<typeof readItems>>) {
  const names = new Map<string, string>();

  for (const title of titles) {
    for (const provider of title.providers) {
      names.set(provider.id, provider.name);
    }
  }

  return names;
}

export async function announceArrivals(env: Bindings, origin: string) {
  const arrivals = await confirmedArrivals(env.DB);

  if (arrivals.length === 0) {
    return { arrivals: 0, emails: 0 };
  }

  const titleIds = [...new Set(arrivals.map((arrival) => arrival.titleId))];
  const [titles, byTitle] = await Promise.all([
    readItems(env.DB, titleIds),
    waitingViewers(env.DB, titleIds),
  ]);
  const names = providerNames(titles);
  const byId = new Map(titles.map((title) => [title.id, title]));
  const perViewer = new Map<string, { email: string; arrivals: Arrival[] }>();

  for (const arrival of arrivals) {
    for (const viewer of byTitle.get(arrival.titleId) ?? []) {
      const current = perViewer.get(viewer.viewerId) ?? { email: viewer.email, arrivals: [] };

      current.arrivals.push(arrival);
      perViewer.set(viewer.viewerId, current);
    }
  }

  let emails = 0;

  for (const [viewerId, bundle] of perViewer) {
    // oxlint-disable-next-line no-await-in-loop
    const [seen, recent] = await Promise.all([
      alreadyAlerted(
        env.DB,
        viewerId,
        bundle.arrivals.map((arrival) => arrival.titleId),
      ),
      recentAlertCount(env.DB, viewerId),
    ]);

    if (recent >= WEEKLY_ALERT_CAP) {
      continue;
    }

    const fresh = bundle.arrivals
      .filter((arrival) => !seen.has(arrival.titleId))
      .slice(0, PER_EMAIL_CAP);

    if (fresh.length === 0) {
      continue;
    }

    const payload = fresh.flatMap((arrival) => {
      const title = byId.get(arrival.titleId);

      return title
        ? [
            {
              title: title.title,
              providerName: names.get(arrival.providerId) ?? arrival.providerId,
              url: `${origin}${titlePath(title)}`,
            },
          ]
        : [];
    });

    if (payload.length === 0) {
      continue;
    }

    try {
      // oxlint-disable-next-line no-await-in-loop
      await sendArrivalEmail(env, bundle.email, payload);
      // oxlint-disable-next-line no-await-in-loop
      await noteAlert(
        env.DB,
        viewerId,
        fresh.map((arrival) => arrival.titleId),
      );
      emails += 1;
    } catch (error) {
      logError("arrival_announce_failed", error, { viewerId });
    }
  }

  await markAnnounced(env.DB, arrivals);
  await pruneSignals(env.DB);

  console.log(JSON.stringify({ event: "arrivals_announced", arrivals: arrivals.length, emails }));

  return { arrivals: arrivals.length, emails };
}
