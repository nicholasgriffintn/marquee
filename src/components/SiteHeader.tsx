import { type ReactNode, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { classNames } from "../lib/class-names";
import type { User } from "../types";
import { Eyebrow, TicketIcon } from "../ui";
import { Avatar } from "./Avatar";
import { Brand } from "./Brand";

import styles from "./SiteHeader.module.css";

const NAV: { to: string; label: string; private: boolean; admin?: boolean }[] = [
  { to: "/", label: "Tonight", private: false },
  { to: "/listings", label: "Listings", private: false },
  { to: "/trailers", label: "Trailers", private: false },
  { to: "/revival", label: "Revival house", private: false },
  { to: "/shelf", label: "My shelf", private: true },
  { to: "/this-week", label: "This week", private: true },
  { to: "/notebook", label: "Notebook", private: true },
  { to: "/admin", label: "Admin", private: true, admin: true },
];

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
    <div className={styles.account}>
      <Avatar url={user.avatarUrl} name={user.name} className={styles.accountAvatar} />
      <span className={styles.accountName}>{user.name}</span>
      <button className={styles.accountSignOut} type="button" onClick={onSignOut}>
        Sign out
      </button>
      <details className={styles.accountMenu} ref={menuRef}>
        <summary ref={summaryRef} aria-label={`Open account menu for ${user.name}`}>
          <Avatar url={user.avatarUrl} name={user.name} />
        </summary>
        <div className={styles.accountPopover}>
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
      className={styles.signIn}
      to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
      aria-label="Sign in"
    >
      <span className={styles.signInIcon}>
        <TicketIcon className={styles.ticket} />
      </span>
      <span className={styles.signInCopy}>
        <strong>Sign in</strong>
        <small>get a ticket</small>
      </span>
      <span className={styles.signInCompact}>Get a ticket</span>
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
    <header className={styles.header}>
      <Brand to="/" hideLabelOnMobile className={styles.brand} />
      <nav aria-label="Primary navigation" className={styles.nav}>
        {NAV.filter(
          (item) => (!item.private || isSignedIn) && (!item.admin || user?.role === "admin"),
        ).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={classNames(styles.navLink, currentPath === item.to && styles.navLinkActive)}
            aria-current={currentPath === item.to ? "page" : undefined}
          >
            {item.label}
            {item.to === "/shelf" && shelvedCount > 0 && (
              <sup className={styles.navCount}>{shelvedCount}</sup>
            )}
          </Link>
        ))}
      </nav>
      <div className={styles.tools}>
        <div className={styles.search}>{searchSlot}</div>
        {isSessionLoading ? (
          <Eyebrow size="sm" weight="regular" className={styles.sessionLoading}>
            Checking session
          </Eyebrow>
        ) : user ? (
          <AccountTools user={user} onSignOut={onSignOut} />
        ) : (
          <SignInLink returnTo={returnTo} />
        )}
      </div>
    </header>
  );
}
