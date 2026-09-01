import { getOmdbTitle, type OmdbRecord } from "../clients/omdb.ts";
import { findByImdbId, findByTitle, getItems } from "../clients/tmdb.ts";
import { logEvent } from "../lib/logging.ts";
import { storeItems } from "../repositories/catalog-writer.ts";
import type { Bindings } from "../types.ts";
import { queueAvailability } from "./availability.ts";
import { queueTitleEmbeddings } from "./embeddings.ts";
import { withSourceBudget } from "./sources.ts";

async function ingestTitle(env: Bindings, titleId: string) {
  const [title] = await getItems(env, [titleId]);

  if (!title) {
    return false;
  }

  await storeItems(env.DB, [title], new Date().toISOString());
  await queueAvailability(env, [titleId]);
  await queueTitleEmbeddings(env, [titleId]);

  return true;
}

async function askOmdb(env: Bindings, run: () => Promise<OmdbRecord | null>) {
  return env.OMDB_API_KEY ? withSourceBudget(env, "omdb", run) : null;
}

async function matchThroughOmdb(env: Bindings, imdbId: string) {
  const record = await askOmdb(env, () => getOmdbTitle(env, { imdbId }));

  if (!record?.title) {
    return null;
  }

  return findByTitle(env, record.title, record.year, record.mediaType);
}

export async function importImdbTitle(env: Bindings, imdbId: string) {
  const titleId = (await findByImdbId(env, imdbId)) ?? (await matchThroughOmdb(env, imdbId));

  if (!titleId) {
    logEvent("imdb_import_unmatched", { imdbId });

    return;
  }

  await ingestTitle(env, titleId);
}
