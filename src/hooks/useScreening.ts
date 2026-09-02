import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import {
  type Member,
  type RoomKind,
  type RoomSnapshot,
  SCREENING_LIMITS,
  type ScreeningStatus,
  type ServerMessage,
} from "../domain/screening";
import { jsonMutation, mutateJson, queryJsonFresh } from "../lib/query-client";
import { ScreeningSocket, screeningSocketUrl } from "../lib/screening-socket";

export type CursorMark = { stage: string; x: number; y: number; at: number };

export type Reaction = {
  id: number;
  key: string;
  emoji: string;
  stage: string;
  x: number;
  y: number;
  at: number;
};

export type Connection = "idle" | "connecting" | "live" | "offline";

type Choice = { context: string; optionId: string };

type State = {
  room: RoomSnapshot | null;
  cursors: Record<string, CursorMark>;
  reactions: Reaction[];
  answer: Choice | null;
  pick: Choice | null;
  vote: Choice | null;
  connection: Connection;
  error: string;
};

type Action =
  | { type: "room"; room: RoomSnapshot }
  | { type: "server"; message: ServerMessage }
  | { type: "connection"; value: Connection }
  | { type: "error"; message: string }
  | { type: "answer"; choice: Choice }
  | { type: "pick"; choice: Choice }
  | { type: "vote"; choice: Choice }
  | { type: "prune"; now: number }
  | { type: "reset" };

type RoomPayload = { room: RoomSnapshot };

const INITIAL: State = {
  room: null,
  cursors: {},
  reactions: [],
  answer: null,
  pick: null,
  vote: null,
  connection: "idle",
  error: "",
};
const CURSOR_TTL_MS = 6_000;
const REACTION_TTL_MS = 2_400;
const REACTION_CAP = 40;

let reactionSequence = 0;

function upsertMember(members: Member[], member: Member) {
  return members.some((entry) => entry.key === member.key)
    ? members.map((entry) => (entry.key === member.key ? member : entry))
    : [...members, member];
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "room":
      return { ...state, room: action.room, error: "" };
    case "connection":
      return { ...state, connection: action.value };
    case "error":
      return { ...state, error: action.message };
    case "answer":
      return { ...state, answer: action.choice };
    case "pick":
      return { ...state, pick: action.choice };
    case "vote":
      return { ...state, vote: action.choice };
    case "reset":
      return INITIAL;

    case "prune": {
      const cursors = Object.fromEntries(
        Object.entries(state.cursors).filter(([, mark]) => mark.at >= action.now - CURSOR_TTL_MS),
      );
      const reactions = state.reactions.filter(
        (reaction) => reaction.at >= action.now - REACTION_TTL_MS,
      );

      return { ...state, cursors, reactions };
    }

    case "server": {
      const { message } = action;

      if (message.type === "snapshot") {
        return { ...state, room: message.room, error: "" };
      }

      if (message.type === "cursors") {
        const now = Date.now();
        const cursors = { ...state.cursors };

        for (const mark of message.marks) {
          cursors[mark.key] = { stage: mark.stage, x: mark.x, y: mark.y, at: now };
        }

        return { ...state, cursors };
      }

      if (message.type === "reaction") {
        reactionSequence += 1;

        return {
          ...state,
          reactions: [
            ...state.reactions,
            {
              id: reactionSequence,
              key: message.key,
              emoji: message.emoji,
              stage: message.stage,
              x: message.x,
              y: message.y,
              at: Date.now(),
            },
          ].slice(-REACTION_CAP),
        };
      }

      if (message.type === "error") {
        return { ...state, error: message.message };
      }

      if (!state.room) {
        return state;
      }

      switch (message.type) {
        case "member":
          return {
            ...state,
            room: { ...state.room, members: upsertMember(state.room.members, message.member) },
          };
        case "host":
          return { ...state, room: { ...state.room, hostStage: message.stage } };
        case "feed":
          return {
            ...state,
            room: {
              ...state.room,
              feed: [...state.room.feed, message.entry].slice(-SCREENING_LIMITS.feedTail),
            },
          };
        case "status":
          return { ...state, room: { ...state.room, status: message.status } };
        case "game":
          return { ...state, room: { ...state.room, game: message.game } };
        case "steer":
          return { ...state, room: { ...state.room, steer: message.steer } };
        case "polls":
          return { ...state, room: { ...state.room, polls: message.polls } };
        case "lights":
          return { ...state, room: { ...state.room, lightsDown: message.down } };
        default:
          return state;
      }
    }

    default:
      return state;
  }
}

