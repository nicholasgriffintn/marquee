import { type ClientMessage, parseServerMessage, type ServerMessage } from "../domain/screening";

const MAX_ATTEMPTS = 8;
const MAX_DELAY_MS = 15_000;

export type SocketHandlers = {
  onMessage: (message: ServerMessage) => void;
  onOpen: () => void;
  onClose: () => void;
};

export function screeningSocketUrl(id: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/api/screenings/${id}/socket`;
}

export class ScreeningSocket {
  private socket: WebSocket | null = null;
  private closed = false;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: SocketHandlers,
  ) {}

  connect() {
    if (this.closed) {
      return;
    }

    const socket = new WebSocket(this.url);

    this.socket = socket;

    socket.addEventListener("open", () => {
      this.attempts = 0;
      this.handlers.onOpen();
    });

    socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);

      if (message) {
        this.handlers.onMessage(message);
      }
    });

    socket.addEventListener("close", () => {
      this.socket = null;
      this.handlers.onClose();
      this.retry();
    });

    socket.addEventListener("error", () => socket.close());
  }

  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));

      return true;
    }

    return false;
  }

  close() {
    this.closed = true;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.socket?.close();
  }

  private retry() {
    if (this.closed || this.attempts >= MAX_ATTEMPTS) {
      return;
    }

    this.attempts += 1;
    this.timer = setTimeout(
      () => this.connect(),
      Math.min(1_000 * 2 ** this.attempts, MAX_DELAY_MS),
    );
  }
}
