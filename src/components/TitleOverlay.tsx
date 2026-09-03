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
import { classNames } from "../lib/class-names";
import type { EntryStatus, ViewingEntry } from "../types";
import { Button, ButtonLink, CloseIcon, EmptyState, Skeleton, VisuallyHidden } from "../ui";
import { DetailPanel } from "./detail/DetailPanel";
import { UsherCard } from "./usher/UsherCard";
import { UsherMark } from "./usher/UsherMark";

import styles from "./TitleOverlay.module.css";

function DialogShell({
  panelRef,
  closeRef,
  isMissingShell = false,
  labelledBy,
  onClose,
  children,
}: {
  panelRef: RefObject<HTMLDialogElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  isMissingShell?: boolean;
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
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={panelRef}
        className={classNames(styles.panel, isMissingShell && styles.panelMissing)}
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
          className={styles.close}
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

function PageShell({ children }: { children: ReactNode }) {
  return <article className={styles.page}>{children}</article>;
}

function MissingContent({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      className={styles.missing}
      mark={<UsherMark face="unimpressed" crop="head" className={styles.mark} />}
      heading={onRetry ? "The programme slipped." : "Not in the building."}
      headingId="detail-title"
      size="title"
      surface="paper"
      description={
        onRetry
          ? "I could not check the catalogue just now. Nothing has been marked missing."
          : "I have no record of that one. It may never have been booked here."
      }
      actions={
        onRetry ? (
          <Button
            variant="primary"
            size="lg"
            surface="paper"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

function GatedContent({ isSignedIn }: { isSignedIn: boolean }) {
  const returnTo = encodeURIComponent(window.location.pathname);

  return (
    <EmptyState
      className={styles.missing}
      mark={<UsherMark face="unimpressed" crop="head" className={styles.mark} />}
      heading="Adults only."
      headingId="detail-title"
      size="title"
      surface="paper"
      description={
        isSignedIn
          ? "This one carries an adult certificate. Say in your notebook that you are 18 or over and I will open the card."
          : "This one carries an adult certificate. Sign in, then tell me in your notebook that you are 18 or over."
      }
      actions={
        <ButtonLink
          to={isSignedIn ? "/notebook#preferences" : `/sign-in?returnTo=${returnTo}`}
          variant="primary"
          size="lg"
          surface="paper"
        >
          {isSignedIn ? "Open the notebook" : "Come to the box office"}
        </ButtonLink>
      }
    />
  );
}

function LoadingContent() {
  return (
    <div className={styles.loading}>
      <VisuallyHidden id="detail-title">Loading title details…</VisuallyHidden>
      <Skeleton shape="title" />
      <Skeleton shape="meta" />
      <Skeleton shape="line" />
      <Skeleton shape="line" short />
      <Skeleton shape="button" />
    </div>
  );
}

export function TitleOverlay({
  titleId,
  title,
  isMissing,
  isGated,
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
  layout = "overlay",
}: {
  titleId: string;
  title: MediaTitle | null;
  isMissing: boolean;
  isGated: boolean;
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
  onLoadEntry: (titleId: string, signal?: AbortSignal) => Promise<void>;
  onRetryTitle: () => void;
  selectedProviderIds: string[];
  layout?: "overlay" | "page";
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

  const isPage = layout === "page";

  if (!title) {
    if (!titleError && !isMissing && !isGated && !isLoading) {
      return null;
    }

    const fallback = titleError ? (
      <MissingContent onRetry={onRetryTitle} />
    ) : isGated ? (
      <GatedContent isSignedIn={canSave} />
    ) : isMissing ? (
      <MissingContent />
    ) : (
      <LoadingContent />
    );

    return isPage ? (
      <PageShell>{fallback}</PageShell>
    ) : (
      <DialogShell
        panelRef={panelRef}
        closeRef={closeRef}
        isMissingShell
        labelledBy="detail-title"
        onClose={onClose}
      >
        {fallback}
      </DialogShell>
    );
  }

  const detail = (
    <DetailPanel
      item={title}
      layout={layout}
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
      onTracked={() => {
        onTracked();
        void onLoadEntry(titleId);
      }}
      onRetryEntry={() => void retryEntry()}
      selectedProviderIds={selectedProviderIds}
    />
  );

  return isPage ? (
    <PageShell>{detail}</PageShell>
  ) : (
    <DialogShell
      panelRef={panelRef}
      closeRef={closeRef}
      labelledBy="detail-title"
      onClose={onClose}
    >
      {detail}
    </DialogShell>
  );
}
