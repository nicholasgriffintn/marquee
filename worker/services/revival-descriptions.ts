import { articleMatchesTitle, findArticle } from "../clients/wikimedia.ts";
import { readArticleSummary } from "../clients/wikipedia-summary.ts";
import { logError } from "../lib/logging.ts";
import {
  selectForDescription,
  storeDescription,
  type ArticleDescription,
  type DescriptionRow,
} from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";

const DESCRIBE_BATCH = 40;
const DESCRIBE_BUDGET_MS = 25_000;
const DESCRIBE_LANES = 4;

async function resolveArticle(work: DescriptionRow) {
  if (work.catalogueArticle) {
    return work.catalogueArticle;
  }

  return findArticle([work.title], work.year, work.kind !== "ephemeral");
}

async function describe(work: DescriptionRow): Promise<ArticleDescription | null> {
  const article = await resolveArticle(work);

  if (!article || !articleMatchesTitle(article, [work.title])) {
    return null;
  }

  const summary = await readArticleSummary(article);

  if (!summary || summary.extract.length <= work.synopsis.trim().length) {
    return null;
  }

  return { synopsis: summary.extract, article: summary.article, articleUrl: summary.articleUrl };
}

export async function describeRevivalWorks(env: Bindings, limit = DESCRIBE_BATCH) {
  const pending = await selectForDescription(env.DB, limit);
  const deadline = Date.now() + DESCRIBE_BUDGET_MS;
  const counts = { considered: 0, described: 0 };

  for (let index = 0; index < pending.length; index += DESCRIBE_LANES) {
    if (Date.now() > deadline) {
      break;
    }

    const lane = pending.slice(index, index + DESCRIBE_LANES);
    // oxlint-disable-next-line no-await-in-loop
    const found = await Promise.all(
      lane.map(async (work) => {
        try {
          return await describe(work);
        } catch (error) {
          logError("revival_description_failed", error, {
            area: "revival",
            workId: work.id,
          });

          return null;
        }
      }),
    );

    for (const [lanePosition, description] of found.entries()) {
      counts.considered += 1;

      if (description) {
        counts.described += 1;
      }

      // oxlint-disable-next-line no-await-in-loop
      await storeDescription(env.DB, lane[lanePosition].id, description);
    }
  }

  return {
    ...counts,
    exhausted: pending.length < limit && counts.considered >= pending.length,
  };
}
