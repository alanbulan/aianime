// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

import { useAssetWorkspaceNavigation } from "@/modules/asset_world/infrastructure/asset-workspace-navigation";

describe("Asset workspace navigation", () => {
  beforeEach(() => {
    navigate.mockReset();
    window.localStorage.clear();
  });

  it("stores the requested tab and opens the project asset workspace", () => {
    const { result } = renderHook(() =>
      useAssetWorkspaceNavigation("demo project"),
    );

    act(() => result.current("voices"));

    expect(
      window.localStorage.getItem("ai-anime-asset-tab:demo%20project"),
    ).toBe("voices");
    expect(navigate).toHaveBeenCalledWith({
      to: "/projects/$project/characters",
      params: { project: "demo project" },
    });
  });
});
