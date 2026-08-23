import { findByImdbId, findByTitle, getItems } from "../clients/tmdb.ts";
import { logEvent } from "../lib/logging.ts";
import { storeItems } from "../repositories/catalog-writer.ts";
import type { Bindings } from "../types.ts";
import { queueAvailability } from "./availability.ts";
import { queueTitleEmbeddings } from "./embeddings.ts";

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

export async function importImdbTitle(env: Bindings, imdbId: string) {
  const titleId = await findByImdbId(env, imdbId);

  if (!titleId) {
    logEvent("imdb_import_unmatched", { imdbId });

    return;
  }

  await ingestTitle(env, titleId);
}

export async function importDiaryRow(
  env: Bindings,
  job: {
    viewerId: string;
    name: string;
    year: number | null;
    rating: number | null;
    watchedAt: string;
  },
) {
  const titleId = await findByTitle(env, job.name, job.year);

  if (!titleId) {
    logEvent("diary_import_unmatched", { name: job.name });

    return;
  }

  if (!(await ingestTitle(env, titleId))) {
    return;
  }

  await env.DB.prepare(
    `INSERT INTO viewing_entries (id, viewer_id, title_id, status, rating, thoughts, updated_at)
     VALUES (?1, ?2, ?3, 'watched', ?4, '', ?5)
     ON CONFLICT(viewer_id, title_id) DO UPDATE SET
       status = 'watched',
       rating = COALESCE(excluded.rating, viewing_entries.rating),
       updated_at = excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      job.viewerId,
      titleId,
      job.rating,
      job.watchedAt ? `${job.watchedAt} 12:00:00` : new Date().toISOString(),
    )
    .run();
}
