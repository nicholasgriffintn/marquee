const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

export function mountBeacon(token: string | undefined) {
  if (!token) {
    return;
  }

  const script = document.createElement("script");

  script.defer = true;
  script.src = BEACON_SRC;
  script.dataset.cfBeacon = JSON.stringify({ token });
  document.head.append(script);
}
