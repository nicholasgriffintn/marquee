import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ErrorBoundary } from "../../components/ErrorBoundary";
import {
  type RoomKind,
  type RoomSnapshot,
  SCREENING_PARAM,
  type ScreeningStatus,
} from "../../domain/screening";
import { useResource } from "../../hooks/useResource";
import { formatDate } from "../../lib/dates";
import { jsonMutation, mutateJson } from "../../lib/query-client";
import { Button, Panel, TabPanel } from "../../ui";

import styles from "./admin.module.css";

type RoomRow = {
  id: string;
  kind: RoomKind;
  title: string;
  path: string;
  hostId: string;
  createdAt: string;
  status: ScreeningStatus;
  members: number;
  online: number;
};

const KINDS: { kind: RoomKind; label: string }[] = [
  { kind: "tour", label: "Open a tour room" },
  { kind: "pick", label: "Open a pick room" },
];

export function RoomsTab() {
  const navigate = useNavigate();
  const [pending, setPending] = useState("");
  const [issue, setIssue] = useState("");
  const rooms = useResource<{ rooms: RoomRow[] }>("/api/screenings", {
    errorMessage: "Could not list the rooms.",
  });

  async function open(kind: RoomKind) {
    setPending(kind);
    setIssue("");

    try {
      const { room } = await mutateJson<{ room: RoomSnapshot }>(
        "/api/screenings",
        jsonMutation("POST", { room: kind }),
      );

      void navigate(
        `${room.definition.path}?${SCREENING_PARAM}=${room.id}${room.definition.hash ? `#${room.definition.hash}` : ""}`,
      );
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "The room did not open.");
    } finally {
      setPending("");
    }
  }

  async function setStatus(room: RoomRow, status: ScreeningStatus) {
    setPending(room.id);
    setIssue("");

    try {
      await mutateJson(`/api/screenings/${room.id}`, jsonMutation("PATCH", { status }));
      rooms.reload();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "The doors would not budge.");
    } finally {
      setPending("");
    }
  }

  return (
    <ErrorBoundary label="The rooms">
      <TabPanel id="rooms" idPrefix="admin">
        <Panel heading="Screenings" rule="none">
          <p className={styles.note}>
            Every room opened from this account, newest first. Shutting the doors stops new tickets
            and messages; the room and its feed stay for a week.
          </p>
          <div className={styles.actions}>
            {KINDS.map((entry) => (
              <Button
                key={entry.kind}
                variant="primary"
                size="md"
                disabled={Boolean(pending)}
                onClick={() => void open(entry.kind)}
              >
                {pending === entry.kind ? "Opening…" : entry.label}
              </Button>
            ))}
            <Button size="md" onClick={rooms.reload} disabled={rooms.isLoading}>
              Refresh
            </Button>
          </div>
          {(issue || rooms.error) && <p className={styles.failed}>{issue || rooms.error}</p>}
          {rooms.data && rooms.data.rooms.length === 0 && (
            <p className={styles.empty}>No rooms yet. Open one and share the link.</p>
          )}
          <ul className={styles.list}>
            {(rooms.data?.rooms ?? []).map((room) => (
              <li key={room.id}>
                <strong>{room.title}</strong>
                <span>{room.kind}</span>
                <span>{room.status === "open" ? "doors open" : "doors shut"}</span>
                <span>
                  {room.members} tickets, {room.online} in
                </span>
                <span>{formatDate(room.createdAt, {})}</span>
                <span className={styles.spacer} />
                <Button
                  size="sm"
                  onClick={() =>
                    void navigate(
                      `${room.path}?${SCREENING_PARAM}=${room.id}${room.kind === "tour" ? "#step" : ""}`,
                    )
                  }
                >
                  Go in
                </Button>
                <Button
                  size="sm"
                  variant={room.status === "open" ? "danger" : "secondary"}
                  disabled={pending === room.id}
                  onClick={() => void setStatus(room, room.status === "open" ? "closed" : "open")}
                >
                  {room.status === "open" ? "Shut the doors" : "Reopen"}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      </TabPanel>
    </ErrorBoundary>
  );
}
