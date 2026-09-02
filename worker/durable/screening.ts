import { DurableObject } from "cloudflare:workers";

import { avatarFor } from "../../src/domain/avatars.ts";
import type { MediaTitle } from "../../src/domain/catalog.ts";
import { ROOMS } from "../../src/domain/screening-rooms.ts";
import {
  type CursorMark,
  type FeedEntry,
  findTool,
  type GameState,
  type Member,
  memberTally,
  mentionsHandle,
  parseClientMessage,
  type PollState,
  type RoomDefinition,
  type RoomSnapshot,
  SCREENING_LIMITS,
  type ScreeningStatus,
  type ServerMessage,
  stageOf,
  type SteerState,
} from "../../src/domain/screening.ts";
import { logError } from "../lib/logging.ts";
import { isRecord } from "../lib/values.ts";
import { buildQuiz, type QuizQuestion, steerPool } from "../services/quiz.ts";
import { answerAsUsher, narrateAsUsher } from "../services/screening-usher.ts";
import type { WorkerBindings } from "../types.ts";

const ROOM_KEY = "room";
const GAME_KEY = "game";
const STEER_KEY = "steer";
const POLLS_KEY = "polls";
const POLL_HISTORY = 10;
const ALARM_KEY = "alarm";
const MEMBER_PREFIX = "member:";
const FEED_PREFIX = "feed:";
const RETENTION_DAYS = 7;
const ASK_COOLDOWN_MS = 20_000;
const RECENT_FOR_USHER = 8;
const CURSOR_FLUSH_MS = 100;
const CURSOR_RELAY_CAP = 80;
const REACTION_COOLDOWN_MS = 400;
const HOST_MOVE_SETTLE_MS = 4_000;
const REVEAL_MS = 5_000;
const WALK_MS = 90_000;
const STEER_OPTIONS = 4;
const CORRECT_POINTS = 100;
const SPEED_POINTS = 50;

type RoomRecord = {
  id: string;
  definition: RoomDefinition;
  status: ScreeningStatus;
  createdAt: string;
  hostKey: string;
  hostStage: string | null;
  lightsDown?: boolean;
  seq: number;
  ordinals: Record<string, number>;
};

type GameRecord = Omit<GameState, "question" | "correct" | "counts"> & {
  seconds: number;
  questions: QuizQuestion[];
  answers: Record<string, { optionId: string; at: number }>;
};

type SteerRecord = SteerState & { pool: MediaTitle[]; votes: Record<string, string> };

type PollRecord = PollState & { votes: Record<string, string> };

type AlarmPlan = { kind: "game" | "steer" | "retention" };

export type OpenInput = {
  id: string;
  definition: RoomDefinition;
  hostKey: string;
};

export type ScreeningResult =
  | { ok: true; room: RoomSnapshot }
  | {
      ok: false;
      reason:
        | "missing"
        | "exists"
        | "closed"
        | "unknown_option"
        | "forbidden"
        | "full"
        | "not_member";
    };

function definitionOf(room: RoomRecord) {
  return ROOMS[room.definition.kind] ?? room.definition;
}

function attachedKey(ws: WebSocket) {
  const attachment: unknown = ws.deserializeAttachment();

  return isRecord(attachment) && typeof attachment.key === "string" ? attachment.key : "";
}

function tallyOf(votes: Record<string, string>) {
  const counts: Record<string, number> = {};

  for (const choice of Object.values(votes)) {
    counts[choice] = (counts[choice] ?? 0) + 1;
  }

  return counts;
}

function winnerOf(options: MediaTitle[], votes: Record<string, string>) {
  const counts = tallyOf(votes);

  return options.toSorted((left, right) => (counts[right.id] ?? 0) - (counts[left.id] ?? 0))[0];
}

export class Screening extends DurableObject<WorkerBindings> {
  private answering = false;
  private lastAsk = new Map<string, number>();
  private lastReaction = new Map<string, number>();
  private lastCursor = new Map<string, CursorMark>();
  private pendingCursors = new Map<string, CursorMark>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private hostMoveTimer: ReturnType<typeof setTimeout> | null = null;
  private notedHostStage: string | null = null;

