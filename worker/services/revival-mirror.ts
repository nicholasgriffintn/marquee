import { UPSTREAM_AGENT } from "../clients/fetch.ts";
import { UpstreamError } from "../clients/upstream.ts";
import { errorStatus, isPermanentHttpStatus } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { traceUpstream } from "../lib/upstream-usage.ts";
import {
  completeMirror,
  failMirror,
  readMirrorRow,
  saveMirrorProgress,
  selectUnmirrored,
  type MirrorRow,
} from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";

const PART_BYTES = 32 * 1_024 * 1_024;
const PARTS_PER_RUN = 6;
const MAX_OBJECT_BYTES = 6 * 1_024 * 1_024 * 1_024;
const SINGLE_SHOT_MAX_BYTES = 96 * 1_024 * 1_024;
const FETCH_TIMEOUT_MS = 60_000;

type StoredPart = { partNumber: number; etag: string };

export function reelKey(id: string) {
  return `reel/${id.replaceAll(/[^\w.-]/gu, "_")}.mp4`;
}

function parseParts(raw: string): StoredPart[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as StoredPart).partNumber === "number" &&
      typeof (entry as StoredPart).etag === "string"
        ? [entry as StoredPart]
        : [],
    );
  } catch {
    return [];
  }
}

async function probeSource(url: string) {
  const response = await traceUpstream("mirror", () =>
    fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": UPSTREAM_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  );

  if (!response.ok) {
    throw new UpstreamError(`source responded ${response.status}`, response.status);
  }

  const length = Number(response.headers.get("content-length") ?? "0");
  const ranged = (response.headers.get("accept-ranges") ?? "").includes("bytes");

  return {
    bytes: Number.isFinite(length) && length > 0 ? length : 0,
    ranged,
    contentType: response.headers.get("content-type") ?? "video/mp4",
  };
}

async function copyWholeObject(env: Bindings, id: string, url: string, contentType: string) {
  const response = await traceUpstream("mirror", () =>
    fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UPSTREAM_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  );

  if (!response.ok || !response.body) {
    throw new UpstreamError(`source responded ${response.status}`, response.status);
  }

  const body = await response.arrayBuffer();

  if (body.byteLength === 0) {
    throw new Error("source returned an empty body");
  }

  const key = reelKey(id);

  await env.MEDIA.put(key, body, { httpMetadata: { contentType } });
  await completeMirror(env.DB, id, key, body.byteLength);

  return { id, bytes: body.byteLength, done: true };
}

export async function mirrorWork(env: Bindings, id: string) {
  const row = await readMirrorRow(env.DB, id);

  if (!row || row.mirrorState === "mirrored") {
    return { id, bytes: 0, done: true };
  }

  try {
    const source = await probeSource(row.streamUrl);

    if (source.bytes > MAX_OBJECT_BYTES) {
      await failMirror(env.DB, id, `source is ${source.bytes} bytes, over the mirror ceiling`);

      return { id, bytes: 0, done: true };
    }

    if (!source.ranged || source.bytes === 0) {
      if (source.bytes > SINGLE_SHOT_MAX_BYTES) {
        await failMirror(env.DB, id, "source does not support range requests");

        return { id, bytes: 0, done: true };
      }

      return await copyWholeObject(env, id, row.streamUrl, source.contentType);
    }

    return await mirrorInParts(env, row, source.bytes, source.contentType);
  } catch (error) {
    logError("revival_mirror_failed", error, { area: "revival", workId: id });

    if (!isPermanentHttpStatus(errorStatus(error))) {
      throw error;
    }

    await failMirror(env.DB, id, error instanceof Error ? error.message : "mirror failed");

    return { id, bytes: 0, done: true };
  }
}

async function mirrorInParts(
  env: Bindings,
  row: MirrorRow,
  totalBytes: number,
  contentType: string,
) {
  const id = row.id;
  const url = row.streamUrl;
  const key = reelKey(id);
  const parts = row.mirrorUploadId ? parseParts(row.mirrorParts) : [];
  const upload =
    row.mirrorUploadId && parts.length
      ? env.MEDIA.resumeMultipartUpload(key, row.mirrorUploadId)
      : await env.MEDIA.createMultipartUpload(key, {
          httpMetadata: { contentType },
        });
  let offset = parts.length * PART_BYTES;

  for (let index = 0; index < PARTS_PER_RUN && offset < totalBytes; index += 1) {
    const end = Math.min(offset + PART_BYTES, totalBytes) - 1;
    // oxlint-disable-next-line no-await-in-loop
    const response = await traceUpstream("mirror", () =>
      fetch(url, {
        redirect: "follow",
        headers: {
          range: `bytes=${offset}-${end}`,
          "user-agent": UPSTREAM_AGENT,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    );

    if (response.status !== 206 || !response.body) {
      throw new UpstreamError(`range request responded ${response.status}`, response.status);
    }

    // oxlint-disable-next-line no-await-in-loop
    const chunk = await response.arrayBuffer();

    if (chunk.byteLength === 0) {
      throw new Error("range request returned no bytes");
    }

    // oxlint-disable-next-line no-await-in-loop
    const part = await upload.uploadPart(parts.length + 1, chunk);

    parts.push({ partNumber: part.partNumber, etag: part.etag });
    offset += chunk.byteLength;
  }

  if (offset >= totalBytes) {
    await upload.complete(parts);
    await completeMirror(env.DB, id, key, totalBytes);

    return { id, bytes: totalBytes, done: true };
  }

  await saveMirrorProgress(env.DB, id, {
    key,
    uploadId: upload.uploadId,
    parts: JSON.stringify(parts),
    offset,
  });

  return { id, bytes: offset, done: false };
}

export async function queueRevivalMirrors(env: Bindings, limit = 4) {
  const ids = await selectUnmirrored(env.DB, limit);

  if (ids.length === 0) {
    return 0;
  }

  await env.REVIVAL_QUEUE.sendBatch(
    ids.map((id) => ({
      body: { type: "mirror-revival-work" as const, workId: id },
    })),
  );

  return ids.length;
}
