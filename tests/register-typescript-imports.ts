import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "ERR_UNSUPPORTED_DIR_IMPORT") &&
        specifier.startsWith(".")
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }

      throw error;
    }
  },
});
