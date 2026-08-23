import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import type { Guest } from "../domain/notebook";
import type { TonightOrder, UsherMoment, UsherSurface } from "../domain/usher";
import { jsonRequest, requestJson } from "../lib/api";
import { startJourney } from "../lib/journey";

type StateResponse = { status: string; answered: string[]; awayDays?: number };

type MomentResponse = { moment: UsherMoment | null };

type PickResponse = { item: MediaTitle | null; line: string; facts?: string[] };

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

type OrderResponse = { pick: OrderResult | null; backups: OrderResult[]; line: string };

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
const INVITED_SURFACES = new Set<UsherSurface>(["first-run", "search-empty"]);

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
        const response = await requestJson<MomentResponse>(`/api/usher/moment?${parameters}`);

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
      const options = { signal: controller.signal };

      return requestJson<StateResponse>("/api/usher/state", options)
        .catch(() => requestJson<StateResponse>("/api/usher/state", options))
        .catch(() => null);
    }

    async function load() {
      const state = await readState();

      if (!state) {
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

    const response = await requestJson<MomentResponse>("/api/usher/moment?surface=first-run").catch(
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
        const response = await requestJson<{ answer: unknown }>(
          "/api/usher/answer",
          jsonRequest("POST", { questionId, answer: value }),
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
      await requestJson("/api/usher/skip", jsonRequest("POST", { questionId })).catch(
        () => undefined,
      );
      await advance();
    },
    [advance],
  );

  const dismiss = useCallback(
    async (scope: "once" | "kind" | "all" = "once") => {
      const kind = momentRef.current?.kind ?? "";

      setMoment(null);

      if (isOnboarding && scope !== "once") {
        setIsOnboarding(false);
      }

      await requestJson("/api/usher/dismiss", jsonRequest("POST", { kind, scope })).catch(
        () => undefined,
      );
    },
    [isOnboarding],
  );

  const railVerdict = useCallback(async (railId: string, verdict: "good" | "bad") => {
    setMoment(null);
    await requestJson("/api/usher/feedback", jsonRequest("POST", { railId, verdict })).catch(
      () => undefined,
    );
  }, []);

  const askForPick = useCallback(
    async (providerIds: string[]) => {
      if (!isSignedIn) {
        return;
      }

      setPick((current) => ({ ...current, isPicking: true, error: "" }));

      try {
        const response = await requestJson<PickResponse>(
          "/api/usher/pick",
          jsonRequest("POST", {
            providerIds,
            rejected: rejected.current,
            hour: new Date().getHours(),
            isWeekend: [0, 6].includes(new Date().getDay()),
          }),
        );

        if (response.item) {
          startJourney(response.item.id, "usher_pick");
        }

        setPick({
          item: response.item,
          line: response.line,
          facts: response.facts ?? [],
          isPicking: false,
          error: response.item ? "" : response.line,
        });
      } catch (error) {
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
      await requestJson(
        "/api/usher/reject",
        jsonRequest("POST", { titleId, source, ...context }),
      ).catch(() => undefined);
    },
    [],
  );

  const rejectPick = useCallback(
    async (providerIds: string[]) => {
      if (pick.item) {
        rejected.current = [...rejected.current, pick.item.id].slice(-40);
        void remember(pick.item.id, "pick", { providerIds });
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
        const response = await requestJson<OrderResponse>(
          "/api/usher/order",
          jsonRequest("POST", {
            order: brief,
            guestIds,
            providerIds,
            rejected: rejected.current,
            hour: new Date().getHours(),
            isWeekend: [0, 6].includes(new Date().getDay()),
          }),
        );

        if (response.pick) {
          startJourney(response.pick.item.id, "usher_order");
        }

        for (const backup of response.backups ?? []) {
          startJourney(backup.item.id, "usher_order_backup");
        }

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
    setPick(NO_PICK);
    setAside("");
    setOrder({ ...NO_ORDER, isOpen: true });
    void requestJson<{ guests: Guest[] }>("/api/notebook/guests")
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

      rejected.current = [...rejected.current, ...shown.map((entry) => entry.item.id)].slice(-40);

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
    setPick(NO_PICK);
    setAside("");
    setOrder(NO_ORDER);
  }, []);

  const say = useCallback((line: string) => {
    setPick(NO_PICK);
    setAside(line);
  }, []);

  return useMemo(
    () => ({
      moment: isSignedIn ? moment : null,
      isOnboarding: isSignedIn && isOnboarding,
      pick,
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
