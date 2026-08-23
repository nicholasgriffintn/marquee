export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "UpstreamError";
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
