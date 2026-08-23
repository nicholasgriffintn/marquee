import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import type { UsherMoment, UsherSurface } from "../domain/usher";
import { jsonRequest, requestJson } from "../lib/api";

type StateResponse = { status: string; answered: string[]; awayDays?: number };

type MomentResponse = { moment: UsherMoment | null };

type PickResponse = { item: MediaTitle | null; line: string };

export type UsherPickState = {
  item: MediaTitle | null;
  line: string;
  isPicking: boolean;
  error: string;
};

const NO_PICK: UsherPickState = { item: null, line: "", isPicking: false, error: "" };

const UNINVITED_PER_SESSION = 1;
const INVITED_SURFACES = new Set<UsherSurface>(["first-run", "search-empty"]);

export function useUsher(isSignedIn: boolean) {
  const [moment, setMoment] = useState<UsherMoment | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [pick, setPick] = useState<UsherPickState>(NO_PICK);
  const [aside, setAside] = useState("");
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

    async function load() {
      try {
        const state = await requestJson<StateResponse>("/api/usher/state", {
          signal: controller.signal,
        });
        const pending = state.status === "new" || state.status === "in-progress";

        awayDays.current = state.awayDays ?? 0;
        setIsOnboarding(pending);

        if (pending) {
          await request("first-run");
        }
      } catch {
        setIsOnboarding(false);
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

        setPick({
          item: response.item,
          line: response.line,
          isPicking: false,
          error: response.item ? "" : response.line,
        });
      } catch (error) {
        setPick({
          item: null,
          line: "",
          isPicking: false,
          error: error instanceof Error ? error.message : "I can't pick just now.",
        });
      }
    },
    [isSignedIn],
  );

  const rejectPick = useCallback(
    async (providerIds: string[]) => {
      if (pick.item) {
        rejected.current = [...rejected.current, pick.item.id].slice(-40);
      }

      await askForPick(providerIds);
    },
    [askForPick, pick.item],
  );

  const clearPick = useCallback(() => {
    setPick(NO_PICK);
    setAside("");
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
    }),
    [
      answer,
      aside,
      askForPick,
      clearPick,
      dismiss,
      isOnboarding,
      isSignedIn,
      moment,
      pick,
      railVerdict,
      rejectPick,
      request,
      say,
      skip,
    ],
  );
}
