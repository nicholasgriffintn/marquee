import { useEffect, useRef } from "react";
import { NavigationType, useNavigationType } from "react-router-dom";

export function useScrollToTop(key: string) {
  const navigationType = useNavigationType();
  const settled = useRef(key);

  useEffect(() => {
    if (settled.current === key) {
      return;
    }

    settled.current = key;

    // Filter chips rewrite the query string in place, so only a pushed or popped
    // navigation counts as arriving somewhere new.
    if (navigationType !== NavigationType.Replace) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [key, navigationType]);
}
