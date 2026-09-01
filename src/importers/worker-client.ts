import type { ImportSource } from "../domain/imports";
import type { ImportFile, ParsedImport } from "./types";
import type { ImportWorkerRequest, ImportWorkerResponse } from "./worker-messages";

function runImportWorker(request: ImportWorkerRequest) {
  return new Promise<ParsedImport>((resolve, reject) => {
    const worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });

    worker.addEventListener("message", (event: MessageEvent<ImportWorkerResponse>) => {
      if (event.data.id !== request.id) {
        return;
      }

      worker.terminate();

      if (event.data.ok) {
        resolve(event.data.parsed);
      } else {
        reject(new Error(event.data.error));
      }
    });
    worker.addEventListener("error", () => {
      worker.terminate();
      reject(new Error("The local import reader stopped unexpectedly."));
    });
    // oxlint-disable-next-line require-post-message-target-origin -- Worker.postMessage has no origin argument
    worker.postMessage(request);
  });
}

export function parseFilesInWorker(source: ImportSource, files: ImportFile[]) {
  return runImportWorker({ id: crypto.randomUUID(), source, files });
}
