export class UpstreamError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

export function upstreamError(name: string) {
  return class extends UpstreamError {
    constructor(message: string, status = 502) {
      super(message, status);
      this.name = name;
    }
  };
}
