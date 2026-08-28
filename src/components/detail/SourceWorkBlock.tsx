import type { MediaTitle, SourceWork } from "../../domain/catalog";
import { sourceWorkMeta } from "../../lib/media";
import { Text } from "../../ui";
import { collectionCaption, TitleTrack } from "./TitleTrack";

export function SourceWorkLine({ source }: { source: SourceWork | null }) {
  if (!source) {
    return null;
  }

  return (
    <Text size="sm" tone="inkMuted">
      {sourceWorkMeta(source)}
    </Text>
  );
}

export function SourceWorkTrack({
  source,
  items,
  currentId,
  onOpen,
}: {
  source: SourceWork | null;
  items: MediaTitle[];
  currentId: string;
  onOpen: (item: MediaTitle) => void;
}) {
  if (!source || items.length < 2) {
    return null;
  }

  return (
    <TitleTrack
      label={`Every version of ${source.label}`}
      items={items}
      currentId={currentId}
      caption={collectionCaption}
      onOpen={onOpen}
    />
  );
}
