// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
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
      })[key] ??
      (key === "characters.voices.previewFor"
        ? `试听 ${values?.name ?? ""} 的声线`
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
});
