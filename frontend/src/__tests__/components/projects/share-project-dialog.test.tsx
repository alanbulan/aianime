// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ShareProjectController } from "@/modules/project_workspace/application/use-share-project-controller";
import type { ProjectSummary } from "@/modules/project_workspace/domain/project";
import { ShareProjectDialogView } from "@/modules/project_workspace/presentation/components/share-project-dialog";

const project = {
  id: "p1",
  name: "Demo",
  ownerUsername: "alice",
  effectiveRole: "owner",
} as ProjectSummary;

const controller = {
  add: vi.fn(),
  addPending: false,
  changeRole: vi.fn(),
  copyLink: vi.fn(),
  deletePending: false,
  existingPrincipalIds: new Set<string>(),
  grantRows: [],
  grantsLoading: false,
  query: "",
  revoke: vi.fn(),
  role: "editor",
  searchResults: [],
  selectedUser: null,
  setQuery: vi.fn(),
  setRole: vi.fn(),
  setSelectedUser: vi.fn(),
  updatePending: false,
} as unknown as ShareProjectController;

function renderDialog(enabled: boolean) {
  return render(
    <ShareProjectDialogView
      controller={controller}
      enabled={enabled}
      project={project}
      open
      onOpenChange={() => {}}
    />,
  );
}

describe("ShareProjectDialogView edition gating", () => {
  it("renders when project sharing is enabled", () => {
    renderDialog(true);
    expect(screen.getByText("共享项目")).toBeInTheDocument();
  });

  it("renders nothing when project sharing is disabled", () => {
    const { container } = renderDialog(false);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("共享项目")).not.toBeInTheDocument();
  });
});