  async open(input: OpenInput): Promise<ScreeningResult> {
    if (await this.room()) {
      return { ok: false, reason: "exists" };
    }

    const record: RoomRecord = {
      id: input.id,
      definition: input.definition,
      status: "open",
      createdAt: new Date().toISOString(),
      hostKey: input.hostKey,
      hostStage: null,
      seq: 0,
      ordinals: {},
    };

    await this.ctx.storage.put(ROOM_KEY, record);
    await this.scheduleRetention();

    return { ok: true, room: await this.snapshot(record, input.hostKey) };
  }

  async read(viewerKey: string): Promise<ScreeningResult> {
    const room = await this.room();

    return room
      ? { ok: true, room: await this.snapshot(room, viewerKey) }
      : { ok: false, reason: "missing" };
  }

  async join(
    viewerKey: string,
    name: string | null,
    optionId: string,
    first: string | null,
  ): Promise<ScreeningResult> {
    const room = await this.room();

    if (!room) {
      return { ok: false, reason: "missing" };
    }

    if (await this.member(viewerKey)) {
      return { ok: true, room: await this.snapshot(room, viewerKey) };
    }

    if (room.status !== "open") {
      return { ok: false, reason: "closed" };
    }

    const ballot = findTool(definitionOf(room), "ballot");
    const option = ballot?.options.find((candidate) => candidate.id === optionId);

    if (!option) {
      return { ok: false, reason: "unknown_option" };
    }

    const members = await this.members();

    if (members.length >= SCREENING_LIMITS.members) {
      return { ok: false, reason: "full" };
    }

    const ordinal = room.ordinals[option.id] ?? 0;
    const avatar = avatarFor(option.id, ordinal);
    const member: Member = {
      key: viewerKey,
      name: name ?? (avatar ? (first ? `${avatar.name} · ${first}` : avatar.name) : option.label),
      role: viewerKey === room.hostKey ? "host" : "guest",
      choice: option.id,
      avatar: avatar?.id ?? "",
      stage: null,
      online: false,
      joinedAt: new Date().toISOString(),
    };

    room.ordinals[option.id] = ordinal + 1;
    await this.ctx.storage.put(`${MEMBER_PREFIX}${viewerKey}`, member);
    await this.ctx.storage.put(ROOM_KEY, room);
    this.broadcast({ type: "member", member });

    await this.note(
      room,
      viewerKey,
      "join",
      `took a ticket for ${option.label}${avatar ? ` as ${avatar.name}` : ""}`,
    );

    return { ok: true, room: await this.snapshot(room, viewerKey) };
  }

  async takeTorch(viewerKey: string): Promise<ScreeningResult> {
    const room = await this.room();
    const member = await this.member(viewerKey);

    if (!room) {
      return { ok: false, reason: "missing" };
    }

    if (!member) {
      return { ok: false, reason: "not_member" };
    }

    if (room.hostKey !== viewerKey) {
      const previous = await this.member(room.hostKey);

      room.hostKey = viewerKey;
      room.hostStage = member.stage;
      await this.ctx.storage.put(ROOM_KEY, room);

      if (previous) {
        previous.role = "guest";
        await this.ctx.storage.put(`${MEMBER_PREFIX}${previous.key}`, previous);
        this.broadcast({ type: "member", member: previous });
      }

      member.role = "host";
      await this.ctx.storage.put(`${MEMBER_PREFIX}${viewerKey}`, member);
      this.broadcast({ type: "member", member });
      this.broadcast({ type: "host", stage: room.hostStage });
      await this.note(room, viewerKey, "status", "took the torch");
    }

    return { ok: true, room: await this.snapshot(room, viewerKey) };
  }

  async setStatus(viewerKey: string, status: ScreeningStatus): Promise<ScreeningResult> {
    const room = await this.room();

    if (!room) {
      return { ok: false, reason: "missing" };
    }

    if (room.hostKey !== viewerKey) {
      return { ok: false, reason: "forbidden" };
    }

    room.status = status;
    await this.ctx.storage.put(ROOM_KEY, room);
    this.broadcast({ type: "status", status });
    await this.note(
      room,
      viewerKey,
      "status",
      status === "open" ? "opened the doors again" : "closed the doors",
    );

    return { ok: true, room: await this.snapshot(room, viewerKey) };
  }

