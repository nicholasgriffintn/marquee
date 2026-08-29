import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import type { Guest } from "../domain/notebook";
import type { TonightOrder, UsherMoment, UsherSurface } from "../domain/usher";
import { journeyFor, startJourney } from "../lib/journey";
import { jsonMutation, mutateJson, queryJson } from "../lib/query-client";

type StateResponse = { status: string; answered: string[]; awayDays?: number };

type MomentResponse = { moment: UsherMoment | null };

type PickResponse = { item: MediaTitle | null; line: string; facts?: string[]; journey?: string };

export type UsherPickState = {
  item: MediaTitle | null;
  line: string;
  facts: string[];
  isPicking: boolean;
  error: string;
};

export type OrderResult = { item: MediaTitle; line: string; service: string; facts: string[] };

export type UsherOrderState = {
  isOpen: boolean;
  order: TonightOrder | null;
  guestIds: string[];
  pick: OrderResult | null;
  backups: OrderResult[];
  isWorking: boolean;
  error: string;
};

type OrderResponse = {
  pick: OrderResult | null;
  backups: OrderResult[];
  line: string;
  journey?: string;
};

const NO_PICK: UsherPickState = { item: null, line: "", facts: [], isPicking: false, error: "" };

const NO_ORDER: UsherOrderState = {
  isOpen: false,
  order: null,
  guestIds: [],
  pick: null,
  backups: [],
  isWorking: false,
  error: "",
};

const UNINVITED_PER_SESSION = 1;
const REJECTED_MEMORY = 40;
const WEEKEND_DAYS = new Set([0, 6]);
const INVITED_SURFACES = new Set<UsherSurface>(["first-run", "search-empty"]);

function viewingMoment() {
  const now = new Date();

  return { hour: now.getHours(), isWeekend: WEEKEND_DAYS.has(now.getDay()) };
}

