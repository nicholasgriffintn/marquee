import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { queryClient } from "./lib/query-client";

// oxlint-disable-next-line import/no-unassigned-import -- Vite loads the global stylesheet for its side effect.
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary variant="page" label="the building">
          <App />
        </ErrorBoundary>
        <ReactQueryDevtools initialIsOpen={false} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
