import type { WorkerBindings } from "../types.ts";

export function isLocalDev(env: WorkerBindings) {
  return import.meta.env.DEV || env.LOCAL_DEV === "true";
}

export function automatedSyncAllowed(env: WorkerBindings) {
  return !isLocalDev(env) || env.LOCAL_SYNC === "on";
}
