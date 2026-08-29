export async function deleteProfileData(db: Database, viewerId: string, titleId: string) {
  await db.transaction(async (transaction) => {
    const results = [];

    results.push(
      await transaction.execute(
        `DELETE FROM viewing_entries
         WHERE viewer_id = $1 AND title_id = $2`,
        [viewerId, titleId],
      ),
    );
    results.push(
      await transaction.execute(
        `DELETE FROM viewing_episode_entries
         WHERE viewer_id = $1 AND title_id = $2`,
        [viewerId, titleId],
      ),
    );

    return results;
  });
}
