import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import type { MediaTitle } from "../domain/catalog";
import {
  entryStateForResolution,
  initialEntryLoadState,
  resolveEntryView,
  type ProfileEntryState,
} from "../domain/profile-entry";
import type { UsherMoment } from "../domain/usher";
import type { EntryStatus, ViewingEntry } from "../types";
import { DetailPanel } from "./detail/DetailPanel";
import { CloseIcon } from "./ui";
import { UsherCard } from "./usher/UsherCard";
import { UsherMark } from "./usher/UsherMark";

function DialogShell({
  panelRef,
  closeRef,
  panelClassName,
  labelledBy,
  onClose,
  children,
}: {
  panelRef: RefObject<HTMLDialogElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  panelClassName: string;
  labelledBy?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    panelRef.current?.showModal();
    closeRef.current?.focus();
  }, [panelRef, closeRef]);

  return (
    <div
      className="detail-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={panelRef}
        className={panelClassName}
        aria-modal="true"
        aria-labelledby={labelledBy}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      >
        <button
          ref={closeRef}
          type="button"
          className="detail-close"
          onClick={onClose}
          aria-label="Close details"
        >
          <CloseIcon />
        </button>
        {children}
      </dialog>
    </div>
  );
}

function MissingContent({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="detail-copy search-empty lost">
      <UsherMark face="unimpressed" crop="head" />
      <h2 id="detail-title">{onRetry ? "The programme slipped." : "Not in the building."}</h2>
      <p>
        {onRetry
          ? "I could not check the catalogue just now. Nothing has been marked missing."
          : "I have no record of that one. It may never have been booked here."}
      </p>
      {onRetry ? (
        <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

function LoadingContent() {
  return (
    <div className="detail-copy">
      <span className="visually-hidden" id="detail-title">
        Loading title details…
      </span>
      <div className="hero-skeleton" aria-hidden="true">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-meta" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line short" />
        <span className="skeleton skeleton-button" />
      </div>
    </div>
  );
}

export function TitleOverlay({
  titleId,
  title,
  isMissing,
  isLoading,
  titleError,
  canSave,
  entryState,
  usherMoment,
  onUsherRequest,
  onUsherAction,
  onUsherDismiss,
  availabilityEnabled,
  onClose,
  onOpen,
  onSave,
  onSaveEntry,
  onRemove,
  onStatus,
  onUpdateDraft,
  onTracked,
  onLoadEntry,
  onRetryTitle,
  selectedProviderIds,
}: {
  titleId: string;
  title: MediaTitle | null;
  isMissing: boolean;
  isLoading: boolean;
  titleError: string;
  canSave: boolean;
  entryState?: ProfileEntryState;
  usherMoment: UsherMoment | null;
  onUsherRequest: (titleId: string) => void;
  onUsherAction: (moment: UsherMoment, actionId: string) => void;
  onUsherDismiss: (scope: "once" | "kind") => void;
  availabilityEnabled: boolean;
  onClose: () => void;
  onOpen: (item: MediaTitle) => void;
  onSave: (item: MediaTitle) => void;
  onSaveEntry: (entry: ViewingEntry) => void;
  onRemove: (titleId: string) => void;
  onStatus: (titleId: string, status: EntryStatus) => void;
  onUpdateDraft: (titleId: string, patch: Partial<ViewingEntry>) => void;
  onTracked: () => void;
  onLoadEntry: (titleId: string, signal: AbortSignal) => Promise<void>;
  onRetryTitle: () => void;
  selectedProviderIds: string[];
}) {
  const viewToken = useMemo(() => Symbol(titleId), [titleId]);
  const [resolvedViewToken, setResolvedViewToken] = useState<symbol | null>(null);
  const currentViewToken = useRef(viewToken);
  const retryController = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const resolvedEntryState = entryStateForResolution(
    entryState ?? initialEntryLoadState,
    resolvedViewToken === viewToken,
  );
  const isSaved = resolvedEntryState.status === "loaded" && Boolean(resolvedEntryState.entry);

  useLayoutEffect(() => {
    currentViewToken.current = viewToken;
  }, [viewToken]);

  useEffect(() => {
    const controller = new AbortController();

    retryController.current?.abort();
    void resolveEntryView(
      viewToken,
      () => onLoadEntry(titleId, controller.signal),
      (token) => currentViewToken.current === token && !controller.signal.aborted,
      setResolvedViewToken,
    );

    return () => controller.abort();
  }, [onLoadEntry, titleId, viewToken]);

  const retryEntry = async () => {
    const controller = new AbortController();
    const token = viewToken;

    retryController.current?.abort();
    retryController.current = controller;
    setResolvedViewToken(null);
    await resolveEntryView(
      token,
      () => onLoadEntry(titleId, controller.signal),
      (candidate) => currentViewToken.current === candidate && !controller.signal.aborted,
      setResolvedViewToken,
    );
  };

  useEffect(
    () => () => {
      retryController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (isSaved) {
      onUsherRequest(titleId);
    }
  }, [isSaved, onUsherRequest, titleId]);

  if (!title) {
    if (!titleError && !isMissing && !isLoading) {
      return null;
    }

    return (
      <DialogShell
        panelRef={panelRef}
        closeRef={closeRef}
        panelClassName="detail-panel detail-panel-missing"
        labelledBy="detail-title"
        onClose={onClose}
      >
        {titleError ? (
          <MissingContent onRetry={onRetryTitle} />
        ) : isMissing ? (
          <MissingContent />
        ) : (
          <LoadingContent />
        )}
      </DialogShell>
    );
  }

  return (
    <DialogShell
      panelRef={panelRef}
      closeRef={closeRef}
      panelClassName="detail-panel"
      labelledBy="detail-title"
      onClose={onClose}
    >
      <DetailPanel
        item={title}
        panelRef={panelRef}
        canSave={canSave}
        entryState={resolvedEntryState}
        usherSlot={
          usherMoment ? (
            <UsherCard moment={usherMoment} onAction={onUsherAction} onDismiss={onUsherDismiss} />
          ) : undefined
        }
        availabilityEnabled={availabilityEnabled}
        onClose={onClose}
        onOpen={onOpen}
        onSave={onSave}
        onSaveEntry={onSaveEntry}
        onRemove={onRemove}
        onStatus={onStatus}
        onUpdateDraft={onUpdateDraft}
        onTracked={onTracked}
        onRetryEntry={() => void retryEntry()}
        selectedProviderIds={selectedProviderIds}
      />
    </DialogShell>
  );
}
