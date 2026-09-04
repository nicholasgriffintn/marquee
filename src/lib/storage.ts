export function readStoredFlag(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeStoredFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    return;
  }
}
