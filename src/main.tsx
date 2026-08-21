import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

// oxlint-disable-next-line import/no-unassigned-import -- Vite loads the global stylesheet for its side effect.
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
