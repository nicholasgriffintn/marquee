import { parseImportFiles } from "./registry";
import type { ImportWorkerRequest, ImportWorkerResponse } from "./worker-messages";

self.addEventListener("message", (event: MessageEvent<ImportWorkerRequest>) => {
  const request = event.data;

  void (async () => {
    try {
      const parsed = await parseImportFiles(request.source, request.files);
      const response: ImportWorkerResponse = { id: request.id, ok: true, parsed };

      // oxlint-disable-next-line require-post-message-target-origin -- worker messages stay in-process
      self.postMessage(response);
    } catch (cause) {
      const response: ImportWorkerResponse = {
        id: request.id,
        ok: false,
        error: cause instanceof Error ? cause.message : "That import could not be read.",
      };

      // oxlint-disable-next-line require-post-message-target-origin -- worker messages stay in-process
      self.postMessage(response);
    }
  })();
});
