import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { User } from "../types";
import { MarqueeLogo, TicketIcon } from "./ui";

const NAV: { to: string; label: string; private: boolean; admin?: boolean }[] = [
  { to: "/", label: "Tonight", private: false },
  { to: "/listings", label: "Listings", private: false },
  { to: "/revival", label: "Revival house", private: false },
  { to: "/shelf", label: "My shelf", private: true },
  { to: "/this-week", label: "This week", private: true },
  { to: "/notebook", label: "Notebook", private: true },
  { to: "/admin", label: "Admin", private: true, admin: true },
];

function AccountTools({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <div className="account-tools">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" />
      ) : (
        <span className="avatar-fallback">{user.name.slice(0, 1)}</span>
      )}
      <span className="account-name">{user.name}</span>
      <button type="button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

function SignInLink({ returnTo }: { returnTo: string }) {
  return (
    <Link
      className="sign-in-button"
      to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
      aria-label="Sign in"
    >
      <span className="sign-in-icon">
        <TicketIcon />
      </span>
      <span className="sign-in-copy">
        <strong>Sign in</strong>
        <small>get a ticket</small>
      </span>
    </Link>
  );
}

export function SiteHeader({
  user,
  isSessionLoading,
  currentPath,
  returnTo,
  shelvedCount,
  searchSlot,
  onSignOut,
}: {
  user: User | null;
  isSessionLoading: boolean;
  currentPath: string;
  returnTo: string;
  shelvedCount: number;
  searchSlot: ReactNode;
  onSignOut: () => void;
}) {
  const isSignedIn = Boolean(user);

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <MarqueeLogo />
        <span>Marquee</span>
      </Link>
      <nav aria-label="Primary navigation">
        {NAV.filter(
          (item) => (!item.private || isSignedIn) && (!item.admin || user?.role === "admin"),
        ).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={currentPath === item.to ? "active" : ""}
            aria-current={currentPath === item.to ? "page" : undefined}
          >
            {item.label}
            {item.to === "/shelf" && shelvedCount > 0 && <sup>{shelvedCount}</sup>}
          </Link>
        ))}
      </nav>
      <div className="header-tools">
        {searchSlot}
        {isSessionLoading ? (
          <span className="session-loading">Checking session</span>
        ) : user ? (
          <AccountTools user={user} onSignOut={onSignOut} />
        ) : (
          <SignInLink returnTo={returnTo} />
        )}
      </div>
    </header>
  );
}
