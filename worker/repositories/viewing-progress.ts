export function furthestEpisodeColumns(
  viewerId: string,
  titleId: string,
  seasonAlias = "season",
  episodeAlias = "episode",
) {
  const episode = `viewing_episode_entries
       WHERE viewer_id = ${viewerId} AND title_id = ${titleId}
         AND scope = 'episode' AND watched = 1 AND season_number > 0
       ORDER BY season_number DESC, episode_number DESC LIMIT 1`;

  return `(SELECT season_number FROM ${episode}) AS "${seasonAlias}",
          (SELECT episode_number FROM ${episode}) AS "${episodeAlias}"`;
}
