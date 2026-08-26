// Copyright (c) 2026 AI anime
import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

// Match repo convention: mock react-i18next to return the key verbatim so
// assertions stay stable without loading translation files over HTTP in tests.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { TaskLogs } from "@/components/task-center/task-logs";
import { sampleTask } from "@/__mocks__/msw/handlers/tasks";

async function renderLogs(task: Parameters<typeof TaskLogs>[0]["task"]) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<TaskLogs task={task} />);
  });
  return result!;
}

describe("TaskLogs", () => {
  it("renders placeholder when logs empty", async () => {
    await renderLogs(sampleTask({ logs: [] }));
    // With the i18n mock the key is rendered verbatim — verify the placeholder
    // key is on screen so localized text can swap in later without test churn.
    expect(
      screen.getByText("taskCenter.detail.logs.placeholder"),
    ).toBeInTheDocument();
  });

  it("renders log lines joined by newline", async () => {
    await renderLogs(
      sampleTask({ logs: ["[14:32:51] start", "[14:33:01] step 1", "[14:33:12] done"] }),
    );
    const pre = screen.getByText(/\[14:32:51\] start/, { selector: "pre" });
    expect(pre.textContent).toContain("start");
    expect(pre.textContent).toContain("step 1");
    expect(pre.textContent).toContain("done");
  });

  it("uses monospace styling", async () => {
    const { container } = await renderLogs(sampleTask({ logs: ["line"] }));
    const pre = container.querySelector("pre");
    expect(pre?.className).toMatch(/font-mono/);
  });
});
