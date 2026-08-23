import type { Bindings } from "../types.ts";

export function isLocalDev(env: Bindings) {
  return import.meta.env.DEV || env.LOCAL_DEV === "true";
}

export function automatedSyncAllowed(env: Bindings) {
  return !isLocalDev(env) || env.LOCAL_SYNC === "on";
}
