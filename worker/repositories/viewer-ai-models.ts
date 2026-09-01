export type ViewerAiModelConfiguration = {
  provider: string;
  model: string;
  credentialSource: "cloudflare" | "byok";
  byokAlias: string | null;
};

type ViewerAiModelRow = {
  provider: string;
  model: string;
  credentialSource: string;
  byokAlias: string | null;
};

export async function readViewerAiModel(
  db: Database,
  viewerId: string,
): Promise<ViewerAiModelConfiguration | null> {
  if (!viewerId) {
    return null;
  }

  const row = await db.first<ViewerAiModelRow>(
    `SELECT provider, model, credential_source AS "credentialSource",
            byok_alias AS "byokAlias"
       FROM viewer_ai_models
      WHERE viewer_id = $1`,
    [viewerId],
  );

  if (!row) {
    return null;
  }

  if (row.credentialSource !== "cloudflare" && row.credentialSource !== "byok") {
    throw new Error("Viewer AI model credential source is invalid");
  }

  return {
    provider: row.provider,
    model: row.model,
    credentialSource: row.credentialSource,
    byokAlias: row.byokAlias,
  };
}