  async fetch(request: Request) {
    const key = request.headers.get("x-member-key") ?? "";
    const room = await this.room();
    const member = key ? await this.member(key) : null;

    if (request.headers.get("upgrade") !== "websocket" || !room || !member) {
      return new Response(null, { status: member ? 426 : 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.ctx.acceptWebSocket(server, [key]);
    server.serializeAttachment({ key });

    if (!member.online) {
      member.online = true;
      await this.ctx.storage.put(`${MEMBER_PREFIX}${key}`, member);
      this.broadcast({ type: "member", member }, server);
    }

    server.send(JSON.stringify({ type: "snapshot", room: await this.snapshot(room, key) }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const key = attachedKey(ws);
    const message = parseClientMessage(raw);
    const room = await this.room();
    const member = await this.member(key);

    if (!message || !room || !member) {
      return;
    }

    const isHost = key === room.hostKey;

    switch (message.type) {
      case "cursor": {
        if (findTool(definitionOf(room), "cursors") && stageOf(definitionOf(room), message.stage)) {
          this.queueCursor({ key, stage: message.stage, x: message.x, y: message.y });
        }

        return;
      }

      case "stage": {
        if (!stageOf(definitionOf(room), message.stage) || member.stage === message.stage) {
          return;
        }

        member.stage = message.stage;
        await this.ctx.storage.put(`${MEMBER_PREFIX}${key}`, member);
        this.broadcast({ type: "member", member });

        if (isHost) {
          room.hostStage = message.stage;
          await this.ctx.storage.put(ROOM_KEY, room);
          this.broadcast({ type: "host", stage: message.stage });
          this.noteHostMove(room.id);
        }

        return;
      }

      case "say": {
        if (!message.text) {
          return;
        }

        if (room.status !== "open") {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "The doors are shut. Nobody is taking messages.",
            }),
          );

          return;
        }

        const entry = await this.append(room, { kind: "say", member: key, text: message.text });

        this.broadcast({ type: "feed", entry });

        const usher = findTool(definitionOf(room), "usher");

        if (usher && mentionsHandle(message.text, usher.trigger.handle)) {
          this.ctx.waitUntil(this.answer(room, member, entry));
        }

        return;
      }

      case "act": {
        const stage = stageOf(definitionOf(room), message.stage);
        const label = stage?.actions?.[message.verb];

        if (!findTool(definitionOf(room), "stages") || !stage || !label || room.status !== "open") {
          return;
        }

        const entry = await this.append(room, {
          kind: "act",
          member: key,
          text: message.detail,
          stage: stage.id,
          verb: message.verb,
        });

        this.broadcast({ type: "feed", entry });

        return;
      }

      case "game": {
        if (!isHost) {
          return;
        }

        if (message.action === "start") {
          await this.startGame(room, member);
        } else {
          await this.ctx.storage.delete(GAME_KEY);
          this.broadcast({ type: "game", game: null });
          await this.scheduleRetention();
        }

        return;
      }

      case "answer": {
        await this.answerQuestion(room, key, message.optionId);

        return;
      }

      case "steer": {
        if (!isHost) {
          return;
        }

        if (message.action === "start") {
          await this.startSteer(room, member);
        } else {
          await this.ctx.storage.delete(STEER_KEY);
          this.broadcast({ type: "steer", steer: null });
          await this.scheduleRetention();
        }

        return;
      }

      case "pick": {
        const steer = await this.ctx.storage.get<SteerRecord>(STEER_KEY);

        if (
          !steer ||
          steer.phase === "walk" ||
          !steer.options.some((candidate) => candidate.id === message.optionId)
        ) {
          return;
        }

        steer.votes[key] = message.optionId;
        await this.ctx.storage.put(STEER_KEY, steer);
        this.broadcast({ type: "steer", steer: this.steerView(steer) });

        return;
      }

      case "poll": {
        if (!isHost) {
          return;
        }

        if (message.action === "start") {
          await this.startPoll(room, member);
        } else {
          await this.closePoll(room);
        }

        return;
      }

      case "vote": {
        const polls = await this.polls();
        const open = polls.find((poll) => poll.status === "open");

        if (!open || !open.options.some((candidate) => candidate.id === message.optionId)) {
          return;
        }

        open.votes[key] = message.optionId;
        await this.ctx.storage.put(POLLS_KEY, polls);
        this.broadcast({ type: "polls", polls: polls.map((poll) => this.pollView(poll)) });

        return;
      }

      case "lights": {
        if (!isHost || Boolean(room.lightsDown) === message.down) {
          return;
        }

        room.lightsDown = message.down;
        await this.ctx.storage.put(ROOM_KEY, room);
        this.broadcast({ type: "lights", down: message.down });
        await this.note(
          room,
          key,
          "status",
          message.down ? "put the lights down" : "brought the lights up",
        );

        return;
      }

      case "react": {
        const reactions = findTool(definitionOf(room), "reactions");
        const last = this.lastReaction.get(key) ?? 0;

        if (!reactions?.emoji.includes(message.emoji) || Date.now() - last < REACTION_COOLDOWN_MS) {
          return;
        }

        this.lastReaction.set(key, Date.now());

        const mark = this.lastCursor.get(key);
        const stage =
          mark?.stage ?? member.stage ?? room.hostStage ?? definitionOf(room).stages[0]?.id ?? "";

        this.broadcast({
          type: "reaction",
          key,
          emoji: message.emoji,
          stage,
          x: mark?.x ?? 0.5,
          y: mark?.y ?? 0.5,
        });

        return;
      }

      default:
        return;
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.disconnect(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.disconnect(ws);
  }

  async alarm() {
    const plan = await this.ctx.storage.get<AlarmPlan>(ALARM_KEY);
    const room = await this.room();

    if (!room) {
      await this.ctx.storage.deleteAll();

      return;
    }

    switch (plan?.kind) {
      case "game":
        await this.advanceGame(room);

        return;
      case "steer":
        await this.advanceSteer(room);

        return;
      default:
        await this.ctx.storage.deleteAll();
    }
  }

  private noteHostMove(roomId: string) {
    if (this.hostMoveTimer) {
      clearTimeout(this.hostMoveTimer);
    }

    this.hostMoveTimer = setTimeout(() => {
      this.hostMoveTimer = null;
      this.ctx.waitUntil(this.settleHostMove(roomId));
    }, HOST_MOVE_SETTLE_MS);
  }

  private async settleHostMove(roomId: string) {
    const room = await this.room();

    if (!room || room.id !== roomId || !room.hostStage || room.hostStage === this.notedHostStage) {
      return;
    }

    this.notedHostStage = room.hostStage;

    const stage = stageOf(definitionOf(room), room.hostStage);

    await this.note(
      room,
      null,
      "note",
      `The usher has taken the party to ${stage?.name.toLowerCase() ?? "the next stop"}.`,
    );
  }

  private queueCursor(mark: CursorMark) {
    this.lastCursor.set(mark.key, mark);

    if (this.ctx.getWebSockets().length > CURSOR_RELAY_CAP) {
      return;
    }

    this.pendingCursors.set(mark.key, mark);

    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;

      const marks = [...this.pendingCursors.values()];

      this.pendingCursors.clear();

      if (marks.length > 0) {
        this.broadcast({ type: "cursors", marks });
      }
    }, CURSOR_FLUSH_MS);
  }

  private async startGame(room: RoomRecord, host: Member) {
    const tool = findTool(definitionOf(room), "games");
    const current = await this.ctx.storage.get<GameRecord>(GAME_KEY);

    if (!tool || (current && current.phase !== "over")) {
      return;
    }

    let questions: QuizQuestion[] = [];

    try {
      questions = await buildQuiz(this.env, tool.kinds, tool.rounds);
    } catch (error) {
      logError("screening_quiz_failed", error);
    }

    if (questions.length === 0) {
      await this.note(
        room,
        null,
        "note",
        "The quickfire could not be set up. The catalogue is not answering.",
      );

      return;
    }

    const game: GameRecord = {
      id: crypto.randomUUID(),
      round: 1,
      of: questions.length,
      phase: "question",
      endsAt: Date.now() + tool.seconds * 1_000,
      seconds: tool.seconds,
      questions,
      answers: {},
      scores: {},
    };

    await this.ctx.storage.put(GAME_KEY, game);
    await this.schedule("game", game.endsAt);
    this.broadcast({ type: "game", game: this.gameView(game) });
    await this.note(
      room,
      host.key,
      "status",
      `started the quickfire. ${game.of} rounds, ${tool.seconds} seconds each.`,
    );
  }

  private async answerQuestion(room: RoomRecord, key: string, optionId: string) {
    const game = await this.ctx.storage.get<GameRecord>(GAME_KEY);
    const question = game?.questions[game.round - 1];

    if (
      !game ||
      !question ||
      game.phase !== "question" ||
      game.answers[key] ||
      !question.options.some((candidate) => candidate.id === optionId)
    ) {
      return;
    }

    game.answers[key] = { optionId, at: Date.now() };
    await this.ctx.storage.put(GAME_KEY, game);

    const online = new Set(this.ctx.getWebSockets().map(attachedKey));

    if ([...online].every((member) => game.answers[member])) {
      await this.advanceGame(room);
    }
  }

  private async advanceGame(room: RoomRecord) {
    const game = await this.ctx.storage.get<GameRecord>(GAME_KEY);

    if (!game) {
      await this.scheduleRetention();

      return;
    }

    if (game.phase === "question") {
      const question = game.questions[game.round - 1];
      const openedAt = game.endsAt - game.seconds * 1_000;

      for (const [key, answer] of Object.entries(game.answers)) {
        if (answer.optionId === question.correct) {
          const remaining = Math.max(0, 1 - (answer.at - openedAt) / (game.seconds * 1_000));

          game.scores[key] =
            (game.scores[key] ?? 0) + CORRECT_POINTS + Math.round(SPEED_POINTS * remaining);
        }
      }

      game.phase = "reveal";
      game.endsAt = Date.now() + REVEAL_MS;
    } else if (game.phase === "reveal" && game.round < game.of) {
      game.round += 1;
      game.phase = "question";
      game.answers = {};
      game.endsAt = Date.now() + game.seconds * 1_000;
    } else if (game.phase === "reveal") {
      game.phase = "over";
      game.endsAt = Date.now();
    } else {
      await this.scheduleRetention();

      return;
    }

    await this.ctx.storage.put(GAME_KEY, game);
    this.broadcast({ type: "game", game: this.gameView(game) });

    if (game.phase === "over") {
      await this.scheduleRetention();
      this.ctx.waitUntil(this.closeGame(room, game));
    } else {
      await this.schedule("game", game.endsAt);
    }
  }

  private async closeGame(room: RoomRecord, game: GameRecord) {
    const members = new Map((await this.members()).map((member) => [member.key, member]));
    const standings = Object.entries(game.scores)
      .toSorted(([, left], [, right]) => right - left)
      .slice(0, 3)
      .map(([key, score]) => `${members.get(key)?.name ?? "Someone"} ${score}`);
    const summary =
      standings.length > 0
        ? `Quickfire over after ${game.of} rounds. Standings: ${standings.join(", ")}.`
        : `Quickfire over after ${game.of} rounds. Nobody scored.`;

    await this.note(room, null, "note", summary);

    if (!findTool(definitionOf(room), "usher") || standings.length === 0) {
      return;
    }

    try {
      const text = await narrateAsUsher(this.env, summary);

      if (text) {
        await this.note(room, null, "usher", text);
      }
    } catch (error) {
      logError("screening_narration_failed", error);
    }
  }

  private gameView(game: GameRecord): GameState {
    const question = game.questions[game.round - 1];
    const revealed = game.phase !== "question";

    return {
      id: game.id,
      round: game.round,
      of: game.of,
      phase: game.phase,
      endsAt: game.endsAt,
      question: question
        ? {
            kind: question.kind,
            prompt: question.prompt,
            posterUrl: question.posterUrl,
            options: question.options,
          }
        : null,
      correct: revealed && question ? question.correct : null,
      counts: revealed
        ? tallyOf(
            Object.fromEntries(
              Object.entries(game.answers).map(([key, answer]) => [key, answer.optionId]),
            ),
          )
        : {},
      scores: game.scores,
    };
  }

  private async startSteer(room: RoomRecord, host: Member) {
    const tool = findTool(definitionOf(room), "steer");

    if (!tool || (await this.ctx.storage.get<SteerRecord>(STEER_KEY))) {
      return;
    }

    let pool: MediaTitle[] = [];

    try {
      pool = await steerPool(this.env, STEER_OPTIONS * 2);
    } catch (error) {
      logError("screening_steer_failed", error);
    }

    if (pool.length < STEER_OPTIONS * 2) {
      await this.note(
        room,
        null,
        "note",
        "The corridor cannot be steered just now. The catalogue is not answering.",
      );

      return;
    }

    const steer: SteerRecord = {
      id: crypto.randomUUID(),
      phase: "from",
      options: pool.slice(0, STEER_OPTIONS),
      endsAt: Date.now() + tool.seconds * 1_000,
      counts: {},
      from: null,
      to: null,
      pool,
      votes: {},
    };

    await this.ctx.storage.put(STEER_KEY, steer);
    await this.schedule("steer", steer.endsAt);
    this.broadcast({ type: "steer", steer: this.steerView(steer) });
    await this.note(
      room,
      host.key,
      "status",
      "handed the corridor to the room. Vote where the walk starts.",
    );
  }

  private async advanceSteer(room: RoomRecord) {
    const tool = findTool(definitionOf(room), "steer");
    const steer = await this.ctx.storage.get<SteerRecord>(STEER_KEY);

    if (!steer || !tool) {
      await this.scheduleRetention();

      return;
    }

    if (steer.phase === "from") {
      steer.from = winnerOf(steer.options, steer.votes);
      steer.phase = "to";
      steer.options = steer.pool.slice(STEER_OPTIONS);
      steer.votes = {};
      steer.endsAt = Date.now() + tool.seconds * 1_000;
      await this.ctx.storage.put(STEER_KEY, steer);
      await this.schedule("steer", steer.endsAt);
      this.broadcast({ type: "steer", steer: this.steerView(steer) });

      return;
    }

    if (steer.phase === "to") {
      steer.to = winnerOf(steer.options, steer.votes);
      steer.phase = "walk";
      steer.options = [];
      steer.votes = {};
      steer.endsAt = Date.now() + WALK_MS;
      await this.ctx.storage.put(STEER_KEY, steer);
      await this.schedule("steer", steer.endsAt);
      this.broadcast({ type: "steer", steer: this.steerView(steer) });
      await this.note(
        room,
        null,
        "note",
        `The room sent the corridor from ${steer.from?.title ?? "somewhere"} to ${steer.to?.title ?? "somewhere else"}.`,
      );

      return;
    }

    await this.ctx.storage.delete(STEER_KEY);
    this.broadcast({ type: "steer", steer: null });
    await this.scheduleRetention();
  }

  private async startPoll(room: RoomRecord, host: Member) {
    const tool = findTool(definitionOf(room), "polls");
    const polls = await this.polls();

    if (!tool || polls.some((poll) => poll.status === "open")) {
      return;
    }

    let options: MediaTitle[] = [];

    try {
      options = await steerPool(this.env, tool.size);
    } catch (error) {
      logError("screening_poll_failed", error);
    }

    if (options.length < 2) {
      await this.note(
        room,
        null,
        "note",
        "The poll could not be set up. The catalogue is not answering.",
      );

      return;
    }

    const poll: PollRecord = {
      id: crypto.randomUUID(),
      question: tool.question,
      options,
      counts: {},
      status: "open",
      openedAt: new Date().toISOString(),
      winner: null,
      votes: {},
    };
    const next = [poll, ...polls].slice(0, POLL_HISTORY);

    await this.ctx.storage.put(POLLS_KEY, next);
    this.broadcast({ type: "polls", polls: next.map((entry) => this.pollView(entry)) });
    await this.note(room, host.key, "status", `opened a poll. ${tool.question}`);
  }

  private async closePoll(room: RoomRecord) {
    const polls = await this.polls();
    const open = polls.find((poll) => poll.status === "open");

    if (!open) {
      return;
    }

    const winner = winnerOf(open.options, open.votes);
    const votes = Object.values(open.votes);
    const backing = votes.filter((choice) => choice === winner.id).length;

    open.status = "closed";
    open.winner = votes.length > 0 ? winner.id : null;
    await this.ctx.storage.put(POLLS_KEY, polls);
    this.broadcast({ type: "polls", polls: polls.map((entry) => this.pollView(entry)) });
    await this.note(
      room,
      null,
      "note",
      votes.length > 0
        ? `The house picked ${winner.title} with ${backing} of ${votes.length} votes.`
        : "The poll closed with nobody voting. Tough crowd.",
    );
  }

  private pollView(poll: PollRecord): PollState {
    return {
      id: poll.id,
      question: poll.question,
      options: poll.options,
      counts: tallyOf(poll.votes),
      status: poll.status,
      openedAt: poll.openedAt,
      winner: poll.winner,
    };
  }

  private async polls() {
    return (await this.ctx.storage.get<PollRecord[]>(POLLS_KEY)) ?? [];
  }

  private steerView(steer: SteerRecord): SteerState {
    return {
      id: steer.id,
      phase: steer.phase,
      options: steer.options,
      endsAt: steer.endsAt,
      counts: tallyOf(steer.votes),
      from: steer.from,
      to: steer.to,
    };
  }

  private async disconnect(ws: WebSocket) {
    const key = attachedKey(ws);
    const others = this.ctx.getWebSockets(key).filter((socket) => socket !== ws);
    const member = await this.member(key);

    if (others.length > 0 || !member || !member.online) {
      return;
    }

    member.online = false;
    await this.ctx.storage.put(`${MEMBER_PREFIX}${key}`, member);
    this.broadcast({ type: "member", member }, ws);
  }

  private async answer(room: RoomRecord, member: Member, ask: FeedEntry) {
    const now = Date.now();
    const last = this.lastAsk.get(member.key) ?? 0;

    if (now - last < ASK_COOLDOWN_MS || this.answering) {
      await this.note(
        room,
        null,
        "note",
        this.answering
          ? "The usher is still with someone. Give him a moment."
          : "One question at a time. He is not a search engine.",
        ask.id,
      );

      return;
    }

    this.lastAsk.set(member.key, now);
    this.answering = true;

    try {
      const recent = (await this.feed()).slice(-RECENT_FOR_USHER);
      const text = await answerAsUsher(this.env, {
        question: ask.text,
        asker: member.name,
        room: definitionOf(room),
        stage: stageOf(definitionOf(room), room.hostStage),
        recent: recent.map((entry) => `${entry.kind}: ${entry.text}`),
        house: await this.houseBrief(room),
      });

      await this.note(room, null, "usher", text, ask.id);
    } catch (error) {
      logError("screening_usher_failed", error);
      await this.note(
        room,
        null,
        "note",
        "The usher heard you. The booth is not answering him either.",
        ask.id,
      );
    } finally {
      this.answering = false;
    }
  }

  private async houseBrief(room: RoomRecord) {
    const definition = definitionOf(room);
    const members = await this.members();
    const tally = memberTally(definition, members);
    const ballot = findTool(definition, "ballot");
    const game = await this.ctx.storage.get<GameRecord>(GAME_KEY);
    const steer = await this.ctx.storage.get<SteerRecord>(STEER_KEY);
    const open = (await this.polls()).find((poll) => poll.status === "open");
    const lines = [
      `In the room: ${members.map((entry) => `${entry.name}${entry.online ? "" : " (stepped out)"}${entry.role === "host" ? " (host, has the torch)" : ""}`).join("; ") || "nobody yet"}.`,
      ballot
        ? `Tickets by cinema: ${ballot.options.map((option) => `${option.label} ${tally[option.id] ?? 0}`).join(", ")}.`
        : "",
      game
        ? `A quickfire is ${game.phase === "over" ? "just finished" : `on round ${game.round} of ${game.of}`}.`
        : "",
      steer
        ? `The room is steering the corridor (${steer.phase}${steer.from ? `, from ${steer.from.title}` : ""}${steer.to ? ` to ${steer.to.title}` : ""}).`
        : "",
      open
        ? `An open poll asks "${open.question}" over ${open.options.map((title) => title.title).join(", ")}.`
        : "",
    ];

    return lines.filter(Boolean).join("\n");
  }

  private async note(
    room: RoomRecord,
    member: string | null,
    kind: FeedEntry["kind"],
    text: string,
    replyTo?: string,
  ) {
    const entry = await this.append(room, { kind, member, text, ...(replyTo ? { replyTo } : {}) });

    this.broadcast({ type: "feed", entry });

    return entry;
  }

  private async append(room: RoomRecord, entry: Omit<FeedEntry, "id" | "at">) {
    return this.ctx.storage.transaction(async (txn) => {
      const latest = (await txn.get<RoomRecord>(ROOM_KEY)) ?? room;
      const seq = latest.seq + 1;
      const full: FeedEntry = {
        ...entry,
        id: String(seq).padStart(6, "0"),
        at: new Date().toISOString(),
      };

      latest.seq = seq;
      room.seq = seq;
      await txn.put(ROOM_KEY, latest);
      await txn.put(`${FEED_PREFIX}${full.id}`, full);

      return full;
    });
  }

  private broadcast(message: ServerMessage, except?: WebSocket) {
    const payload = JSON.stringify(message);

    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) {
        continue;
      }

      try {
        socket.send(payload);
      } catch {
        continue;
      }
    }
  }

