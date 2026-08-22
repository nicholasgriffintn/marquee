type ClientEvent = "rail_impression" | "rail_click";

export function track(name: ClientEvent, detail: string, titleId?: string) {
  void fetch("/api/events", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, detail, titleId }),
  }).catch(() => undefined);
}
