import { recordAt, records, stringAt } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 12_000;
const MIN_GAP_MS = 2_100;
const API_URL = "https://graphql.anilist.co";
const STREAM_LIMIT = 12;
const CHARACTER_LIMIT = 12;
const STAFF_LIMIT = 8;

const ROLE_LABELS: Record<string, string> = {
  MAIN: "Main",
  SUPPORTING: "Supporting",
  BACKGROUND: "Background",
};

const QUERY = `
query($id: Int) {
  Media(id: $id, type: ANIME) {
    externalLinks {
      site
      url
      type
    }
    characters(sort: ROLE, perPage: ${CHARACTER_LIMIT}) {
      edges {
        role
        node {
          name {
            full
          }
        }
        voiceActors(language: JAPANESE) {
          name {
            full
          }
        }
      }
    }
    staff(sort: RELEVANCE, perPage: ${STAFF_LIMIT}) {
      edges {
        role
        node {
          name {
            full
          }
        }
      }
    }
  }
}
`;

export const AniListError = upstreamError("AniListError");

export type AniListStream = {
  site: string;
  url: string;
};

export type AniListCharacter = {
  name: string;
  role: string;
  voiceActor: string | null;
};

export type AniListStaffMember = {
  name: string;
  role: string;
};

export type AniListDetails = {
  streams: AniListStream[];
  characters: AniListCharacter[];
  staff: AniListStaffMember[];
};

function personName(node: Record<string, unknown> | null) {
  return node ? stringAt(recordAt(node, "name") ?? {}, "full") : null;
}

export async function getAniListDetails(anilistId: number): Promise<AniListDetails | null> {
  await new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS));

  const response = await upstreamFetch(API_URL, {
    method: "POST",
    source: "anilist",
    timeoutMs: TIMEOUT_MS,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { id: anilistId } }),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    throw new AniListError(
      `AniList request failed (${response.status}) ${body.slice(0, 180).replaceAll(/\s+/gu, " ")}`,
      response.status,
    );
  }

  const payload = await response.json();

  if (!payload || typeof payload !== "object") {
    throw new AniListError("AniList returned a payload without media data");
  }

  const data = recordAt(payload as Record<string, unknown>, "data");
  const media = data ? recordAt(data, "Media") : null;

  if (!media) {
    return null;
  }

  const characterEdges = recordAt(media, "characters");
  const staffEdges = recordAt(media, "staff");

  return {
    streams: records(media.externalLinks)
      .flatMap((entry): AniListStream[] => {
        const site = stringAt(entry, "site");
        const url = stringAt(entry, "url");
        const type = stringAt(entry, "type");

        return type === "STREAMING" && site && url ? [{ site, url }] : [];
      })
      .slice(0, STREAM_LIMIT),
    characters: records(characterEdges ? characterEdges.edges : undefined)
      .flatMap((edge): AniListCharacter[] => {
        const name = personName(recordAt(edge, "node"));
        const role = stringAt(edge, "role");
        const [voiceActor] = records(edge.voiceActors);
        const vaName = personName(voiceActor);

        return name
          ? [
              {
                name,
                role: role ? (ROLE_LABELS[role] ?? role) : "Cast",
                voiceActor: vaName,
              },
            ]
          : [];
      })
      .slice(0, CHARACTER_LIMIT),
    staff: records(staffEdges ? staffEdges.edges : undefined)
      .flatMap((edge): AniListStaffMember[] => {
        const name = personName(recordAt(edge, "node"));
        const role = stringAt(edge, "role");

        return name && role ? [{ name, role }] : [];
      })
      .slice(0, STAFF_LIMIT),
  };
}
