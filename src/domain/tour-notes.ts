import type { TourStopId } from "./tour";

export type DiagramTone = "input" | "step" | "store" | "model" | "output";

export type DiagramNode = { label: string; note?: string; tone?: DiagramTone };

export type DiagramLane = { name: string; nodes: DiagramNode[] };

export type DiagramSpec = { lanes: DiagramLane[]; after: DiagramNode[]; caption?: string };

export type CodeLink = { path: string; what: string };

export type TourNote = {
  heading: string;
  standfirst: string;
  body: string[];
  diagram: DiagramSpec;
  code: CodeLink[];
};

export const TOUR_NOTES: Record<TourStopId, TourNote> = {
  step: {
    heading: "This tour interacts with the real implementation",
    standfirst: "There's no seeded data or fixtures on this page.",
    body: [
      "I made sure that this page would call the same endpoints as the rest of the site calls so that you get a proper demo.",
      "There are no fixtures or faked data on this page so if something is down, it will error just like the product does.",
      "For this page in particular, you will see a counter for the total count of titles, this comes from Postgres via Hyperdrive, cached on the edge with Cloudflare.",
    ],
    diagram: {
      lanes: [],
      after: [
        { label: "Browser", tone: "input" },
        { label: "Worker", note: "edge cached, 10 min" },
        { label: "Hyperdrive" },
        { label: "Postgres", note: "counts", tone: "store" },
      ],
    },
    code: [
      { path: "src/pages/TourPage.tsx", what: "This page" },
      { path: "src/domain/tour.ts", what: "The definitions for each section" },
      { path: "worker/services/building.ts", what: "The queries that get the counters data" },
    ],
  },

  foyer: {
    heading: "Accurate results for search and recommendations",
    standfirst: "Using Postgres for precision requirements and embeddings for meaning",
    body: [
      "Marquee has a number of surfaces that have different search and matching requirements so we use two different ways to match.",
      "Postgres is used for a full-text search using the tsvector data type and includes titles, synopses, keywords and credited names. It gets ordered by ts_rank_cd and is intended to be fast and very literal, it will only match what you actually typed.",
      "To provide results with meaning, we are using bge-m3 with Vectorize to provide nearest neighbour results. Vectorize has a number of embeddings within it and these include various metadata indexes, including the type of media and the year.",
      "Both of these can then be fused if required and then in a number of applications, they are reranked by bge-reranker-base which scores each candidate against the original query instead of comparing vectors and allows the results to still be relevant to the query.",
    ],
    diagram: {
      lanes: [
        {
          name: "Words",
          nodes: [
            { label: "Query", tone: "input" },
            { label: "to_tsquery" },
            { label: "Postgres", note: "tsvector + ts_rank_cd", tone: "store" },
          ],
        },
        {
          name: "Meaning",
          nodes: [
            { label: "Query", tone: "input" },
            { label: "bge-m3", note: "embed", tone: "model" },
            { label: "Vectorize", note: "topK + metadata filter", tone: "store" },
          ],
        },
      ],
      after: [
        { label: "Fuse" },
        { label: "bge-reranker-base", note: "cross-encoder", tone: "model" },
        { label: "Results", tone: "output" },
      ],
      caption:
        "Both lanes run on every hybrid search. The panel above shows them separately only so you can see which one earned which result.",
    },
    code: [
      { path: "worker/services/retrieval/index.ts", what: "Retrieves both lanes and fuses" },
      {
        path: "worker/repositories/catalog-search.ts",
        what: "Performs the full text query and ranking",
      },
      {
        path: "worker/services/vector-index.ts",
        what: "Provides the Vectorize query plan and metadata filters",
      },
      { path: "worker/services/retrieval/rerank.ts", what: "Performs the reranking" },
    ],
  },

  pad: {
    heading: "Recommendations powered by AI",
    standfirst: "Using constraints from users and a shortlist for speed",
    body: [
      "When a user queries the platform for a recommendation, they provide us with a number of constraints for the recommendation they want, in the example above, you provide us answers to three questions. These are used as filters for the retrieval of the search that provides a shortlist of available titles for the next step.",
      "That shortlist is then passed down to the AI which will be a model provided from Workers AI most of the time.",
      "The model is provided a basic prompt alongside this shortlist and will then pick and explain its decision based on all of this information.",
      "The decision is then returned to the user but we also store a hash of the prompt version against a decision, this allows us to track how different candidates perform across recommendations. The prompt itself is not stored and rows in decisions will expire after 90 days.",
      'We are using two models by default @cf/meta/llama-4-scout-17b-16e-instruct as a "fast model" and then @cf/moonshotai/kimi-k2.6 for slower queries that require more thought, this can also be configured individually for each user.',
    ],
    diagram: {
      lanes: [],
      after: [
        { label: "3 answers", tone: "input" },
        { label: "Constraints", note: "runtime, cert, room" },
        { label: "Retrieval", note: "shortlist of real titles" },
        { label: "Workers AI", note: "picks + explains", tone: "model" },
        { label: "decisions", note: "candidates, scores, tokens", tone: "store" },
      ],
      caption:
        "The model is the last step and the smallest one. Everything that decides what is possible happens before it.",
    },
    code: [
      {
        path: "worker/services/usher-order.ts",
        what: "The logic behind the constraints, shortlist and prompt",
      },
      { path: "worker/services/decisions.ts", what: "How decisions are stored" },
      { path: "worker/ai/run.ts", what: "The model routing and AI gateway config" },
    ],
  },

  corridor: {
    heading: "Providing useful recommendations",
    standfirst: "Walking a line to find the best, nearest film across waypoints",
    body: [
      "One suggestion for the search algo for Marquee might be to use naive hill-climbing, which would mean that we would improve on the result by making small changes as we search.",
      "That wouldn't work here as the nearest neighbours of a film are usually its own sequels, we end up with a poor result or obvious recommendations like recommending Aliens if you saw Alien.",
      "I want something a bit more interesting than that so it was a straight line algo instead. At each fraction along the line that the algo walks, it will query Vectorize to see which title sits nearest to the current point, at the point that it finds a good match, it will return it.",
      "The algo will reject a candidate if it is barely a step away from the previous title it was on. It will also reject a candidate if it is not closer to the far end than the step before.",
      "It won't go on infinitely though, if it can't find a qualifier, it will stop early.",
    ],
    diagram: {
      lanes: [],
      after: [
        { label: "Two titles", tone: "input" },
        { label: "readVectors", note: "both endpoints", tone: "store" },
        { label: "Interpolate", note: "waypoints along the line" },
        { label: "Vectorize", note: "nearest to each", tone: "store" },
        { label: "Filter", note: "novel + strictly closer" },
        { label: "Path", tone: "output" },
      ],
      caption:
        "Cosine to the far end is printed against every hop on the panel, so you can check the walk really is converging.",
    },
    code: [
      { path: "worker/services/title-path.ts", what: "Defines the path of titles to walk" },
      { path: "worker/lib/vector.ts", what: "Defines the cosine logic alongside normalisation" },
      {
        path: "worker/services/embeddings.ts",
        what: "Provides the logic to be used alongside Vectorize",
      },
    ],
  },

  screen: {
    heading: "Reviving old content",
    standfirst: "How I show archival content and hope that I won't get sued",
    body: [
      "As I was developing Marquee I thought that it would be great to have our own little streaming space but Marquee definitely isn't big enough to stream modern films. Instead, I thought a good idea would be to use archival videos and so the Revival House was born.",
      "This feature collects archival content from the Internet Archive, LoC and Europeana. This content is then classified using author metadata from Wikidata.",
      "With the author data, we work out when the death date of the contributors was. That allows us to clear the UK term for public domain content and stream it from our own R2 mirror bucket. If we cannot confirm then we will fall back to streaming directly from the content provider themselves.",
      "Our R2 bucket is a copied version of the content. When the first user plays an approved piece of content, a queue item will be triggered to copy it to our R2 bucket in 32MB parts using multipart upload. This all happens in the background and can be stopped then started. No need to hold the whole file in the worker.",
    ],
    diagram: {
      lanes: [],
      after: [
        { label: "Candidate", note: "archive, LoC or Europeana", tone: "input" },
        { label: "Wikidata", note: "authors + death dates", tone: "store" },
        { label: "UK term", note: "70y from the last to die" },
        { label: "R2 mirror", note: "queued, 32 MB parts", tone: "store" },
        { label: "206 ranges", tone: "output" },
      ],
    },
    code: [
      { path: "worker/services/revival-rights.ts", what: "The UK term test and its verdicts" },
      { path: "worker/clients/wikidata-rights.ts", what: "Reading authors and death dates" },
      { path: "worker/services/revival-mirror.ts", what: "The resumable multipart copy into R2" },
      { path: "worker/routes/reel.ts", what: "Byte-range serving so the scrubber works" },
    ],
  },

  street: {
    heading: "Providing location aware data",
    standfirst: "Using Cloudflare's edge as a geo identifier.",
    body: [
      "Cloudflare already gives us geo data for free on every request arriving at our worker, we can use this with a bounding box to work out roughly where the user is, without needing to use any other APIs.",
      "This can be used for various places but in particular, we are using it for cinema recommendations to show users a list of cinemas that are currently showing their content, near where they are.",
    ],
    diagram: {
      lanes: [],
      after: [
        { label: "Request", note: "edge geo attached", tone: "input" },
        { label: "Bounding box", note: "town-level" },
        { label: "Adapters", note: "Cineworld, Picturehouse, Vue" },
        { label: "Match to catalogue" },
        { label: "Panel", note: "times, days or a link", tone: "output" },
      ],
    },
    code: [
      { path: "worker/lib/geo.ts", what: "Reading the edge position and its bounding box" },
      { path: "worker/clients/cinema/index.ts", what: "The adapter registry" },
      { path: "worker/services/cinema.ts", what: "Matching listings to catalogue titles" },
    ],
  },

  door: {
    heading: "Keeping Marquee public",
    standfirst: "Using rate limiting and bot checks so that our data can be open",
    body: [
      "In order to keep Marquee public and open without costing me a ton of money and stopping the database from blowing up, we are using centralised rate limiting and bot checks across routes.",
      "Each path then has its own policy to define the budget for that route. We configure rate limiting with Cloudflare's built-in rate limiting feature and use the metadata that Cloudflare already supplies to us on every request for the bot checks.",
    ],
    diagram: {
      lanes: [],
      after: [
        { label: "Request", tone: "input" },
        { label: "Match rule", note: "first match wins" },
        { label: "Bot check", note: "stance from policy" },
        { label: "Rate limiter", note: "keyed per identity" },
        { label: "Route or 429", tone: "output" },
      ],
    },
    code: [
      { path: "worker/security/guard.ts", what: "The middleware that is applied to every route" },
      {
        path: "worker/security/policies.ts",
        what: "Individual policies for all the routes",
      },
      { path: "worker/security/bots.ts", what: "The bot assessment and its stances" },
    ],
  },

  booth: {
    heading: "Ingesting millions of records",
    standfirst: "Performing sweep merges over cron jobs",
    body: [
      "Marquee is performing an ingestion across two main jobs. It has a light pass that is triggered every three hours and then a nightly pass that will fan over as many of TMDB's discover pages as possible.",
      "In the background, this uses Cloudflare Workflows and Queues to conduct these jobs. Workflows is particularly awesome as it will survive restarts and will automatically retry individual steps for us. Alongside that, it has great auditing.",
      "If any records are changed, we automatically hash it and then make an embedding for that content.",
    ],
    diagram: {
      lanes: [],
      after: [
        { label: "Cron", note: "3-hourly and nightly", tone: "input" },
        { label: "Workflow", note: "durable, retryable" },
        { label: "Queue", note: "fanned out per page" },
        { label: "Content hash", note: "skip if unchanged" },
        { label: "Postgres + Vectorize", tone: "store" },
      ],
      caption:
        "The counters on this stop are the result of that pipeline, read straight out of Postgres rather than kept in a stat table.",
    },
    code: [
      { path: "worker/workflows/catalog-sweep.ts", what: "Cron jobs and sweep steps" },
      { path: "worker/jobs/ingestion-consumer.ts", what: "The queue consumer" },
      { path: "worker/services/embeddings.ts", what: "Content hashing and batched embedding" },
    ],
  },

  exit: {
    heading: "External integrations",
    standfirst: "A browser, an agent, a calendar and a feed reader with centralised data.",
    body: [
      "Alongside all of these features, we also provide external implementations. For Agents we are supplying nine tools over an MCP endpoint that is secured by a user scoped token. We also supply Atom feeds and iCalendar links for users who want them.",
    ],
    diagram: {
      lanes: [
        { name: "People", nodes: [{ label: "React app", tone: "input" }] },
        { name: "Agents", nodes: [{ label: "MCP", note: "9 scoped tools", tone: "input" }] },
        {
          name: "Elsewhere",
          nodes: [{ label: "iCal + Atom", note: "hashed keys", tone: "input" }],
        },
      ],
      after: [
        { label: "One Worker" },
        { label: "Services" },
        { label: "Postgres, R2, Vectorize, KV", tone: "store" },
      ],
    },
    code: [
      { path: "worker/routes/mcp.ts", what: "The MCP endpoint and its transport" },
      { path: "src/domain/scopes.ts", what: "The scopes definition" },
      { path: "worker/routes/feeds.ts", what: "iCalendar and Atom" },
    ],
  },
};
