// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectVoiceLibraryView } from "./ProjectVoiceLibraryView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) =>
      ({
        "characters.voices.narratorSectionTitle": "第三人称旁白",
        "characters.voices.narratorSectionDescription": "旁白说明",
        "characters.voices.accountSectionTitle": "声线库",
        "characters.voices.accountSectionDescription": "声线库说明",
        "characters.voices.accountSource": "可复用文件",
        "characters.voices.previewUnavailable": "无法试听",
        "characters.voices.delete": "删除声线",
        "characters.voices.deleteTitle": "删除账号声线？",
        "characters.voices.deleteConfirm": "确认删除",
        "characters.voices.deleteFailed": "删除失败",
        "common.cancel": "取消",
      })[key] ??
      (key === "characters.voices.previewFor"
        ? `试听 ${values?.name ?? ""} 的声线`
        : key === "characters.voices.deleteFor"
          ? `删除 ${values?.name ?? ""}`
          : key === "characters.voices.deleteDescription"
            ? `永久删除 ${values?.name ?? ""}`
            : key),
  }),
}));

describe("ProjectVoiceLibraryView", () => {
  it("只展示第三人称旁白和可复用声线库", () => {
    render(
      <ProjectVoiceLibraryView
        accountVoices={[
          {
            voiceId: "fv_saved",
            label: "已保存声线",
            previewUrl: "/api/v1/voices/fv_saved/media",
          },
        ]}
        accountVoicesFailed={false}
        accountVoicesLoading={false}
        narratorVoiceContent={<div>旁白声线控制</div>}
        onDeleteAccountVoice={vi.fn()}
      />,
    );

    expect(screen.getByText("第三人称旁白")).toBeInTheDocument();
    expect(screen.getByText("旁白声线控制")).toBeInTheDocument();
    expect(screen.getByText("声线库")).toBeInTheDocument();
    expect(screen.getByText("已保存声线")).toBeInTheDocument();
    expect(screen.queryByText("角色声线")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("试听 已保存声线 的声线"),
    ).toBeInTheDocument();
  });

  it("确认后删除账号声线文件", async () => {
    const onDeleteAccountVoice = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectVoiceLibraryView
        accountVoices={[
          {
            voiceId: "fv_saved",
            label: "已保存声线",
            previewUrl: "/api/v1/voices/fv_saved/media",
          },
        ]}
        accountVoicesFailed={false}
        accountVoicesLoading={false}
        narratorVoiceContent={null}
        onDeleteAccountVoice={onDeleteAccountVoice}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除 已保存声线" }));
    expect(screen.getByText("永久删除 已保存声线")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(onDeleteAccountVoice).toHaveBeenCalledWith("fv_saved"),
    );
  });

  it("删除失败时保留确认窗口并显示错误", async () => {
    const onDeleteAccountVoice = vi
      .fn()
      .mockRejectedValue(new Error("delete failed"));
    render(
      <ProjectVoiceLibraryView
        accountVoices={[
          {
            voiceId: "fv_saved",
            label: "已保存声线",
            previewUrl: null,
          },
        ]}
        accountVoicesFailed={false}
        accountVoicesLoading={false}
        narratorVoiceContent={null}
        onDeleteAccountVoice={onDeleteAccountVoice}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除 已保存声线" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("删除失败");
    expect(screen.getByText("删除账号声线？")).toBeInTheDocument();
  });
});
