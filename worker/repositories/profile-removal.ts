export async function deleteProfileData(db: D1Database, viewerId: string, titleId: string) {
  const results = await db.batch([
    db
      .prepare(
        `DELETE FROM viewing_entries
         WHERE viewer_id = ? AND title_id = ?`,
      )
      .bind(viewerId, titleId),
    db
      .prepare(
        `DELETE FROM viewing_episode_entries
         WHERE viewer_id = ? AND title_id = ?`,
      )
      .bind(viewerId, titleId),
  ]);

  if (results.some((result) => !result.success)) {
    throw new Error("Profile deletion transaction failed");
  }
}
