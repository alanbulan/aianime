// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCommitTarget,
  directorWorldSourceDisplayName,
  identityOptionsForSelect,
  isUserSelectableCommitKind,
  modelSlotKindsForNodeData,
  renderCommitTargetLabel,
  sceneOptionLabel,
} from "@/modules/creative_canvas/public";

describe("CommitDialog target kinds", () => {
  it("hides deprecated and auxiliary scene asset kinds from user selection", () => {
    expect(isUserSelectableCommitKind("scene_360")).toBe(false);
    expect(isUserSelectableCommitKind("scene_3gs_active_ply")).toBe(false);
    expect(isUserSelectableCommitKind("scene_3gs_collision_glb")).toBe(false);
  });

  it("keeps user-facing scene asset kinds selectable", () => {
    expect(isUserSelectableCommitKind("scene_master")).toBe(true);
    expect(isUserSelectableCommitKind("scene_reverse_master")).toBe(true);
    expect(isUserSelectableCommitKind("scene_director_pano_360")).toBe(true);
    expect(isUserSelectableCommitKind("scene_3gs_master_ply")).toBe(true);
  });

  it("builds canonical trimmed targets and their user-facing labels", () => {
    const target = buildCommitTarget(
      "scene_master",
      null,
      null,
      null,
      null,
      " 公寓楼电梯间 ",
      "",
    );

    expect(target).toEqual({
      kind: "scene_master",
      scene_id: "公寓楼电梯间",
    });
    expect(target && renderCommitTargetLabel(target)).toBe(
      "公寓楼电梯间 / 场景主图",
    );
  });

  it("keeps a selected legacy identity available in the identity dropdown", () => {
    expect(identityOptionsForSelect([
      {
        id: "identity-a",
        identity_id: "identity-a",
        identity_name: "身份 A",
      },
    ], "legacy-id")).toEqual([
      {
        id: "legacy-id",
        identity_id: "legacy-id",
        identity_name: "legacy-id",
      },
      {
        id: "identity-a",
        identity_id: "identity-a",
        identity_name: "身份 A",
      },
    ]);
  });

  it("routes scene 360 candidates to Director Pano 360 instead of the old scene_360 slot", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/creative_canvas/domain/capabilities/candidateCapabilities.ts"),
      "utf8",
    );

    expect(source).toContain('outputKind: "scene_director_pano_360"');
    expect(source).not.toContain('outputKind: "scene_360"');
  });

  it("labels scene director world commits as manifest state instead of a raw 3D model", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/features/freezone/presentation/CommitDialogView.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("commitSourceTitle");
    expect(source).toContain('target?.kind === "scene_director_world"');
    expect(source).toContain("导演世界状态");
    expect(source).toContain("提交当前导演世界 manifest");
  });

  it("shows model scene targets as scene selection instead of a raw scene_id-only field", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/features/freezone/presentation/CommitDialogView.tsx",
      ),
      "utf8",
    );
    const controllerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/freezone/hooks/useCommitDialogTargetController.ts",
      ),
      "utf8",
    );

    expect(controllerSource).toContain("listScenes(project)");
    expect(source).toContain('aria-label="场景"');
    expect(source).toContain("sceneOptionLabel(scene)");
  });

  it("shows canonical scene names in commit target dropdowns, not aliases", () => {
    expect(sceneOptionLabel({
      name: "公寓楼电梯间",
      aliases: ["电梯"],
      variant_id: "night",
    })).toBe("公寓楼电梯间");
  });

  it("uses director world source labels instead of raw generated SOG filenames", () => {
    expect(directorWorldSourceDisplayName(
      {
        activeSourceId: "custom",
        sources: [
          {
            id: "custom",
            source_type: "sog",
            source_kind: "custom",
            ply_url: "/static/u/p/freezone/generated/master_sharp.sog",
          },
        ],
      },
      "/static/u/p/freezone/generated/master_sharp.sog",
      "master_sharp.sog",
    )).toBe("自定义 3D 世界");
  });

  it("keeps custom 3D world sources on the normal slot commit path", () => {
    const viewModelSource = readFileSync(
      resolve(process.cwd(), "src/modules/creative_canvas/presentation/commitDialogViewModel.ts"),
      "utf8",
    );
    const controllerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/freezone/hooks/useCommitDialogTargetController.ts",
      ),
      "utf8",
    );
    const submitControllerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/freezone/hooks/useCommitDialogSubmitController.ts",
      ),
      "utf8",
    );

    expect(isUserSelectableCommitKind("scene_3gs_custom_scene")).toBe(true);
    expect(submitControllerSource).toContain('mediaType === "model"');
    expect(controllerSource).toContain("modelCommitKindAllowed");
    expect(viewModelSource).toContain('"scene_3gs_custom_scene"');
    expect(viewModelSource).toContain("MODEL_WORLD_SLOT_KINDS");
  });

  it("separates pano 360 image commits from 3GS world commits", () => {
    expect(modelSlotKindsForNodeData({
      activeSourceId: "pano",
      sources: [{ id: "pano", source_type: "pano360", pano_url: "/static/pano.jpg" }],
    }, "/static/pano.jpg")).toEqual(["scene_director_pano_360"]);

    expect(modelSlotKindsForNodeData({
      activeSourceId: "world",
      sources: [{ id: "world", source_type: "sog", ply_url: "/static/world.ply" }],
    }, "/static/world.ply")).toEqual([
      "scene_3gs_master_ply",
      "scene_3gs_reverse_ply",
      "scene_3gs_pano_ply",
      "scene_3gs_custom_scene",
    ]);
  });

  it("does not offer file slot commits for the empty Director World source", () => {
    expect(modelSlotKindsForNodeData({
      activeSourceId: "__empty_director_world__",
      sources: [
        { id: "world", source_type: "sog", ply_url: "/static/world.sog" },
      ],
      plyUrl: "/static/world.sog",
    }, "/static/world.sog")).toEqual([]);
  });
});
