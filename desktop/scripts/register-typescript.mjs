import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.startsWith("file:") &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      specifier.endsWith(".js")
    ) {
      const sourceUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(sourceUrl))) {
        return { url: sourceUrl.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
