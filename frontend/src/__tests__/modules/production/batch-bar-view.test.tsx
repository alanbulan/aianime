// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SketchAspectSelect } from "@/modules/production/presentation/BatchBarView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "episode.sketchSettings.aspectRatio") return "画幅";
      return key;
    },
  }),
}));

describe("BatchBarView sketch aspect select", () => {
  it("uses explicit 2:3 and 16:9 choices", async () => {
    const user = userEvent.setup();
    const onAspectRatioChange = vi.fn();

    render(
      <SketchAspectSelect
        aspectRatio="16:9"
        onAspectRatioChange={onAspectRatioChange}
      />,
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "画幅" })).toHaveTextContent(
      "16:9",
    );

    await user.click(screen.getByRole("combobox", { name: "画幅" }));
    expect(await screen.findByRole("option", { name: "2:3" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "16:9" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "2:3" }));

    expect(onAspectRatioChange).toHaveBeenCalledWith("2:3");
  });
});
