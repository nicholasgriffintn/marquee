import type { MouseEvent } from "react";

export const APP_INSTANCE = Math.random().toString(36).slice(2);

export function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
