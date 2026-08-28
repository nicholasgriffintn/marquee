import { type ReactNode, useEffect, useRef } from "react";
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

function AccountAvatar({ user }: { user: User }) {
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" />
  ) : (
    <span className="avatar-fallback">{user.name.slice(0, 1)}</span>
  );
}

function AccountTools({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      const menu = menuRef.current;

      if (menu?.open && !menu.contains(event.target as Node)) {
        menu.open = false;
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      const menu = menuRef.current;

      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        summaryRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="account-tools">
      <AccountAvatar user={user} />
      <span className="account-name">{user.name}</span>
      <button className="account-sign-out" type="button" onClick={onSignOut}>
        Sign out
      </button>
      <details className="account-menu" ref={menuRef}>
        <summary ref={summaryRef} aria-label={`Open account menu for ${user.name}`}>
          <AccountAvatar user={user} />
        </summary>
        <div className="account-menu-popover">
          <strong>{user.name}</strong>
          <button type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </details>
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
      <span className="sign-in-mobile-copy">Get a ticket</span>
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
