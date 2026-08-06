// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("ImageGenNode error notification contract", () => {
  it("stores the raw error separately from the displayed provider message", () => {
    const source = read(
      "src/modules/creative_canvas/presentation/useImageGenNodeController.ts",
    );

    expect(source).toContain("generationError: displayErrorMessage");
    expect(source).toContain("generationErrorDetails: rawErrorMessage");
    expect(source).toContain("generationErrorRequestId: extractRequestId(rawErrorMessage)");
  });

  it("projects the preserved raw ImageGen error for the node toolbar", () => {
    const modelSource = read(
      "src/modules/creative_canvas/application/nodeActionToolbarModel.ts",
    );
    const controllerSource = read(
      "src/modules/creative_canvas/presentation/useNodeOutputToolbarController.ts",
    );

    expect(modelSource).toContain(
      'node.type === "exportImageNode" || node.type === "imageGenNode"',
    );
    expect(modelSource).toContain(
      "report: generationErrorDetails || generationError",
    );
    expect(controllerSource).toContain("projectNodeActionGenerationError(");
  });

  it("copies the complete error from the request-id row instead of only the id", () => {
    const source = read(
      "src/modules/creative_canvas/presentation/useImageGenNodeController.ts",
    );

    expect(source).toContain(
      "const copyText = generationErrorDetails || generationError || generationErrorRequestId",
    );
    expect(source).toContain("navigator.clipboard.writeText(copyText)");
    expect(source).not.toContain("navigator.clipboard.writeText(generationErrorRequestId)");
  });
});