  private room() {
    return this.ctx.storage.get<RoomRecord>(ROOM_KEY);
  }

  private member(key: string) {
    return this.ctx.storage.get<Member>(`${MEMBER_PREFIX}${key}`);
  }

  private async members() {
    return [...(await this.ctx.storage.list<Member>({ prefix: MEMBER_PREFIX })).values()];
  }

  private async feed() {
    const tail = await this.ctx.storage.list<FeedEntry>({
      prefix: FEED_PREFIX,
      reverse: true,
      limit: SCREENING_LIMITS.feedTail,
    });

    return [...tail.values()].toReversed();
  }

  private async snapshot(room: RoomRecord, viewerKey: string): Promise<RoomSnapshot> {
    const game = await this.ctx.storage.get<GameRecord>(GAME_KEY);
    const steer = await this.ctx.storage.get<SteerRecord>(STEER_KEY);

    return {
      id: room.id,
      definition: definitionOf(room),
      status: room.status,
      createdAt: room.createdAt,
      hostStage: room.hostStage,
      members: await this.members(),
      feed: await this.feed(),
      you: viewerKey,
      game: game ? this.gameView(game) : null,
      steer: steer ? this.steerView(steer) : null,
      polls: (await this.polls()).map((poll) => this.pollView(poll)),
      lightsDown: Boolean(room.lightsDown),
    };
  }

  private async schedule(kind: AlarmPlan["kind"], at: number) {
    await this.ctx.storage.put(ALARM_KEY, { kind } satisfies AlarmPlan);
    await this.ctx.storage.setAlarm(at);
  }

  private async scheduleRetention() {
    const game = await this.ctx.storage.get<GameRecord>(GAME_KEY);
    const steer = await this.ctx.storage.get<SteerRecord>(STEER_KEY);

    if ((game && game.phase !== "over") || steer) {
      return;
    }

    await this.schedule("retention", Date.now() + RETENTION_DAYS * 86_400_000);
  }
}
