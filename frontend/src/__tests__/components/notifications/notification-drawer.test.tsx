// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/platform_release/public", () => ({
  useCommercialAnnouncements: () => ({
    data: {
      items: [
        {
          id: "announcement-1",
          title: "Maintenance notice",
          body: "Maintenance at 02:00.\n\nThe complete announcement ends here.",
          level: "WARNING",
          pinned: true,
          publishAt: "2026-07-30T18:00:00Z",
          expiresAt: null,
        },
        {
          id: "announcement-2",
          title: "Service notice",
          body: "The full content of the second announcement.",
          level: "INFO",
          pinned: false,
          publishAt: null,
          expiresAt: null,
        },
      ],
      total: 2,
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
        "notifications.closeAnnouncement": "Close announcement",
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

import { NotificationDrawer } from "@/components/notification-drawer";

describe("NotificationDrawer commercial announcements", () => {
  beforeEach(() => {
    delete window.aiAnimeDesktop;
  });

  it("renders cloud announcements only", async () => {
    window.aiAnimeDesktop = { commercial: {} } as AIAnimeDesktopBridge;

    render(<NotificationDrawer open={true} onOpenChange={vi.fn()} />);

    expect(await screen.findByText("Maintenance notice")).toBeInTheDocument();
    expect(screen.getByText(/Maintenance at 02:00/)).toBeInTheDocument();
    expect(screen.queryByText(/New version/)).not.toBeInTheDocument();
  });

  it("opens the full announcement and closes its detail without closing the drawer", async () => {
    const onOpenChange = vi.fn();
    render(<NotificationDrawer open onOpenChange={onOpenChange} />);

    fireEvent.click(await screen.findByRole("button", { name: "Maintenance notice" }));
    const detail = await screen.findByRole("dialog", { name: "Maintenance notice" });
    expect(within(detail).getByText(/The complete announcement ends here/).textContent)
      .toBe("Maintenance at 02:00.\n\nThe complete announcement ends here.");
    expect(within(detail).getByText(/The complete announcement ends here/))
      .not.toHaveClass("line-clamp-2");
    fireEvent.click(within(detail).getByRole("button", { name: "Close announcement" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("complementary", { name: "Notification Center" })).toBeInTheDocument();
  });

  it("does not restore an old detail when the notification drawer is reopened", async () => {
    const onOpenChange = vi.fn();
    const view = render(<NotificationDrawer open onOpenChange={onOpenChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "Maintenance notice" }));
    expect(await screen.findByRole("dialog", { name: "Maintenance notice" })).toBeInTheDocument();
    view.rerender(<NotificationDrawer open={false} onOpenChange={onOpenChange} />);
    view.rerender(<NotificationDrawer open onOpenChange={onOpenChange} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maintenance notice" })).toBeInTheDocument();
  });

  it("shows the selected announcement rather than the previously opened body", async () => {
    render(<NotificationDrawer open onOpenChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Maintenance notice" }));
    const first = await screen.findByRole("dialog", { name: "Maintenance notice" });
    fireEvent.click(within(first).getByRole("button", { name: "Close announcement" }));
    fireEvent.click(screen.getByRole("button", { name: "Service notice" }));
    const second = await screen.findByRole("dialog", { name: "Service notice" });
    expect(within(second).getByText("The full content of the second announcement.")).toBeInTheDocument();
    expect(within(second).queryByText(/Maintenance at/)).not.toBeInTheDocument();
  });
});
