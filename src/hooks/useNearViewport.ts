import { useEffect, useState, type RefObject } from "react";

const DEFAULT_MARGIN = "800px 0px";

export function useNearViewport<T extends HTMLElement>(
  ref: RefObject<T | null>,
  rootMargin: string = DEFAULT_MARGIN,
) {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (near || !element) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
        }
      },
      { rootMargin },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [near, ref, rootMargin]);

  return near;
}
