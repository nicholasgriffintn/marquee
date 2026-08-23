import { useState } from "react";

import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminUser } from "../../hooks/useAdmin";
import type { UserRole } from "../../types";
import { PEOPLE_SEARCH_FROM } from "./config";

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
      <div role="tabpanel" id="admin-panel-people" aria-labelledby="admin-tab-people">
        <section className="panel-block" aria-labelledby="admin-users-title">
          <h2 id="admin-users-title">People</h2>
          {users.length >= PEOPLE_SEARCH_FROM && (
            <div className="admin-filters">
              <input
                className="admin-search"
                value={personQuery}
                onChange={(event) => setPersonQuery(event.target.value)}
                placeholder="Find a name or login"
                aria-label="Filter people"
              />
            </div>
          )}
          <ul className="admin-list">
            {people.map((person) => (
              <li key={person.id}>
                {person.avatarUrl ? (
                  <img className="admin-avatar" src={person.avatarUrl} alt="" />
                ) : (
                  <span className="avatar-fallback">{person.name.slice(0, 1)}</span>
                )}
                <strong>{person.name}</strong>
                <small>
                  @{person.login} · {person.shelfEntries} saved
                </small>
                <span className="spacer" />
                <span className={`role-badge role-badge-${person.role}`}>{person.role}</span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeRole(person.id, person.role === "admin" ? "viewer" : "admin")
                  }
                >
                  {person.role === "admin" ? "Make viewer" : "Make admin"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ErrorBoundary>
  );
}
