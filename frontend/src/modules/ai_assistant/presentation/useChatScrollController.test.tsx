// Copyright (c) 2026 AI anime
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatScrollController } from "@/modules/ai_assistant/public";

type ScrollOptions = Parameters<typeof useChatScrollController>[0];
type ScrollController = ReturnType<typeof useChatScrollController>;

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  observe = vi.fn();
  disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  notify(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const defaultOptions: ScrollOptions = {
  activeMessageCount: 0,
  busy: false,
  historyReady: false,
  lastActiveMessageId: null,
  messages: [],
  project: "project-a",
  showWaitingIndicator: false,
  streamText: "",
};

let latestController: ScrollController | null = null;

function currentController(): ScrollController {
  if (!latestController) throw new Error("scroll controller is unavailable");
  return latestController;
}

function latestResizeObserver(): ResizeObserverMock | undefined {
  return ResizeObserverMock.instances[ResizeObserverMock.instances.length - 1];
}

function ScrollHarness({ options }: { options: ScrollOptions }) {
  const controller = useChatScrollController(options);
  latestController = controller;
  return (
    <div data-testid="scroll-container" ref={controller.scrollRef}>
      <div data-testid="message-list" ref={controller.messageListRef} />
    </div>
  );
}

function configureScrollContainer(element: HTMLDivElement) {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: 1_000 },
    clientHeight: { configurable: true, value: 200 },
  });
  element.scrollTop = 0;
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    element.scrollTop = Number(options.top ?? element.scrollTop);
  });
  Object.defineProperty(element, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  return scrollTo;
}

describe("SuperChat scroll controller", () => {
  beforeEach(() => {
    latestController = null;
    ResizeObserverMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    let frameId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      frameId += 1;
      return frameId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("tracks scroll distance and exposes an explicit scroll-to-bottom command", () => {
    render(<ScrollHarness options={defaultOptions} />);
    const container = screen.getByTestId("scroll-container") as HTMLDivElement;
    const scrollTo = configureScrollContainer(container);

    fireEvent.scroll(container);
    expect(currentController().showScrollToBottom).toBe(true);

    act(() => currentController().scrollToChatBottom("smooth"));

    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
    expect(currentController().showScrollToBottom).toBe(false);
  });

  it("respects manual scroll position until busy content or a resize requires sticking", () => {
    const { rerender, unmount } = render(
      <ScrollHarness options={defaultOptions} />,
    );
    const container = screen.getByTestId("scroll-container") as HTMLDivElement;
    const scrollTo = configureScrollContainer(container);
    fireEvent.scroll(container);
    scrollTo.mockClear();

    rerender(
      <ScrollHarness
        options={{ ...defaultOptions, messages: [{
          id: "message-1",
          role: "assistant",
          text: "更新",
          timestamp: 1,
        }] }}
      />,
    );
    expect(scrollTo).not.toHaveBeenCalled();

    act(() => latestResizeObserver()?.notify());
    expect(scrollTo).not.toHaveBeenCalled();

    rerender(
      <ScrollHarness options={{ ...defaultOptions, busy: true }} />,
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
    scrollTo.mockClear();

    const activeObserver = latestResizeObserver();
    act(() => activeObserver?.notify());
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });

    unmount();
    expect(activeObserver?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("restores history once per project and message boundary and clears scheduled work", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { rerender, unmount } = render(
      <ScrollHarness options={defaultOptions} />,
    );
    const container = screen.getByTestId("scroll-container") as HTMLDivElement;
    configureScrollContainer(container);

    rerender(
      <ScrollHarness
        options={{
          ...defaultOptions,
          activeMessageCount: 2,
          historyReady: true,
          lastActiveMessageId: "message-1",
        }}
      />,
    );
    const historyDelays = () => setTimeoutSpy.mock.calls
      .map(([, delay]) => delay)
      .filter((delay) => delay === 120 || delay === 360 || delay === 800);
    expect(historyDelays()).toEqual([120, 360, 800]);

    rerender(
      <ScrollHarness
        options={{
          ...defaultOptions,
          activeMessageCount: 2,
          historyReady: true,
          lastActiveMessageId: "message-1",
          streamText: "流式更新",
        }}
      />,
    );
    expect(historyDelays()).toEqual([120, 360, 800]);

    rerender(
      <ScrollHarness
        options={{
          ...defaultOptions,
          activeMessageCount: 3,
          historyReady: true,
          lastActiveMessageId: "message-2",
        }}
      />,
    );
    expect(historyDelays()).toEqual([120, 360, 800, 120, 360, 800]);
    expect(clearTimeoutSpy).toHaveBeenCalled();

    unmount();
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(6);
  });
});