export function useScreening(initialId: string | null) {
  const [id, setId] = useState(initialId);
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const socketRef = useRef<ScreeningSocket | null>(null);
  const { room } = state;
  const you = useMemo(
    () => room?.members.find((member) => member.key === room.you) ?? null,
    [room],
  );
  const isMember = you !== null;

  useEffect(() => {
    if (!id) {
      dispatch({ type: "reset" });

      return undefined;
    }

    let cancelled = false;

    void (async () => {
      try {
        const payload = await queryJsonFresh<RoomPayload>(`/api/screenings/${id}`);

        if (!cancelled) {
          dispatch({ type: "room", room: payload.room });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: "error",
            message: error instanceof Error ? error.message : "The room is not answering.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !isMember) {
      return undefined;
    }

    const socket = new ScreeningSocket(screeningSocketUrl(id), {
      onMessage: (message) => dispatch({ type: "server", message }),
      onOpen: () => dispatch({ type: "connection", value: "live" }),
      onClose: () => dispatch({ type: "connection", value: "offline" }),
    });

    socketRef.current = socket;
    dispatch({ type: "connection", value: "connecting" });
    socket.connect();

    return () => {
      socket.close();
      socketRef.current = null;
      dispatch({ type: "connection", value: "idle" });
    };
  }, [id, isMember]);

  const hasEphemera = Object.keys(state.cursors).length > 0 || state.reactions.length > 0;

  useEffect(() => {
    if (!hasEphemera) {
      return undefined;
    }

    const timer = setInterval(() => dispatch({ type: "prune", now: Date.now() }), 800);

    return () => clearInterval(timer);
  }, [hasEphemera]);

  const open = useCallback(async (kind: RoomKind) => {
    const payload = await mutateJson<RoomPayload>(
      "/api/screenings",
      jsonMutation("POST", { room: kind }),
    );

    dispatch({ type: "room", room: payload.room });
    setId(payload.room.id);

    return payload.room;
  }, []);

  const join = useCallback(
    async (optionId: string, name = "") => {
      if (!id) {
        return;
      }

      try {
        const payload = await mutateJson<RoomPayload>(
          `/api/screenings/${id}/join`,
          jsonMutation("POST", { optionId, name }),
        );

        dispatch({ type: "room", room: payload.room });
      } catch (error) {
        dispatch({
          type: "error",
          message: error instanceof Error ? error.message : "Could not check you in.",
        });
      }
    },
    [id],
  );

  const setStatus = useCallback(
    async (status: ScreeningStatus) => {
      if (!id) {
        return;
      }

      try {
        const payload = await mutateJson<RoomPayload>(
          `/api/screenings/${id}`,
          jsonMutation("PATCH", { status }),
        );

        dispatch({ type: "room", room: payload.room });
      } catch (error) {
        dispatch({
          type: "error",
          message: error instanceof Error ? error.message : "The doors would not budge.",
        });
      }
    },
    [id],
  );

  const say = useCallback((text: string) => {
    socketRef.current?.send({ type: "say", text });
  }, []);

  const report = useCallback((stage: string, verb: string, detail: string) => {
    socketRef.current?.send({ type: "act", stage, verb, detail });
  }, []);

  const setStage = useCallback((stage: string) => {
    socketRef.current?.send({ type: "stage", stage });
  }, []);

  const moveCursor = useCallback((stage: string, x: number, y: number) => {
    socketRef.current?.send({ type: "cursor", stage, x, y });
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.send({ type: "game", action: "start" });
  }, []);

  const stopGame = useCallback(() => {
    socketRef.current?.send({ type: "game", action: "stop" });
  }, []);

  const answer = useCallback((context: string, optionId: string) => {
    if (socketRef.current?.send({ type: "answer", optionId })) {
      dispatch({ type: "answer", choice: { context, optionId } });
    }
  }, []);

  const startSteer = useCallback(() => {
    socketRef.current?.send({ type: "steer", action: "start" });
  }, []);

  const stopSteer = useCallback(() => {
    socketRef.current?.send({ type: "steer", action: "stop" });
  }, []);

  const pick = useCallback((context: string, optionId: string) => {
    if (socketRef.current?.send({ type: "pick", optionId })) {
      dispatch({ type: "pick", choice: { context, optionId } });
    }
  }, []);

  const react = useCallback((emoji: string) => {
    socketRef.current?.send({ type: "react", emoji });
  }, []);

  const startPoll = useCallback(() => {
    socketRef.current?.send({ type: "poll", action: "start" });
  }, []);

  const closePoll = useCallback(() => {
    socketRef.current?.send({ type: "poll", action: "close" });
  }, []);

  const vote = useCallback((context: string, optionId: string) => {
    if (socketRef.current?.send({ type: "vote", optionId })) {
      dispatch({ type: "vote", choice: { context, optionId } });
    }
  }, []);

  const setLights = useCallback((down: boolean) => {
    socketRef.current?.send({ type: "lights", down });
  }, []);

  const takeTorch = useCallback(async () => {
    if (!id) {
      return;
    }

    try {
      const payload = await mutateJson<RoomPayload>(
        `/api/screenings/${id}/torch`,
        jsonMutation("POST"),
      );

      dispatch({ type: "room", room: payload.room });
    } catch (error) {
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : "The torch stayed where it was.",
      });
    }
  }, [id]);

  const dismissError = useCallback(() => dispatch({ type: "error", message: "" }), []);

  return {
    id,
    room,
    you,
    isMember,
    isHost: you?.role === "host",
    cursors: state.cursors,
    reactions: state.reactions,
    answer: state.answer,
    pick: state.pick,
    vote: state.vote,
    connection: state.connection,
    error: state.error,
    actions: {
      open,
      join,
      setStatus,
      say,
      report,
      setStage,
      moveCursor,
      startGame,
      stopGame,
      answer,
      startSteer,
      stopSteer,
      pick,
      react,
      startPoll,
      closePoll,
      vote,
      takeTorch,
      setLights,
      dismissError,
    },
  };
}

export type ScreeningRoom = ReturnType<typeof useScreening>;
