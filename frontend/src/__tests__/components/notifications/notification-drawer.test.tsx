// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/platform_release/public", () => ({
  useCommercialAnnouncements: () => ({
    data: {
      items: [
        {
          id: "announcement-1",
          title: "Maintenance notice",
          body: "Maintenance at 02:00.",
          level: "WARNING",
          pinned: true,
          publishAt: "2026-07-30T18:00:00Z",
          expiresAt: null,
        },
      ],
      total: 1,
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "notifications.title": "Notification Center",
        "notifications.close": "Close notifications",
        "notifications.empty": "No notifications",
        "notifications.loadFailed": "Notifications failed to load",
      })[key] ?? key,
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

import { NotificationDrawer } from "@/components/notifications/notification-drawer";

describe("NotificationDrawer commercial announcements", () => {
  beforeEach(() => {
    delete window.aiAnimeDesktop;
  });

  it("renders cloud announcements only", async () => {
    window.aiAnimeDesktop = { commercial: {} } as AIAnimeDesktopBridge;

    render(<NotificationDrawer open={true} onOpenChange={vi.fn()} />);

    expect(await screen.findByText("Maintenance notice")).toBeInTheDocument();
    expect(screen.getByText("Maintenance at 02:00.")).toBeInTheDocument();
    expect(screen.queryByText(/New version/)).not.toBeInTheDocument();
  });
});