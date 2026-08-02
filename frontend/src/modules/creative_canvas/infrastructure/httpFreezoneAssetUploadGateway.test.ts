// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => {
  const json = vi.fn();
  return {
    apiRequest: vi.fn(() => ({ json })),
    json,
  };
});

vi.mock("@/shared/api/client", () => ({ apiRequest: client.apiRequest }));

import {
  uploadFreezoneAsset,
  type FreezoneAssetUploadGateway,
} from "../application/assetUpload";
import { httpFreezoneAssetUploadGateway } from "./httpFreezoneAssetUploadGateway";

afterEach(() => {
  client.apiRequest.mockClear();
  client.json.mockReset();
});

describe("Freezone asset upload application", () => {
  it("delegates the complete upload command to the injected gateway", async () => {
    const result = {
      url: "/static/upload.png",
      filename: "upload.png",
      size: 4,
    };
    const upload = vi.fn().mockResolvedValue(result);
    const gateway: FreezoneAssetUploadGateway = { upload };
    const params = {
      projectId: "demo",
      file: new Blob(["data"]),
      filename: "upload.png",
      options: { disableTimeout: true },
    };

    await expect(uploadFreezoneAsset(params, gateway)).resolves.toBe(result);
    expect(upload).toHaveBeenCalledWith(params);
  });
});

describe("HTTP Freezone asset upload gateway", () => {
  it("maps multipart data and timeout control to the upload endpoint", async () => {
    const result = {
      url: "/static/upload.png",
      filename: "upload.png",
      size: 4,
    };
    const file = new Blob(["data"], { type: "image/png" });
    client.json.mockResolvedValue({ ok: true, data: result });

    await expect(
      httpFreezoneAssetUploadGateway.upload({
        projectId: "demo project",
        file,
        filename: "../upload.png",
        options: { disableTimeout: true },
      }),
    ).resolves.toEqual(result);
    expect(client.apiRequest).toHaveBeenCalledWith(
      "projects/demo%20project/freezone/upload",
      {
        method: "POST",
        body: expect.any(FormData),
        timeout: false,
      },
    );
  });

  it("preserves the backend upload error", async () => {
    client.json.mockResolvedValue({ ok: false, error: "upload denied" });

    await expect(
      httpFreezoneAssetUploadGateway.upload({
        projectId: "demo",
        file: new Blob(["data"]),
        filename: "upload.png",
      }),
    ).rejects.toThrow("upload denied");
  });
});
