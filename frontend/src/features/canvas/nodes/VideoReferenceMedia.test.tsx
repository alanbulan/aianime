// Copyright (c) 2026 AI anime
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReferenceMediaRow,
  type ReferenceMediaCapEntry,
} from "./VideoReferenceMedia";

const resolveUrl = (url: string) => url;

class AudioMock {
  static instances: AudioMock[] = [];

  src = "";
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor() {
    AudioMock.instances.push(this);
  }

  addEventListener = vi.fn((type: string, listener: EventListener) => {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  });

  removeEventListener = vi.fn((type: string, listener: EventListener) => {
    this.listeners.get(type)?.delete(listener);
  });

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }
}

describe("VideoReferenceMedia", () => {
  beforeEach(() => {
    AudioMock.instances = [];
    vi.stubGlobal("Audio", AudioMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reorders references by the visible mixed-media order", () => {
    const onReorder = vi.fn();
    const items: ReferenceMediaCapEntry[] = [
      {
        item: {
          kind: "image",
          nodeId: "image-1",
          imageUrl: "image-1.png",
          displayName: "图一",
        },
        typeIndex: 1,
        withinCap: true,
      },
      {
        item: {
          kind: "video",
          nodeId: "video-1",
          videoUrl: "video-1.mp4",
          displayName: "视频一",
        },
        typeIndex: 1,
        withinCap: true,
      },
      {
        item: {
          kind: "image",
          nodeId: "image-2",
          imageUrl: "image-2.png",
          displayName: "图二",
        },
        typeIndex: 2,
        withinCap: true,
      },
    ];
    render(
      <ReferenceMediaRow
        items={items}
        caps={null}
        showFrameSlotLabels={false}
        resolveUrl={resolveUrl}
        onFocus={vi.fn()}
        onDetach={vi.fn()}
        onReorder={onReorder}
      />,
    );
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
    };

    fireEvent.dragStart(screen.getByTitle("图二").parentElement!, {
      dataTransfer,
    });
    fireEvent.dragOver(screen.getByTitle("视频一").parentElement!, {
      dataTransfer,
    });
    fireEvent.drop(screen.getByTitle("视频一").parentElement!, {
      dataTransfer,
    });

    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "image-2");
    expect(onReorder).toHaveBeenCalledWith([
      "image-1",
      "image-2",
      "video-1",
    ]);
  });

  it("shows frame slots and caps while routing preview, focus and detach", () => {
    const onFocus = vi.fn();
    const onDetach = vi.fn();
    const items: ReferenceMediaCapEntry[] = [
      {
        item: {
          kind: "image",
          nodeId: "image-1",
          imageUrl: "image-1.png",
          displayName: "首图",
        },
        typeIndex: 1,
        withinCap: true,
      },
      {
        item: {
          kind: "image",
          nodeId: "image-2",
          imageUrl: "image-2.png",
          displayName: "尾图",
        },
        typeIndex: 2,
        withinCap: true,
      },
      {
        item: {
          kind: "image",
          nodeId: "image-3",
          imageUrl: "image-3.png",
          displayName: "第三图",
        },
        typeIndex: 3,
        withinCap: false,
      },
    ];
    render(
      <ReferenceMediaRow
        items={items}
        caps={{ image: 2, video: 0, audio: 0 }}
        showFrameSlotLabels
        resolveUrl={resolveUrl}
        onFocus={onFocus}
        onDetach={onDetach}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText("首帧")).toBeInTheDocument();
    expect(screen.getByText("尾帧")).toBeInTheDocument();
    expect(
      screen.getByTitle(
        "图片引用超出首尾帧上限（2张），本次生成不会使用该素材",
      ),
    ).toHaveTextContent("!");

    const firstImage = screen.getByTitle("首图");
    fireEvent.mouseEnter(firstImage);
    expect(screen.getAllByAltText("首图")).toHaveLength(2);
    fireEvent.mouseLeave(firstImage);
    expect(screen.getAllByAltText("首图")).toHaveLength(1);

    fireEvent.click(firstImage);
    expect(onFocus).toHaveBeenCalledWith("image-1");
    fireEvent.click(
      within(screen.getByTitle("第三图")).getByTitle("取消引用此素材"),
    );
    expect(onDetach).toHaveBeenCalledWith("image-3");
  });

  it("allows only one audio reference to play at a time", () => {
    const onFocus = vi.fn();
    const items: ReferenceMediaCapEntry[] = [
      {
        item: {
          kind: "audio",
          nodeId: "audio-1",
          audioUrl: "audio-1.mp3",
          displayName: "音轨一",
        },
        typeIndex: 1,
        withinCap: true,
      },
      {
        item: {
          kind: "audio",
          nodeId: "audio-2",
          audioUrl: "audio-2.mp3",
          displayName: "音轨二",
        },
        typeIndex: 2,
        withinCap: true,
      },
    ];
    render(
      <ReferenceMediaRow
        items={items}
        caps={null}
        showFrameSlotLabels={false}
        resolveUrl={resolveUrl}
        onFocus={onFocus}
        onDetach={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const [firstAudio, secondAudio] = AudioMock.instances;
    firstAudio.pause.mockClear();
    secondAudio.pause.mockClear();

    fireEvent.click(screen.getByTitle("音轨一"));
    expect(firstAudio.play).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTitle("音轨二"));
    expect(firstAudio.pause).toHaveBeenCalled();
    expect(secondAudio.play).toHaveBeenCalledOnce();
    expect(onFocus.mock.calls.map(([nodeId]) => nodeId)).toEqual([
      "audio-1",
      "audio-2",
    ]);

    secondAudio.pause.mockClear();
    act(() => secondAudio.emit("ended"));
    expect(secondAudio.pause).toHaveBeenCalled();
  });
});
