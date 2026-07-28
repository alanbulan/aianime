// Copyright (c) 2026 AI anime
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { attachBorderBeam, destroy, setActive } = vi.hoisted(() => ({
  attachBorderBeam: vi.fn(),
  destroy: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock("border-beam-vanilla", () => ({ attachBorderBeam }));

import { useComposerBorderBeam } from "@/features/superchat/use-composer-border-beam";

function ComposerHarness({ active }: { active: boolean }) {
  const shellRef = useComposerBorderBeam(active);
  return <div data-testid="composer" ref={shellRef} />;
}

describe("SuperChat composer border beam", () => {
  beforeEach(() => {
    attachBorderBeam.mockReset();
    destroy.mockReset();
    setActive.mockReset();
    attachBorderBeam.mockReturnValue({ destroy, setActive });
  });

  it("attaches the established beam configuration and applies initial activity", () => {
    const { getByTestId } = render(<ComposerHarness active />);

    expect(attachBorderBeam).toHaveBeenCalledWith(getByTestId("composer"), {
      size: "md",
      colorVariant: "colorful",
      theme: "dark",
      active: false,
      borderRadius: 16,
      strength: 0.9,
      duration: 1.96,
    });
    expect(setActive).toHaveBeenCalledWith(true);
  });

  it("updates activity without reattaching and destroys the instance on unmount", () => {
    const { rerender, unmount } = render(<ComposerHarness active={false} />);
    setActive.mockClear();

    rerender(<ComposerHarness active />);
    expect(attachBorderBeam).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledWith(true);

    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
