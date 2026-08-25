import { useEffect, useLayoutEffect, useRef } from "react";

import type { MediaTitle } from "../domain/catalog";
import type { UsherMoment } from "../domain/usher";
import type { EntryStatus, ViewingEntry } from "../types";
import { DetailPanel } from "./detail/DetailPanel";
import { UsherCard } from "./usher/UsherCard";
import { UsherMark } from "./usher/UsherMark";

function MissingTitle({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    dialogRef.current?.showModal();
    closeRef.current?.focus();
  }, []);

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={onClose}>
      <dialog ref={dialogRef} className="detail-panel detail-panel-missing" aria-modal="true">
        <button
          ref={closeRef}
          type="button"
          className="detail-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
        <div className="detail-copy search-empty lost">
          <UsherMark face="unimpressed" crop="head" />
          <h2>Not in the building.</h2>
          <p>I have no record of that one. It may never have been booked here.</p>
        </div>
      </dialog>
    </div>
  );
}

function LoadingTitle({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    dialogRef.current?.showModal();
    closeRef.current?.focus();
  }, []);

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={onClose}>
      <dialog ref={dialogRef} className="detail-panel detail-panel-missing" aria-modal="true">
        <button
          ref={closeRef}
          type="button"
          className="detail-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
        <div className="detail-copy">
          <span className="visually-hidden">Loading title details…</span>
          <div className="hero-skeleton" aria-hidden="true">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-meta" />
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line short" />
            <span className="skeleton skeleton-button" />
          </div>
        </div>
      </dialog>
    </div>
  );
}

export function TitleOverlay({
  titleId,
  title,
  isMissing,
  isLoading,
  canSave,
  entries,
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
  selectedProviderIds,
}: {
  titleId: string;
  title: MediaTitle | null;
  isMissing: boolean;
  isLoading: boolean;
  canSave: boolean;
  entries: Record<string, ViewingEntry>;
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
  onLoadEntry: (titleId: string) => Promise<void>;
  selectedProviderIds: string[];
}) {
  const isSaved = Boolean(entries[titleId]);

  useEffect(() => {
    void onLoadEntry(titleId);
  }, [onLoadEntry, titleId]);

  useEffect(() => {
    if (isSaved) {
      onUsherRequest(titleId);
    }
  }, [isSaved, onUsherRequest, titleId]);

  if (!title) {
    if (isMissing) {
      return <MissingTitle onClose={onClose} />;
    }

    return isLoading ? <LoadingTitle onClose={onClose} /> : null;
  }

  return (
    <DetailPanel
      item={title}
      canSave={canSave}
      entry={entries[title.id]}
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
      selectedProviderIds={selectedProviderIds}
    />
  );
}
