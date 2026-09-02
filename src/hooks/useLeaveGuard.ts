import { useEffect } from "react";

function leavesPage(anchor: HTMLAnchorElement) {
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) {
    return false;
  }

  const target = new URL(anchor.href, window.location.href);

  if (target.origin !== window.location.origin) {
    return true;
  }

  return target.pathname !== window.location.pathname || target.search !== window.location.search;
}

export function useLeaveGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) {
        return;
      }

      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;

      if (!anchor || !leavesPage(anchor) || window.confirm(message)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, message]);
}