export function useUsher(isSignedIn: boolean) {
  const [moment, setMoment] = useState<UsherMoment | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [pick, setPick] = useState<UsherPickState>(NO_PICK);
  const [aside, setAside] = useState("");
  const [order, setOrder] = useState<UsherOrderState>(NO_ORDER);
  const [guests, setGuests] = useState<Guest[]>([]);
  const uninvited = useRef(0);
  const rejected = useRef<string[]>([]);
  const inFlight = useRef(false);
  const pickRun = useRef(0);
  const awayDays = useRef(0);
  const momentRef = useRef<UsherMoment | null>(null);

  useEffect(() => {
    momentRef.current = moment;
  }, [moment]);

  const request = useCallback(
    async (surface: UsherSurface, context: Record<string, string | number | undefined> = {}) => {
      if (!isSignedIn || momentRef.current || inFlight.current) {
        return;
      }

      if (!INVITED_SURFACES.has(surface) && uninvited.current >= UNINVITED_PER_SESSION) {
        return;
      }

      inFlight.current = true;

      const parameters = new URLSearchParams({ surface });

      if (surface === "home" && awayDays.current > 0) {
        parameters.set("awayDays", String(awayDays.current));
      }

      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined && value !== "") {
          parameters.set(key, String(value));
        }
      }

      try {
        const response = await queryJson<MomentResponse>(`/api/usher/moment?${parameters}`);

        if (response.moment) {
          setMoment(response.moment);

          if (!INVITED_SURFACES.has(surface)) {
            uninvited.current += 1;
          }
        }
      } catch {
        setMoment(null);
      } finally {
        inFlight.current = false;
      }
    },
    [isSignedIn],
  );

  useEffect(() => {
    const controller = new AbortController();

    if (!isSignedIn) {
      return () => controller.abort();
    }

    async function readState() {
      try {
        return await queryJson<StateResponse>("/api/usher/state");
      } catch {
        if (controller.signal.aborted) {
          return null;
        }

        return queryJson<StateResponse>("/api/usher/state").catch(() => null);
      }
    }

    async function load() {
      const state = await readState();

      if (!state || controller.signal.aborted) {
        return;
      }

      const pending = state.status === "new" || state.status === "in-progress";

      awayDays.current = state.awayDays ?? 0;
      setIsOnboarding(pending);

      if (pending) {
        await request("first-run");
      }
    }

    void load();

    return () => controller.abort();
  }, [isSignedIn, request]);

  const advance = useCallback(async () => {
    if (!isOnboarding) {
      setMoment(null);

      return;
    }

    const response = await queryJson<MomentResponse>("/api/usher/moment?surface=first-run").catch(
      (): MomentResponse => ({ moment: null }),
    );

    setMoment(response.moment);

    if (!response.moment) {
      setIsOnboarding(false);
    }
  }, [isOnboarding]);

  const answer = useCallback(
    async (questionId: string, value: unknown) => {
      let saved: unknown = null;

      try {
        const response = await mutateJson<{ answer: unknown }>(
          "/api/usher/answer",
          jsonMutation("POST", { questionId, answer: value }),
        );

        saved = response.answer;
      } catch {
        return null;
      }

      await advance();

      return saved;
    },
    [advance],
  );

  const skip = useCallback(
    async (questionId: string) => {
      await mutateJson("/api/usher/skip", jsonMutation("POST", { questionId })).catch(
        () => undefined,
      );
      await advance();
    },
    [advance],
  );

  const dismiss = useCallback(
    async (scope: "once" | "kind" | "all" | "acknowledged" = "once") => {
      const kind = momentRef.current?.kind ?? "";

      setMoment(null);

      if (isOnboarding && scope !== "once") {
        setIsOnboarding(false);
      }

      await mutateJson("/api/usher/dismiss", jsonMutation("POST", { kind, scope })).catch(
        () => undefined,
      );
    },
    [isOnboarding],
  );

  const railVerdict = useCallback(async (railId: string, verdict: "good" | "bad") => {
    setMoment(null);
    await mutateJson("/api/usher/feedback", jsonMutation("POST", { railId, verdict })).catch(
      () => undefined,
    );
  }, []);

  const askForPick = useCallback(
    async (providerIds: string[]) => {
      if (!isSignedIn) {
        return;
      }

      const run = pickRun.current + 1;

      pickRun.current = run;

      setPick((current) => ({ ...current, isPicking: true, error: "" }));

      try {
        const response = await mutateJson<PickResponse>(
          "/api/usher/pick",
          jsonMutation("POST", {
            providerIds,
            rejected: rejected.current,
            ...viewingMoment(),
          }),
        );

        if (run !== pickRun.current) {
          return;
        }

        if (response.item) {
          startJourney(response.item.id, response.journey, 0);
        }

        setPick({
          item: response.item,
          line: response.line,
          facts: response.facts ?? [],
          isPicking: false,
          error: response.item ? "" : response.line,
        });
      } catch (error) {
        if (run !== pickRun.current) {
          return;
        }

        setPick({
          item: null,
          line: "",
          facts: [],
          isPicking: false,
          error: error instanceof Error ? error.message : "I can't pick just now.",
        });
      }
    },
    [isSignedIn],
  );

  const remember = useCallback(
    async (titleId: string, source: string, context: Record<string, unknown>) => {
      const journey = journeyFor(titleId);

      await mutateJson(
        "/api/usher/reject",
        jsonMutation("POST", {
          titleId,
          source,
          ...(journey ? { journey: journey.token, rank: journey.rank } : {}),
          ...context,
        }),
      ).catch(() => undefined);
    },
    [],
  );

  const rejectPick = useCallback(
    async (providerIds: string[], scope?: "never") => {
      if (pick.item) {
        rejected.current = [...rejected.current, pick.item.id].slice(-REJECTED_MEMORY);
        void remember(pick.item.id, "pick", { providerIds, ...(scope ? { scope } : {}) });
      }

      await askForPick(providerIds);
    },
    [askForPick, pick.item, remember],
  );

  const placeOrder = useCallback(
    async (brief: TonightOrder, providerIds: string[], guestIds: string[] = []) => {
      if (!isSignedIn) {
        return;
      }

      setOrder({
        isOpen: true,
        order: brief,
        guestIds,
        pick: null,
        backups: [],
        isWorking: true,
        error: "",
      });

      try {
        const response = await mutateJson<OrderResponse>(
          "/api/usher/order",
          jsonMutation("POST", {
            order: brief,
            guestIds,
            providerIds,
            rejected: rejected.current,
            ...viewingMoment(),
          }),
        );

        if (response.pick) {
          startJourney(response.pick.item.id, response.journey, 0);
        }

        (response.backups ?? []).forEach((backup, index) => {
          startJourney(backup.item.id, response.journey, index + 1);
        });

        setOrder({
          isOpen: true,
          order: brief,
          guestIds,
          pick: response.pick,
          backups: response.backups ?? [],
          isWorking: false,
          error: response.pick ? "" : response.line || "Nothing fits that tonight.",
        });
      } catch (error) {
        setOrder({
          isOpen: true,
          order: brief,
          guestIds,
          pick: null,
          backups: [],
          isWorking: false,
          error: error instanceof Error ? error.message : "I can't take orders just now.",
        });
      }
    },
    [isSignedIn],
  );

  const openOrder = useCallback(() => {
    pickRun.current += 1;
    setPick(NO_PICK);
    setAside("");
    setOrder({ ...NO_ORDER, isOpen: true });
    void queryJson<{ guests: Guest[] }>("/api/notebook/guests")
      .then((response) => setGuests(response.guests))
      .catch(() => undefined);
  }, []);

  const reorder = useCallback(
    async (providerIds: string[]) => {
      const brief = order.order;

      if (!brief) {
        return;
      }

      const shown = [order.pick, ...order.backups].filter(
        (entry): entry is OrderResult => entry !== null,
      );

      rejected.current = [...rejected.current, ...shown.map((entry) => entry.item.id)].slice(
        -REJECTED_MEMORY,
      );

      for (const entry of shown) {
        void remember(entry.item.id, "order", { providerIds, order: brief });
      }

      await placeOrder(brief, providerIds, order.guestIds);
    },
    [order.backups, order.guestIds, order.order, order.pick, placeOrder, remember],
  );

  const editOrder = useCallback(() => {
    setOrder((current) => ({ ...current, pick: null, backups: [], error: "", isWorking: false }));
  }, []);

  const clearPick = useCallback(() => {
    pickRun.current += 1;
    setPick(NO_PICK);
    setAside("");
    setOrder(NO_ORDER);
  }, []);

  const say = useCallback((line: string) => {
    pickRun.current += 1;
    setPick(NO_PICK);
    setAside(line);
  }, []);

  return useMemo(
    () => ({
      moment: isSignedIn ? moment : null,
      isOnboarding: isSignedIn && isOnboarding,
      pick: isSignedIn ? pick : NO_PICK,
      order: isSignedIn ? order : NO_ORDER,
      guests: isSignedIn ? guests : [],
      aside: isSignedIn ? aside : "",
      say,
      request,
      answer,
      skip,
      dismiss,
      railVerdict,
      askForPick,
      rejectPick,
      clearPick,
      openOrder,
      placeOrder,
      reorder,
      editOrder,
    }),
    [
      answer,
      aside,
      askForPick,
      clearPick,
      dismiss,
      editOrder,
      guests,
      isOnboarding,
      isSignedIn,
      moment,
      openOrder,
      order,
      pick,
      placeOrder,
      railVerdict,
      rejectPick,
      reorder,
      request,
      say,
      skip,
    ],
  );
}
