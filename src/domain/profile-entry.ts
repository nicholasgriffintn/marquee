import type { ViewingEntry } from "../types";

export type ProfileEntryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entry: ViewingEntry | null }
  | { status: "error"; retryable: boolean };

export const initialEntryLoadState: ProfileEntryState = { status: "idle" };

export function entryStateForResolution(
  state: ProfileEntryState,
  isResolvedForCurrentView: boolean,
): ProfileEntryState {
  return isResolvedForCurrentView ? state : initialEntryLoadState;
}

export function beginEntryLoad(): ProfileEntryState {
  return { status: "loading" };
}

export function entryLoadSucceeded(entry: ViewingEntry | null): ProfileEntryState {
  return { status: "loaded", entry };
}

export function entryLoadFailed(retryable: boolean): ProfileEntryState {
  return { status: "error", retryable };
}

export function isRetryableProfileError(status?: number) {
  return (
    status === undefined ||
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

export function createProfileEntryCoordinator() {
  const generations = new Map<string, number>();
  const queues = new Map<string, Promise<void>>();

  return {
    begin(titleId: string) {
      const generation = (generations.get(titleId) ?? 0) + 1;

      generations.set(titleId, generation);

      return generation;
    },
    isCurrent(titleId: string, generation: number) {
      return generations.get(titleId) === generation;
    },
    enqueue<Result>(titleId: string, operation: () => Promise<Result>) {
      const previous = queues.get(titleId) ?? Promise.resolve();
      const result = previous.catch(() => undefined).then(operation);

      queues.set(
        titleId,
        result.then(
          () => undefined,
          () => undefined,
        ),
      );

      return result;
    },
  };
}

export async function resolveEntryView<ViewToken>(
  viewToken: ViewToken,
  load: () => Promise<void>,
  isCurrent: (viewToken: ViewToken) => boolean,
  onResolved: (viewToken: ViewToken) => void,
) {
  await load();

  if (isCurrent(viewToken)) {
    onResolved(viewToken);
  }
}

export function removalDisclosure(isSeries: boolean) {
  return isSeries
    ? "Remove this series from your shelf? This also permanently deletes its episode watch history."
    : "Remove this title from your shelf?";
}

export function runConfirmedRemoval(confirm: () => boolean, remove: () => void) {
  if (!confirm()) {
    return false;
  }

  remove();

  return true;
}

export function profileSaveSettlement(
  outcome: "success" | "failure",
  isCurrent: boolean,
): { message: string; applyServerEntry: boolean; reconcile: boolean } {
  if (outcome === "success") {
    return {
      message: isCurrent
        ? "Shelf saved"
        : "Shelf snapshot saved. Your newer edits are still unsaved.",
      applyServerEntry: isCurrent,
      reconcile: false,
    };
  }

  return {
    message: isCurrent
      ? "Shelf could not be saved. Try again."
      : "Shelf could not be saved. Your newer edits are still here.",
    applyServerEntry: false,
    reconcile: isCurrent,
  };
}

export async function runProfileMutation<Result>(
  write: () => Promise<Result>,
  refresh: () => void,
) {
  const result = await write();

  refresh();

  return result;
}
