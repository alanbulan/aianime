import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/transport", () => ({ api: { post } }));

import { transcribeLocalSpeech } from "./localSpeechTranscriptionGateway";

describe("local speech transcription gateway", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockReturnValue({
      json: async () => ({ ok: true, data: { text: " 本地转写成功 " } }),
    });
  });

  it("decodes the recording without fetching a CSP-blocked data URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const text = await transcribeLocalSpeech(
      "data:audio/webm;base64,dm9pY2U=",
    );

    expect(text).toBe("本地转写成功");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledOnce();
    const [path, options] = post.mock.calls[0] as [
      string,
      { body: FormData; timeout: number },
    ];
    expect(path).toBe("api/v1/chat/speech/transcribe");
    expect(options.timeout).toBe(120_000);
    const audio = options.body.get("audio") as File;
    expect(audio.name).toBe("recording.webm");
    expect(audio.type).toBe("audio/webm");
    expect(audio.size).toBe(5);
  });
});
