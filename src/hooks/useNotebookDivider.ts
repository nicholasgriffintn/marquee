import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { notebookDividerId } from "../domain/notebook";

const HEADER_CLEARANCE = 96;

export function useNotebookDivider() {
  const location = useLocation();
  const current = notebookDividerId(location.hash);
  const shown = useRef(current);

  useEffect(() => {
    if (shown.current === current) {
      return;
    }

    shown.current = current;

    const section = document.getElementById(current);

    if (section && section.getBoundingClientRect().top < HEADER_CLEARANCE) {
      section.scrollIntoView();
    }
  }, [current]);

  return current;
}
