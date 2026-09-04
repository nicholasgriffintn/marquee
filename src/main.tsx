import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { mountBeacon } from "./lib/beacon";
import { queryClient } from "./lib/query-client";

// oxlint-disable-next-line import/no-unassigned-import -- Vite loads the global stylesheet for its side effect.
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

mountBeacon(import.meta.env.VITE_CF_BEACON_TOKEN);

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <>
        <ErrorBoundary variant="page" label="the building">
          <App />
        </ErrorBoundary>
        <ReactQueryDevtools initialIsOpen={false} />
      </>
    ),
  },
]);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
