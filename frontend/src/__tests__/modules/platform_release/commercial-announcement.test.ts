import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCommercialAnnouncementFeed } from "@/modules/platform_release/domain/commercial-announcement";
import { electronCommercialAnnouncementGateway } from "@/modules/platform_release/infrastructure/electron-commercial-announcement-gateway";

describe("commercial announcement contract", () => {
  afterEach(() => {
    delete window.aiAnimeDesktop;
  });

  it("parses the documented active announcement feed", () => {
    expect(
      parseCommercialAnnouncementFeed({
        items: [
          {
            id: "announcement-1",
            title: "Maintenance",
            body: "Maintenance at 02:00.",
            level: "WARNING",
            pinned: true,
            publishAt: "2026-07-30T18:00:00Z",
            expiresAt: null,
          },
        ],
        total: 1,
      }),
    ).toEqual({
      items: [
        {
          id: "announcement-1",
          title: "Maintenance",
          body: "Maintenance at 02:00.",
          level: "WARNING",
          pinned: true,
          publishAt: "2026-07-30T18:00:00Z",
          expiresAt: null,
        },
      ],
      total: 1,
    });
  });

  it("rejects incomplete or malformed feeds", () => {
    expect(() => parseCommercialAnnouncementFeed({ items: [], total: -1 })).toThrow(
      "commercial announcements.total must be a non-negative integer",
    );
    expect(() =>
      parseCommercialAnnouncementFeed({
        items: [{ id: "announcement-1", title: "Maintenance" }],
        total: 1,
      }),
    ).toThrow("commercial announcements.items[0].body must be a non-empty string");
  });

  it("uses only the typed Electron announcement bridge", async () => {
    const announcements = vi.fn().mockResolvedValue({ items: [], total: 0 });
    window.aiAnimeDesktop = {
      commercial: { announcements } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;

    await expect(electronCommercialAnnouncementGateway.fetch(12)).resolves.toEqual({
      items: [],
      total: 0,
    });
    expect(announcements).toHaveBeenCalledOnce();
    expect(announcements).toHaveBeenCalledWith(12);
  });
});
