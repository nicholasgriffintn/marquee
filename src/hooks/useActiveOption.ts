import { useEffect, useRef, useState } from "react";

export function useActiveOption(count: number) {
  const [active, setActive] = useState(-1);
  const optionRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function move(direction: "down" | "up") {
    setActive((current) => {
      const next = direction === "down" ? current + 1 : current - 1;

      return next < -1 ? count - 1 : next >= count ? -1 : next;
    });
  }

  function reset() {
    setActive(-1);
  }

  return { active, setActive, move, reset, optionRefs };
}
