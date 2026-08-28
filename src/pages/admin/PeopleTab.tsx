import { useState } from "react";

import { Avatar } from "../../components/Avatar";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminUser } from "../../hooks/useAdmin";
import { classNames } from "../../lib/class-names";
import type { UserRole } from "../../types";
import { Panel, TabPanel } from "../../ui";
import { PEOPLE_SEARCH_FROM } from "./config";

import styles from "./admin.module.css";

export function PeopleTab({
  users,
  onChangeRole,
}: {
  users: AdminUser[];
  onChangeRole: (userId: string, role: UserRole) => void;
}) {
  const [personQuery, setPersonQuery] = useState("");
  const people = users.filter((person) =>
    personQuery
      ? `${person.name} ${person.login}`.toLowerCase().includes(personQuery.trim().toLowerCase())
      : true,
  );

  return (
    <ErrorBoundary label="The staff list">
      <TabPanel id="people" idPrefix="admin">
        <Panel heading="People">
          {users.length >= PEOPLE_SEARCH_FROM && (
            <div className={styles.filters}>
              <input
                className={styles.search}
                value={personQuery}
                onChange={(event) => setPersonQuery(event.target.value)}
                placeholder="Find a name or login"
                aria-label="Filter people"
              />
            </div>
          )}
          <ul className={styles.list}>
            {people.map((person) => (
              <li key={person.id}>
                <Avatar url={person.avatarUrl} name={person.name} size="sm" shape="round" />
                <strong>{person.name}</strong>
                <small>
                  @{person.login} · {person.shelfEntries} saved
                </small>
                <span className={styles.spacer} />
                <span
                  className={classNames(
                    styles.roleBadge,
                    person.role === "admin" && styles.roleBadgeAdmin,
                  )}
                >
                  {person.role}
                </span>
                <button
                  type="button"
                  className={styles.rowAction}
                  onClick={() =>
                    onChangeRole(person.id, person.role === "admin" ? "viewer" : "admin")
                  }
                >
                  {person.role === "admin" ? "Make viewer" : "Make admin"}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </TabPanel>
    </ErrorBoundary>
  );
}
