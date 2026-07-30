// Copyright (c) 2026 AI anime
import {
  existsSync,
  readdirSync,
  readFileSync as readFileSyncStrict,
} from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");
const MODULES_ROOT = resolve(SRC_ROOT, "modules");
const sourceFilesCache = new Map<string, string[]>();
const importSpecifiersCache = new Map<string, string[]>();

function readFileSync(path: string, encoding: "utf8"): string {
  if (!existsSync(path) && relativeSource(path) === "api/ops.ts") return "";
  return readFileSyncStrict(path, encoding);
}

function sourceFiles(root: string): string[] {
  const cached = sourceFilesCache.get(root);
  if (cached) return cached;
  if (!existsSync(root)) return [];
  const files = readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
  sourceFilesCache.set(root, files);
  return files;
}

function relativeSource(path: string): string {
  return relative(SRC_ROOT, path).replace(/\\/g, "/");
}

function sourceSection(path: string, start: string, end?: string): string {
  const source = readFileSync(path, "utf8");
  return source.slice(
    source.indexOf(start),
    end ? source.indexOf(end) : source.length,
  );
}

function importSpecifiers(path: string): string[] {
  const cached = importSpecifiersCache.get(path);
  if (cached) return cached;
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  importSpecifiersCache.set(path, imports);
  return imports;
}

function isRawDataImport(specifier: string): boolean {
  return (
    specifier === "@/shared/api/transport" ||
    specifier === "@/shared/api/client" ||
    specifier.startsWith("@/api/") ||
    specifier.startsWith("@/lib/queries/")
  );
}

describe("frontend architecture boundaries", () => {
  it("keeps main.tsx as a thin application entrypoint", () => {
    const main = readFileSync(resolve(SRC_ROOT, "main.tsx"), "utf8");

    expect(main).toContain('import { bootstrapApplication } from "@/app/bootstrap";');
    expect(main).toContain("void bootstrapApplication();");
    expect(main).not.toContain("new QueryClient");
    expect(main).not.toContain("createRouter(");
    expect(main).not.toContain("<RouterProvider");
  });

  it("keeps routes behind application and module data boundaries", () => {
    const failures: string[] = [];
    for (const path of sourceFiles(resolve(SRC_ROOT, "routes"))) {
      const relativePath = relativeSource(path);
      const count = importSpecifiers(path).filter(isRawDataImport).length;
      if (count > 0) failures.push(`${relativePath}: ${count}`);
    }
    expect(failures).toEqual([]);
  });

  it("keeps episode presentation components behind module data boundaries", () => {
    const failures = sourceFiles(resolve(SRC_ROOT, "components/episode"))
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(isRawDataImport)
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      );

    expect(failures).toEqual([]);
  });

  it("keeps the Production compose route as an adapter", () => {
    const routePath = resolve(
      SRC_ROOT,
      "routes/_app/projects.$project/episodes.$episode/compose.lazy.tsx",
    );
    const route = readFileSync(routePath, "utf8");

    expect(importSpecifiers(routePath)).toContain("@/modules/production/public");
    expect(route).toContain("<EpisodeComposePage");
    expect(route).not.toContain("useState(");
    expect(route).not.toContain("useEffect(");
    expect(route).not.toContain("useQuery(");
    expect(route).not.toContain("useMutation(");
  });

  it("keeps the Creative Canvas route as an adapter", () => {
    const routePath = resolve(
      SRC_ROOT,
      "routes/_app/projects.$project/freezone.lazy.tsx",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/routeComposition.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneProjectPageController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneProjectPageController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneProjectPageView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneProjectPageView.test.tsx",
    );
    const legacyPagePath = resolve(
      SRC_ROOT,
      "features/freezone/FreezoneProjectPage.tsx",
    );
    const route = readFileSync(routePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const pageOwners = sourceFiles(resolve(SRC_ROOT, "features/freezone"))
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "export function FreezoneProjectPage(",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(routePath)).toContain(
      "@/features/freezone/routeComposition",
    );
    expect(route).toContain("<FreezoneProjectPage projectId={project} />");
    expect(route).not.toContain("useState(");
    expect(route).not.toContain("useEffect(");
    expect(route).not.toContain("useQuery(");
    expect(route).not.toContain("useRouterState(");
    expect(route).not.toContain("FreezoneShell");
    expect(existsSync(legacyPagePath)).toBe(false);
    expect(pageOwners).toEqual([
      "features/freezone/routeComposition.ts",
    ]);
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "react",
        "./hooks/useFreezoneProjectPageController",
        "./presentation/FreezoneProjectPageView",
      ]),
    );
    expect(compositionSource).toContain(
      "useFreezoneProjectPageController(projectId)",
    );
    expect(compositionSource).toContain(
      "createElement(FreezoneProjectPageView, { controller })",
    );
    expect(compositionSource).not.toContain("export {");
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@tanstack/react-router",
        "@/features/app/errorDialogEvents",
        "@/lib/url-params",
        "@/modules/identity_access/public",
        "@/modules/project_workspace/public",
        "../domain/canvasIdentity",
      ]),
    );
    expect(controllerSource).not.toContain("<FreezoneShell");
    expect(controllerSource).not.toContain("<GlobalErrorDialog\n");
    expect(controllerSource).not.toContain("className=");
    expect(new Set(importSpecifiers(viewPath))).toEqual(
      new Set([
        "@xyflow/react",
        "@/components/GlobalErrorDialog",
        "../hooks/useFreezoneProjectPageController",
        "../FreezoneShell",
      ]),
    );
    for (const controllerOwner of [
      "useRouterState(",
      "useAllProjectSummaries(",
      "useAuthStore(",
      "readLastCanvas(",
      "subscribeOpenGlobalErrorDialog(",
    ]) {
      expect(viewSource).not.toContain(controllerOwner);
    }
    expect(controllerTestSource).toContain(
      'from "./useFreezoneProjectPageController"',
    );
    expect(viewTestSource).toContain(
      'from "./FreezoneProjectPageView"',
    );
  });

  it("separates the Freezone shell composition, controller, and view", () => {
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/FreezoneShell.tsx",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneShellController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneShellController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneShellView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneShellView.test.tsx",
    );
    const shellSource = readFileSync(shellPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const declarations = [
      ["export function", "FreezoneShell("].join(" "),
      ["export function", "useFreezoneShellController("].join(" "),
      ["export function", "FreezoneShellView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(shellPath))).toEqual(
      new Set([
        "react",
        "@/modules/project_workspace/public",
        "./hooks/useFreezoneShellController",
        "./presentation/FreezoneShellView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/freezone/FreezoneShell.tsx"],
      ["features/freezone/hooks/useFreezoneShellController.ts"],
      ["features/freezone/presentation/FreezoneShellView.tsx"],
    ]);
    expect(shellSource).toContain("useFreezoneShellController({");
    expect(shellSource).toContain(
      "createElement(FreezoneShellView, { controller })",
    );
    expect(shellSource).not.toContain("useState(");
    expect(shellSource).not.toContain("useEffect(");
    expect(shellSource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasSync(projectId, canvasId)");
    expect(controllerSource).toContain("useCanvasCommitController({");
    expect(controllerSource).toContain(
      "useCanvasProjectionCommandController({",
    );
    expect(controllerSource).not.toContain("<Canvas");
    expect(controllerSource).not.toContain("className=");
    expect(viewSource).toContain("<Canvas");
    expect(viewSource).toContain("<AssetLibraryPanel");
    expect(viewSource).toContain("<FreezoneChatDock");
    expect(viewSource).not.toContain("useCanvasSync(");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("writeUrl(");
    expect(viewSource).not.toContain("isCeRuntime(");
    expect(controllerTestSource).toContain(
      'from "./useFreezoneShellController"',
    );
    expect(viewTestSource).toContain('from "./FreezoneShellView"');
  });

  it("separates the Canvas node-selection menu controller and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/NodeSelectionMenu.tsx",
    );
    const entryTestPath = resolve(
      SRC_ROOT,
      "features/canvas/NodeSelectionMenu.test.tsx",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useNodeSelectionMenuController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useNodeSelectionMenuController.test.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/nodeSelectionMenuModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/nodeSelectionMenuModel.test.ts",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/NodeSelectionMenuView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/NodeSelectionMenuView.test.tsx",
    );
    const stagePath = resolve(
      SRC_ROOT,
      "features/canvas/ui/CanvasStageView.tsx",
    );
    const legacyTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/canvas/node-selection-menu.test.tsx",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const entryTestSource = readFileSync(entryTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const declarations = [
      ["export function", "NodeSelectionMenu("].join(" "),
      ["export function", "useNodeSelectionMenuController("].join(" "),
      ["export function", "referenceGenerateItemsForAllowedTypes("].join(" "),
      ["export function", "skillGroupsForNodeSelectionMenu("].join(" "),
      ["export function", "NodeSelectionMenuView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(existsSync(legacyTestPath)).toBe(false);
    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "./hooks/useNodeSelectionMenuController",
        "./ui/NodeSelectionMenuView",
      ]),
    );
    expect(new Set(importSpecifiers(modelPath))).toEqual(
      new Set([
        "@/features/canvas/domain/canvasNodes",
        "@/features/freezone/public",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/NodeSelectionMenu.tsx"],
      ["features/canvas/hooks/useNodeSelectionMenuController.ts"],
      ["features/canvas/ui/nodeSelectionMenuModel.ts"],
      ["features/canvas/ui/nodeSelectionMenuModel.ts"],
      ["features/canvas/ui/NodeSelectionMenuView.tsx"],
    ]);
    expect(importSpecifiers(stagePath)).toContain("../NodeSelectionMenu");
    expect(entrySource).toContain("useNodeSelectionMenuController(props)");
    expect(entrySource).toContain(
      "createElement(NodeSelectionMenuView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useLayoutEffect(");
    expect(controllerSource).toContain("document.addEventListener('mousedown'");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("lucide-react");
    expect(modelSource).not.toContain("from 'react'");
    expect(modelSource).not.toContain("window.");
    expect(modelSource).not.toContain("document.");
    expect(viewSource).toContain("<CanvasAddNodeGrid");
    expect(viewSource).toContain("controller.activeSkillGroup.items.map");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("document.");
    expect(entryTestSource).toContain('from \'./NodeSelectionMenu\'');
    expect(controllerTestSource).toContain(
      'from \'./useNodeSelectionMenuController\'',
    );
    expect(modelTestSource).toContain('from \'./nodeSelectionMenuModel\'');
    expect(viewTestSource).toContain('from \'./NodeSelectionMenuView\'');
  });

  it("separates the Canvas video-story node controller and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoStoryNode.tsx",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoStoryNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoStoryNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoStoryNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoStoryNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "VideoStoryNode", "=", "memo("].join(" "),
      ["export function", "useVideoStoryNodeController("].join(" "),
      ["export function", "VideoStoryNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useVideoStoryNodeController",
        "./VideoStoryNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/VideoStoryNode.tsx"],
      ["features/canvas/hooks/useVideoStoryNodeController.ts"],
      ["features/canvas/nodes/VideoStoryNodeView.tsx"],
    ]);
    expect(registrySource).toContain("import { VideoStoryNode } from './VideoStoryNode'");
    expect(registrySource).toContain("videoStoryNode: VideoStoryNode");
    expect(entrySource).toContain("useVideoStoryNodeController(props)");
    expect(entrySource).toContain(
      "createElement(VideoStoryNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(entrySource).not.toContain("createPortal(");
    expect(controllerSource).toContain("useUpdateNodeInternals()");
    expect(controllerSource).toContain("updateNodeData(id, {");
    expect(controllerSource).toContain("window.addEventListener('keydown'");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("createPortal(");
    expect(viewSource).toContain("<StoryTable");
    expect(viewSource).toContain("createPortal(");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("useUpdateNodeInternals(");
    expect(controllerTestSource).toContain(
      'from \'./useVideoStoryNodeController\'',
    );
    expect(viewTestSource).toContain('from \'./VideoStoryNodeView\'');
  });

  it("separates the Canvas audio-node domain, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/AudioNode.tsx",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/audioFileTypes.ts",
    );
    const domainTestPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/audioFileTypes.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAudioNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAudioNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/AudioNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/AudioNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const domainSource = readFileSync(domainPath, "utf8");
    const domainTestSource = readFileSync(domainTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "AudioNode", "=", "memo("].join(" "),
      ["export function", "isAudioFile("].join(" "),
      ["export function", "useAudioNodeController("].join(" "),
      ["export function", "AudioNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useAudioNodeController",
        "./AudioNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/AudioNode.tsx"],
      ["features/canvas/domain/audioFileTypes.ts"],
      ["features/canvas/hooks/useAudioNodeController.ts"],
      ["features/canvas/nodes/AudioNodeView.tsx"],
    ]);
    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("@/api/");
    expect(registrySource).toContain("import { AudioNode } from './AudioNode'");
    expect(registrySource).toContain("audioNode: AudioNode");
    expect(entrySource).toContain("useAudioNodeController(props)");
    expect(entrySource).toContain(
      "createElement(AudioNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useIsBoxSelecting()");
    expect(controllerSource).toContain(
      "canvasEventBus.subscribe(\n    'audio-node/external-file'",
    );
    expect(controllerSource).toContain("uploadCanvasAsset(projectId");
    expect(controllerSource).toContain(
      "loadCanvasAudioReferences(project)",
    );
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<Handle");
    expect(viewSource).toContain("<AudioWaveformPlayer");
    expect(viewSource).toContain("<AudioOperationsPanel");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("uploadCanvasAsset(");
    expect(viewSource).not.toContain("loadCanvasAudioReferences(");
    expect(domainTestSource).toContain("from './audioFileTypes'");
    expect(controllerTestSource).toContain(
      "from './useAudioNodeController'",
    );
    expect(viewTestSource).toContain("from './AudioNodeView'");
  });

  it("separates the Canvas image-node sizing, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageNode.tsx",
    );
    const sizingPath = resolve(
      SRC_ROOT,
      "features/canvas/application/imageNodeSizing.ts",
    );
    const sizingTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/canvas/image-node-resize-min.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const sizingSource = readFileSync(sizingPath, "utf8");
    const sizingTestSource = readFileSync(sizingTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "ImageNode", "=", "memo("].join(" "),
      ["export function", "resolveImageNodeDimension("].join(" "),
      ["export function", "useImageNodeController("].join(" "),
      ["export function", "ImageNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useImageNodeController",
        "./ImageNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/ImageNode.tsx"],
      ["features/canvas/application/imageNodeSizing.ts"],
      ["features/canvas/hooks/useImageNodeController.ts"],
      ["features/canvas/nodes/ImageNodeView.tsx"],
    ]);
    expect(registrySource).toContain("import { ImageNode } from './ImageNode'");
    expect(registrySource).toContain("exportImageNode: ImageNode");
    expect(registrySource).toContain("imageNode: ImageEditNode");
    expect(entrySource).toContain("useImageNodeController(props)");
    expect(entrySource).toContain(
      "createElement(ImageNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(sizingSource).not.toContain("react");
    expect(sizingSource).not.toContain("useCanvasStore");
    expect(sizingTestSource).toContain("resolveImageNodeDimension");
    expect(controllerSource).toContain("useUpdateNodeInternals()");
    expect(controllerSource).toContain("useStore((state)");
    expect(controllerSource).toContain("collectCandidateBindingsForNode(");
    expect(controllerSource).toContain("updateNodeSize(id, nextSize, {");
    expect(controllerSource).toContain("regenerateExportImageNode({");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<CanvasNodeImage");
    expect(viewSource).toContain("<CanvasNodeImage");
    expect(viewSource).toContain("<RegenerateButton");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("useStore(");
    expect(viewSource).not.toContain("regenerateExportImageNode(");
    expect(controllerTestSource).toContain(
      "from './useImageNodeController'",
    );
    expect(viewTestSource).toContain("from './ImageNodeView'");
  });

  it("separates the Canvas video-compose inputs, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoComposeNode.tsx",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeInputs.ts",
    );
    const domainTestPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeInputs.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposeNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposeNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoComposeNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoComposeNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const domainSource = readFileSync(domainPath, "utf8");
    const domainTestSource = readFileSync(domainTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "VideoComposeNode", "=", "memo("].join(" "),
      ["export function", "projectVideoComposeInputs("].join(" "),
      ["export function", "useVideoComposeNodeController("].join(" "),
      ["export function", "VideoComposeNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useVideoComposeNodeController",
        "./VideoComposeNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/VideoComposeNode.tsx"],
      ["features/canvas/domain/videoComposeInputs.ts"],
      ["features/canvas/hooks/useVideoComposeNodeController.ts"],
      ["features/canvas/nodes/VideoComposeNodeView.tsx"],
    ]);
    expect(importSpecifiers(domainPath)).toEqual(["./canvasNodes"]);
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("useCanvasStore");
    expect(registrySource).toContain(
      "import { VideoComposeNode } from './VideoComposeNode'",
    );
    expect(registrySource).toContain("videoComposeNode: VideoComposeNode");
    expect(entrySource).toContain("useVideoComposeNodeController(props)");
    expect(entrySource).toContain(
      "createElement(VideoComposeNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useUpstreamNodes(id)");
    expect(controllerSource).toContain("projectVideoComposeInputs(");
    expect(controllerSource).toContain("useCanvasStore.getState()");
    expect(controllerSource).toContain("store.findNodePosition(id, 580, 380)");
    expect(controllerSource).toContain(
      "store.addNode(CANVAS_NODE_TYPES.video",
    );
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<VideoComposeModal");
    expect(viewSource).toContain("<VideoComposeModal");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("useUpstreamNodes(");
    expect(viewSource).not.toContain("findNodePosition(");
    expect(domainTestSource).toContain("from './videoComposeInputs'");
    expect(controllerTestSource).toContain(
      "from './useVideoComposeNodeController'",
    );
    expect(viewTestSource).toContain("from './VideoComposeNodeView'");
  });

  it("separates the Canvas group-node controller and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/GroupNode.tsx",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useGroupNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useGroupNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/GroupNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/GroupNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "GroupNode", "=", "memo("].join(" "),
      ["export function", "useGroupNodeController("].join(" "),
      ["export function", "GroupNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useGroupNodeController",
        "./GroupNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/GroupNode.tsx"],
      ["features/canvas/hooks/useGroupNodeController.ts"],
      ["features/canvas/nodes/GroupNodeView.tsx"],
    ]);
    expect(registrySource).toContain("import { GroupNode } from './GroupNode'");
    expect(registrySource).toContain("groupNode: GroupNode");
    expect(entrySource).toContain("useGroupNodeController(props)");
    expect(entrySource).toContain(
      "createElement(GroupNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("uploadCanvasAsset(projectId");
    expect(controllerSource).toContain("useReactFlow()");
    expect(controllerSource).toContain("computeSnapAlign(");
    expect(controllerSource).toContain("fitGroupToChildren(id)");
    expect(controllerSource).toContain(
      "useCanvasProjectionStatus(projectionKey)",
    );
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<Handle");
    expect(viewSource).toContain("<CanvasHistoryAssetsModal");
    expect(viewSource).toContain("projection-stale-frame");
    expect(viewSource).toContain("projection-stale-banner");
    expect(viewSource).toContain("<NodeResizeHandle");
    expect(viewSource).toContain("<Handle");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("uploadCanvasAsset(");
    expect(viewSource).not.toContain("useCanvasProjectionStatus(");
    expect(viewSource).not.toContain("storyboardSlotRect(");
    expect(controllerTestSource).toContain(
      "from './useGroupNodeController'",
    );
    expect(viewTestSource).toContain("from './GroupNodeView'");
  });

  it("separates the Canvas text-annotation model, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/TextAnnotationNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/textAnnotationNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/textAnnotationNodeModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useTextAnnotationNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useTextAnnotationNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/TextAnnotationNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/TextAnnotationNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "TextAnnotationNode", "=", "memo("].join(" "),
      ["export function", "resolveTextAnnotationMode("].join(" "),
      ["export function", "useTextAnnotationNodeController("].join(" "),
      ["export function", "TextAnnotationNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useTextAnnotationNodeController",
        "./TextAnnotationNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/TextAnnotationNode.tsx"],
      ["features/canvas/domain/textAnnotationNodeModel.ts"],
      ["features/canvas/hooks/useTextAnnotationNodeController.ts"],
      ["features/canvas/nodes/TextAnnotationNodeView.tsx"],
    ]);
    expect(importSpecifiers(modelPath)).toEqual(["./canvasNodes"]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(registrySource).toContain(
      "import { TextAnnotationNode } from './TextAnnotationNode'",
    );
    expect(registrySource).toContain(
      "textAnnotationNode: TextAnnotationNode",
    );
    expect(entrySource).toContain("useTextAnnotationNodeController(props)");
    expect(entrySource).toContain(
      "createElement(TextAnnotationNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("generateCanvasReversePrompt(");
    expect(controllerSource).toContain("submitVideoGeneration({");
    expect(controllerSource).toContain("translateCanvasText({");
    expect(controllerSource).toContain("useIsBoxSelecting()");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<ReactMarkdown");
    expect(viewSource).toContain("<ReactMarkdown");
    expect(viewSource).toContain("<ProviderModelPicker");
    expect(viewSource).toContain("<NodeGenerationOverlay");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("generateCanvasReversePrompt(");
    expect(viewSource).not.toContain("submitVideoGeneration(");
    expect(viewSource).not.toContain("translateCanvasText(");
    expect(modelTestSource).toContain(
      "from './textAnnotationNodeModel'",
    );
    expect(controllerTestSource).toContain(
      "from './useTextAnnotationNodeController'",
    );
    expect(viewTestSource).toContain("from './TextAnnotationNodeView'");
  });

  it("separates the Canvas upload-node model, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/UploadNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/uploadNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/uploadNodeModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useUploadNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useUploadNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/UploadNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/UploadNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "UploadNode", "=", "memo("].join(" "),
      ["export function", "resolveUploadNodeLayout("].join(" "),
      ["export function", "useUploadNodeController("].join(" "),
      ["export function", "UploadNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useUploadNodeController",
        "./UploadNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/UploadNode.tsx"],
      ["features/canvas/application/uploadNodeModel.ts"],
      ["features/canvas/hooks/useUploadNodeController.ts"],
      ["features/canvas/nodes/UploadNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("uploadCanvasAsset(");
    expect(registrySource).toContain(
      "import { UploadNode } from './UploadNode'",
    );
    expect(registrySource).toContain("uploadNode: UploadNode");
    expect(entrySource).toContain("useUploadNodeController(props)");
    expect(entrySource).toContain(
      "createElement(UploadNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("uploadCanvasAsset(");
    expect(controllerSource).toContain("canvasEventBus.subscribe(");
    expect(controllerSource).toContain("getCanvasBeatDirectorManifest(");
    expect(controllerSource).toContain("captureCanvasNodeBusyRef");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<ThreeDDirectorDialog");
    expect(viewSource).toContain("<ThreeDDirectorDialog");
    expect(viewSource).toContain(
      "onSubmitDirectorCombined={controller.submitDirectorCombined}",
    );
    expect(viewSource).toContain(
      "onCaptureCanvasNode={controller.captureDirectorCanvasNode}",
    );
    expect(viewSource).toContain("<CanvasNodeImage");
    expect(viewSource).toContain("<NodeResizeHandle");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("uploadCanvasAsset(");
    expect(modelTestSource).toContain("from './uploadNodeModel'");
    expect(controllerTestSource).toContain(
      "from './useUploadNodeController'",
    );
    expect(viewTestSource).toContain("from './UploadNodeView'");
  });

  it("separates the Canvas script-node model, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ScriptNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/scriptNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/scriptNodeModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useScriptNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useScriptNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ScriptNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ScriptNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "ScriptNode", "=", "memo("].join(" "),
      ["export function", "resolveScriptNodeSize("].join(" "),
      ["export function", "useScriptNodeController("].join(" "),
      ["export function", "ScriptNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useScriptNodeController",
        "./ScriptNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/ScriptNode.tsx"],
      ["features/canvas/application/scriptNodeModel.ts"],
      ["features/canvas/hooks/useScriptNodeController.ts"],
      ["features/canvas/nodes/ScriptNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("className=");
    expect(registrySource).toContain(
      "import { ScriptNode } from './ScriptNode'",
    );
    expect(registrySource).toContain("scriptNode: ScriptNode");
    expect(entrySource).toContain("useScriptNodeController(props)");
    expect(entrySource).toContain(
      "createElement(ScriptNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("generateCanvasStoryScript(");
    expect(controllerSource).toContain("translateCanvasText({");
    expect(controllerSource).toContain("useNodeGenerationHistory(");
    expect(controllerSource).toContain("resolveScriptNodeSpawnPlan({");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<OperationPanelShell");
    expect(viewSource).toContain("<OperationPanelShell");
    expect(viewSource).toContain("<ScriptResultTable");
    expect(viewSource).toContain("<NodeGenerationHistory");
    expect(viewSource).toContain("createPortal(");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("generateCanvasStoryScript(");
    expect(viewSource).not.toContain("translateCanvasText(");
    expect(modelTestSource).toContain("from './scriptNodeModel'");
    expect(controllerTestSource).toContain(
      "from './useScriptNodeController'",
    );
    expect(viewTestSource).toContain("from './ScriptNodeView'");
  });

  it("separates the Canvas pano-viewer model, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/Pano360ViewerNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/pano360ViewerNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/pano360ViewerNodeModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/usePano360ViewerNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/usePano360ViewerNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/Pano360ViewerNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/Pano360ViewerNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const viewerKitPublicPath = resolve(
      SRC_ROOT,
      "features/viewer-kit/public.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const viewerKitPublicSource = readFileSync(viewerKitPublicPath, "utf8");
    const declarations = [
      ["export const", "Pano360ViewerNode", "=", "memo("].join(" "),
      ["export function", "resolvePanoViewerNodeSize("].join(" "),
      ["export function", "usePano360ViewerNodeController("].join(" "),
      ["export function", "Pano360ViewerNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/usePano360ViewerNodeController",
        "./Pano360ViewerNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/Pano360ViewerNode.tsx"],
      ["features/canvas/application/pano360ViewerNodeModel.ts"],
      ["features/canvas/hooks/usePano360ViewerNodeController.ts"],
      ["features/canvas/nodes/Pano360ViewerNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("className=");
    expect(modelSource).not.toContain("new Viewer(");
    expect(importSpecifiers(modelPath)).toContain(
      "@/features/viewer-kit/public",
    );
    expect(importSpecifiers(modelPath)).not.toContain(
      "@/features/viewer-kit/pano/panoCapture",
    );
    expect(registrySource).toContain(
      "import { Pano360ViewerNode } from './Pano360ViewerNode'",
    );
    expect(registrySource).toContain(
      "pano360ViewerNode: Pano360ViewerNode",
    );
    expect(entrySource).toContain(
      "usePano360ViewerNodeController(props)",
    );
    expect(entrySource).toContain(
      "createElement(Pano360ViewerNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("new Viewer({");
    expect(controllerSource).toContain("getFreezoneCanvasMetadata(");
    expect(controllerSource).toContain(
      "uploadAndAutoCommitSelectedBackgroundCandidate(",
    );
    expect(controllerSource).toContain("addPanoCaptureGroup(");
    expect(importSpecifiers(controllerPath)).toContain(
      "@/features/viewer-kit/public",
    );
    expect(importSpecifiers(controllerPath)).not.toContain(
      "@/features/viewer-kit/pano/panoCapture",
    );
    expect(controllerSource).not.toContain("function waitFrames(");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<NodeHeader");
    expect(viewSource).toContain("<ReactFlowNodeToolbar");
    expect(viewSource).toContain("<SliderRow");
    expect(viewSource).toContain("<NodeResizeHandle");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("new Viewer(");
    expect(viewSource).not.toContain("getFreezoneCanvasMetadata(");
    expect(viewerKitPublicSource).toContain("waitFrames as waitPanoFrames");
    expect(viewerKitPublicSource).toContain(
      "normalizePanoDegrees",
    );
    expect(modelTestSource).toContain(
      "from './pano360ViewerNodeModel'",
    );
    expect(controllerTestSource).toContain(
      "from './usePano360ViewerNodeController'",
    );
    expect(viewTestSource).toContain(
      "from './Pano360ViewerNodeView'",
    );
  });

  it("separates the Canvas storyboard model, export use case, runtime, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/StoryboardNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardNodeModel.test.ts",
    );
    const exportPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardExport.ts",
    );
    const exportTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardExport.test.ts",
    );
    const runtimePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserStoryboardExportRuntime.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useStoryboardNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useStoryboardNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/StoryboardNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/StoryboardNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const exportSource = readFileSync(exportPath, "utf8");
    const exportTestSource = readFileSync(exportTestPath, "utf8");
    const runtimeSource = readFileSync(runtimePath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const declarations = [
      ["export const", "StoryboardNode", "=", "memo("].join(" "),
      ["export function", "resolveStoryboardNodeProjection("].join(" "),
      ["export async function", "exportStoryboardGrid("].join(" "),
      ["export async function", "applyStoryboardTextOverlay("].join(" "),
      ["export function", "useStoryboardNodeController("].join(" "),
      ["export function", "StoryboardNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useStoryboardNodeController",
        "./StoryboardNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/StoryboardNode.tsx"],
      ["features/canvas/application/storyboardNodeModel.ts"],
      ["features/canvas/application/storyboardExport.ts"],
      ["features/canvas/infrastructure/browserStoryboardExportRuntime.ts"],
      ["features/canvas/hooks/useStoryboardNodeController.ts"],
      ["features/canvas/nodes/StoryboardNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("className=");
    expect(exportSource).not.toContain("document.");
    expect(exportSource).not.toContain("useCanvasStore");
    expect(exportSource).not.toContain("className=");
    expect(runtimeSource).toContain("document.createElement('canvas')");
    expect(runtimeSource).not.toContain("useCanvasStore");
    expect(registrySource).toContain(
      "import { StoryboardNode } from './StoryboardNode'",
    );
    expect(registrySource).toContain("storyboardNode: StoryboardNode");
    expect(entrySource).toContain("useStoryboardNodeController(props)");
    expect(entrySource).toContain(
      "createElement(StoryboardNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("exportStoryboardGrid({");
    expect(controllerSource).toContain("packStoryboardFrames(");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<NodeHeader");
    expect(viewSource).toContain("<FrameCard");
    expect(viewSource).toContain("<ExportSettingsPanel");
    expect(viewSource).toContain("<NodeResizeHandle");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("exportStoryboardGrid(");
    expect(compositionSource).toContain(
      "exportStoryboardGridUseCase(command, {",
    );
    expect(compositionSource).toContain(
      "applyTextOverlay: applyStoryboardTextOverlay",
    );
    expect(existsSync(resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardNodeLayout.ts",
    ))).toBe(false);
    expect(modelTestSource).toContain("from './storyboardNodeModel'");
    expect(exportTestSource).toContain("from './storyboardExport'");
    expect(controllerTestSource).toContain(
      "from './useStoryboardNodeController'",
    );
    expect(viewTestSource).toContain("from './StoryboardNodeView'");
  });

  it("separates the Canvas storyboard-generator model, runtime, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/StoryboardGenNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardGenNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardGenNodeModel.test.ts",
    );
    const runtimePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserStoryboardGenRuntime.ts",
    );
    const runtimeTestPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserStoryboardGenRuntime.test.ts",
    );
    const caretRuntimePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserTextareaCaret.ts",
    );
    const caretRuntimeTestPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserTextareaCaret.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useStoryboardGenNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useStoryboardGenNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/StoryboardGenNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/StoryboardGenNodeView.test.tsx",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/index.ts",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const runtimeSource = readFileSync(runtimePath, "utf8");
    const runtimeTestSource = readFileSync(runtimeTestPath, "utf8");
    const caretRuntimeSource = readFileSync(caretRuntimePath, "utf8");
    const caretRuntimeTestSource = readFileSync(caretRuntimeTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "StoryboardGenNode", "=", "memo("].join(" "),
      ["export function", "resolveStoryboardGenLayout("].join(" "),
      ["export function", "generateStoryboardGridImageDataUrl("].join(" "),
      ["export function", "measureTextareaCaretOffset("].join(" "),
      ["export function", "useStoryboardGenNodeController("].join(" "),
      ["export function", "StoryboardGenNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useStoryboardGenNodeController",
        "./StoryboardGenNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/StoryboardGenNode.tsx"],
      ["features/canvas/application/storyboardGenNodeModel.ts"],
      ["features/canvas/infrastructure/browserStoryboardGenRuntime.ts"],
      ["features/canvas/infrastructure/browserTextareaCaret.ts"],
      ["features/canvas/hooks/useStoryboardGenNodeController.ts"],
      ["features/canvas/nodes/StoryboardGenNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("className=");
    expect(runtimeSource).toContain("document.createElement('canvas')");
    expect(runtimeSource).toContain("measureTextareaCaretOffset(");
    expect(runtimeSource).not.toContain("document.createElement('div')");
    expect(caretRuntimeSource).toContain("document.createElement('div')");
    expect(caretRuntimeSource).not.toContain("useCanvasStore");
    expect(runtimeSource).not.toContain("useCanvasStore");
    expect(registrySource).toContain(
      "import { StoryboardGenNode } from './StoryboardGenNode'",
    );
    expect(registrySource).toContain("storyboardGenNode: StoryboardGenNode");
    expect(entrySource).toContain("useStoryboardGenNodeController(props)");
    expect(entrySource).toContain(
      "createElement(StoryboardGenNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("useSettingsStore(");
    expect(controllerSource).toContain(
      "canvasAiGateway.submitGenerateImageJob(",
    );
    expect(controllerSource).toContain("generateStoryboardGridImageDataUrl(");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<NodeHeader");
    expect(viewSource).toContain("<GridStepperControl");
    expect(viewSource).toContain("<ModelParamsControls");
    expect(viewSource).toContain("<NodeResizeHandle");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("useSettingsStore(");
    expect(viewSource).not.toContain("canvasAiGateway");
    expect(modelTestSource).toContain("from './storyboardGenNodeModel'");
    expect(runtimeTestSource).toContain(
      "from './browserStoryboardGenRuntime'",
    );
    expect(caretRuntimeTestSource).toContain(
      "from './browserTextareaCaret'",
    );
    expect(controllerTestSource).toContain(
      "from './useStoryboardGenNodeController'",
    );
    expect(viewTestSource).toContain("from './StoryboardGenNodeView'");
  });

  it("separates the Canvas image-edit model, runtime, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageEditNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/imageEditNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/imageEditNodeModel.test.ts",
    );
    const runtimePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserImageEditRuntime.ts",
    );
    const runtimeTestPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserImageEditRuntime.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageEditNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageEditNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageEditNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageEditNodeView.test.tsx",
    );
    const registryPath = resolve(SRC_ROOT, "features/canvas/nodes/index.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const runtimeSource = readFileSync(runtimePath, "utf8");
    const runtimeTestSource = readFileSync(runtimeTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "ImageEditNode", "=", "memo("].join(" "),
      ["export function", "resolveImageEditNodeSize("].join(" "),
      ["export function", "resolveImageEditPickerAnchor("].join(" "),
      ["export function", "useImageEditNodeController("].join(" "),
      ["export function", "ImageEditNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useImageEditNodeController",
        "./ImageEditNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/ImageEditNode.tsx"],
      ["features/canvas/application/imageEditNodeModel.ts"],
      ["features/canvas/infrastructure/browserImageEditRuntime.ts"],
      ["features/canvas/hooks/useImageEditNodeController.ts"],
      ["features/canvas/nodes/ImageEditNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("className=");
    expect(runtimeSource).toContain("measureTextareaCaretOffset(");
    expect(runtimeSource).not.toContain("document.createElement('div')");
    expect(runtimeSource).not.toContain("useCanvasStore");
    expect(registrySource).toContain(
      "import { ImageEditNode } from './ImageEditNode'",
    );
    expect(registrySource).toContain("imageNode: ImageEditNode");
    expect(entrySource).toContain("useImageEditNodeController(props)");
    expect(entrySource).toContain(
      "createElement(ImageEditNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("useSettingsStore(");
    expect(controllerSource).toContain(
      "canvasAiGateway.submitGenerateImageJob(",
    );
    expect(controllerSource).toContain("planImageEditAssetReferences({");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<NodeHeader");
    expect(viewSource).toContain("<ModelParamsControls");
    expect(viewSource).toContain("<AssetLibraryModal");
    expect(viewSource).toContain("<NodeResizeHandle");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("useSettingsStore(");
    expect(viewSource).not.toContain("canvasAiGateway");
    expect(modelTestSource).toContain("from './imageEditNodeModel'");
    expect(runtimeTestSource).toContain("from './browserImageEditRuntime'");
    expect(controllerTestSource).toContain(
      "from './useImageEditNodeController'",
    );
    expect(viewTestSource).toContain("from './ImageEditNodeView'");
  });

  it("separates the Canvas Beat Context model, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/BeatContextNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/beatContextNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/beatContextNodeModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useBeatContextNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useBeatContextNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/BeatContextNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/BeatContextNodeView.test.tsx",
    );
    const registryPath = resolve(SRC_ROOT, "features/canvas/nodes/index.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "BeatContextNode", "=", "memo("].join(" "),
      ["export function", "resolveBeatContextSnapshot("].join(" "),
      ["export function", "useBeatContextNodeController("].join(" "),
      ["export function", "BeatContextNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useBeatContextNodeController",
        "./BeatContextNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/BeatContextNode.tsx"],
      ["features/canvas/application/beatContextNodeModel.ts"],
      ["features/canvas/hooks/useBeatContextNodeController.ts"],
      ["features/canvas/nodes/BeatContextNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("window.");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("className=");
    expect(registrySource).toContain(
      "import { BeatContextNode } from './BeatContextNode'",
    );
    expect(registrySource).toContain("beatContextNode: BeatContextNode");
    expect(entrySource).toContain("useBeatContextNodeController(props)");
    expect(entrySource).toContain(
      "createElement(BeatContextNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("useEpisodeDetail(");
    expect(controllerSource).toContain("updateBeat(");
    expect(controllerSource).toContain(
      "restoreCurrentMainlinePresetCanvas(projectId)",
    );
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<NodeHeader");
    expect(viewSource).toContain("<UiSelect");
    expect(viewSource).toContain("<SelectableTokenGroup");
    expect(viewSource).toContain("<ContextColorPalette");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("updateBeat(");
    expect(modelTestSource).toContain("from './beatContextNodeModel'");
    expect(controllerTestSource).toContain(
      "from './useBeatContextNodeController'",
    );
    expect(viewTestSource).toContain("from './BeatContextNodeView'");
  });

  it("separates the Canvas Director World model, capture use case, runtime, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ThreeDWorldNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/threeDWorldNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/threeDWorldNodeModel.test.ts",
    );
    const capturePath = resolve(
      SRC_ROOT,
      "features/canvas/application/directorCaptureBundle.ts",
    );
    const captureTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/directorCaptureBundle.test.ts",
    );
    const runtimePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserDirectorCaptureRuntime.ts",
    );
    const runtimeTestPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserDirectorCaptureRuntime.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useThreeDWorldNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useThreeDWorldNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ThreeDWorldNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ThreeDWorldNodeView.test.tsx",
    );
    const thumbPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ThreeDWorldReferenceImageThumb.tsx",
    );
    const registryPath = resolve(SRC_ROOT, "features/canvas/nodes/index.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const captureSource = readFileSync(capturePath, "utf8");
    const captureTestSource = readFileSync(captureTestPath, "utf8");
    const runtimeSource = readFileSync(runtimePath, "utf8");
    const runtimeTestSource = readFileSync(runtimeTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const thumbSource = readFileSync(thumbPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "ThreeDWorldNode", "=", "memo("].join(" "),
      ["export function", "directorSourcesForNode("].join(" "),
      ["export async function", "uploadDirectorCaptureBundle("].join(" "),
      ["export function", "directorCaptureBlobToDataUrl("].join(" "),
      ["export function", "useThreeDWorldNodeController("].join(" "),
      ["export function", "ThreeDWorldNodeView("].join(" "),
      ["export function", "ThreeDWorldReferenceImageThumb("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useThreeDWorldNodeController",
        "./ThreeDWorldNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/ThreeDWorldNode.tsx"],
      ["features/canvas/application/threeDWorldNodeModel.ts"],
      ["features/canvas/application/directorCaptureBundle.ts"],
      ["features/canvas/infrastructure/browserDirectorCaptureRuntime.ts"],
      ["features/canvas/hooks/useThreeDWorldNodeController.ts"],
      ["features/canvas/nodes/ThreeDWorldNodeView.tsx"],
      ["features/canvas/nodes/ThreeDWorldReferenceImageThumb.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("window.");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("className=");
    expect(captureSource).toContain("uploadAsset(");
    expect(captureSource).not.toContain("uploadCanvasAsset");
    expect(captureSource).not.toContain("ThreeDDirectorDialog");
    expect(captureSource).not.toContain("useCanvasStore");
    expect(runtimeSource).toContain("new FileReader()");
    expect(runtimeSource).toContain("new Image()");
    expect(runtimeSource).not.toContain("react");
    expect(runtimeSource).not.toContain("useCanvasStore");
    expect(registrySource).toContain(
      "import { ThreeDWorldNode } from './ThreeDWorldNode'",
    );
    expect(registrySource).toContain("threeDWorldNode: ThreeDWorldNode");
    expect(entrySource).toContain("useThreeDWorldNodeController(props)");
    expect(entrySource).toContain(
      "createElement(ThreeDWorldNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("generateCanvasImageTo3d(");
    expect(controllerSource).toContain("uploadDirectorCaptureBundle(");
    expect(controllerSource).toContain("setDirectorWorldSceneSaveHandler(");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<ThreeDDirectorDialog");
    expect(viewSource).toContain("<ThreeDDirectorDialog");
    expect(viewSource).toContain("<NodeGenerationHistory");
    expect(viewSource).toContain("<ThreeDWorldReferenceImageThumb");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("generateCanvasImageTo3d(");
    expect(thumbSource).toContain("useState<");
    expect(thumbSource).toContain("createPortal(");
    expect(thumbSource).not.toContain("useCanvasStore(");
    expect(modelTestSource).toContain("from './threeDWorldNodeModel'");
    expect(captureTestSource).toContain("from './directorCaptureBundle'");
    expect(runtimeTestSource).toContain(
      "from './browserDirectorCaptureRuntime'",
    );
    expect(controllerTestSource).toContain(
      "from './useThreeDWorldNodeController'",
    );
    expect(viewTestSource).toContain("from './ThreeDWorldNodeView'");
  });

  it("separates the Canvas image-generation model, controller, controls, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageGenNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/imageGenNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/imageGenNodeModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageGenNodeController.ts",
    );
    const controlsPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageGenNodeControls.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageGenNodeView.tsx",
    );
    const registryPath = resolve(SRC_ROOT, "features/canvas/nodes/index.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controlsSource = readFileSync(controlsPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "ImageGenNode", "=", "memo("].join(" "),
      ["export function", "isImage2Model("].join(" "),
      ["export function", "useImageGenNodeController("].join(" "),
      ["export function", "AspectSizeChip("].join(" "),
      ["export function", "ImageGenNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useImageGenNodeController",
        "./ImageGenNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/ImageGenNode.tsx"],
      ["features/canvas/application/imageGenNodeModel.ts"],
      ["features/canvas/hooks/useImageGenNodeController.ts"],
      ["features/canvas/nodes/ImageGenNodeControls.tsx"],
      ["features/canvas/nodes/ImageGenNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("window.");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("className=");
    expect(modelTestSource).toContain("from './imageGenNodeModel'");
    expect(registrySource).toContain(
      "import { ImageGenNode } from './ImageGenNode'",
    );
    expect(registrySource).toContain("imageGenNode: ImageGenNode");
    expect(entrySource).toContain("useImageGenNodeController(props)");
    expect(entrySource).toContain(
      "createElement(ImageGenNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("await generateCanvasImage(");
    expect(controllerSource).toContain("translateCanvasText({");
    expect(controllerSource).toContain("getCanvasBeatDirectorManifest({");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<ThreeDDirectorDialog");
    expect(controlsSource).toContain("useState(");
    expect(controlsSource).toContain("createPortal(");
    expect(controlsSource).not.toContain("useCanvasStore(");
    expect(viewSource).toContain("<PromptMentionEditor");
    expect(viewSource).toContain("<NodeGenerationHistory");
    expect(viewSource).toContain("<BackgroundCropperDialog");
    expect(viewSource).toContain("<ThreeDDirectorDialog");
    expect(viewSource).toContain("<AssetLibraryModal");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("generateCanvasImage(");
    expect(viewSource).not.toContain("translateCanvasText(");
    expect(viewSource).not.toContain("uploadCanvasAsset(");
  });

  it("separates the Canvas video node model, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/videoNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/videoNodeModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoNodeController.ts",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoNodeView.tsx",
    );
    const registryPath = resolve(SRC_ROOT, "features/canvas/nodes/index.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "VideoNode", "=", "memo("].join(" "),
      ["export function", "resolveVideoNodeModel<"].join(" "),
      ["export function", "useVideoNodeController("].join(" "),
      ["export function", "VideoNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useVideoNodeController",
        "./VideoNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/VideoNode.tsx"],
      ["features/canvas/application/videoNodeModel.ts"],
      ["features/canvas/hooks/useVideoNodeController.ts"],
      ["features/canvas/nodes/VideoNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("window.");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("className=");
    expect(modelTestSource).toContain("from './videoNodeModel'");
    expect(registrySource).toContain(
      "import { VideoNode } from './VideoNode'",
    );
    expect(registrySource).toContain("videoNode: VideoNode");
    expect(entrySource).toContain("useVideoNodeController(props)");
    expect(entrySource).toContain(
      "createElement(VideoNodeView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("submitVideoGeneration({");
    expect(controllerSource).toContain("translateCanvasText({");
    expect(controllerSource).toContain("uploadCanvasAsset(");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<VideoNodePrimaryVideo");
    expect(viewSource).toContain("<VideoNodePrimaryVideo");
    expect(viewSource).toContain("<PromptMentionEditor");
    expect(viewSource).toContain("<VideoNodeGenerationHistoryPanel");
    expect(viewSource).toContain("<AssetLibraryModal");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("submitVideoGeneration(");
    expect(viewSource).not.toContain("translateCanvasText(");
    expect(viewSource).not.toContain("uploadCanvasAsset(");
  });

  it("separates the Canvas Skill node model, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/SkillNode.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/skillNodeModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/skillNodeModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useSkillNodeController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useSkillNodeController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/SkillNodeView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/SkillNodeView.test.tsx",
    );
    const registryPath = resolve(SRC_ROOT, "features/canvas/nodes/index.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const registrySource = readFileSync(registryPath, "utf8");
    const declarations = [
      ["export const", "SkillNode", "=", "memo("].join(" "),
      ["export function", "skillInputSignature("].join(" "),
      ["export function", "useSkillNodeController("].join(" "),
      ["export function", "SkillNodeView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/hooks/useSkillNodeController",
        "./SkillNodeView",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/SkillNode.tsx"],
      ["features/canvas/application/skillNodeModel.ts"],
      ["features/canvas/hooks/useSkillNodeController.ts"],
      ["features/canvas/nodes/SkillNodeView.tsx"],
    ]);
    expect(modelSource).not.toContain("react");
    expect(modelSource).not.toContain("useCanvasStore");
    expect(modelSource).not.toContain("window.");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("className=");
    expect(registrySource).toContain(
      "import { SkillNode } from './SkillNode'",
    );
    expect(registrySource).toContain("skillNode: SkillNode");
    expect(entrySource).toContain("useSkillNodeController(props)");
    expect(entrySource).toContain("createElement(SkillNodeView, { controller })");
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("useEffect(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasStore(");
    expect(controllerSource).toContain("startCanvasSkillRun({");
    expect(controllerSource).toContain("awaitCanvasSkillRunResult({");
    expect(controllerSource).toContain("getCanvasSceneAssetsForBeat({");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("<ThreeDDirectorDialog");
    expect(viewSource).toContain("<BackgroundCropperDialog");
    expect(viewSource).toContain("<ThreeDDirectorDialog");
    expect(viewSource).toContain("<SkillInputHandle");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useCanvasStore(");
    expect(viewSource).not.toContain("startCanvasSkillRun(");
    expect(modelTestSource).toContain("from './skillNodeModel'");
    expect(controllerTestSource).toContain("from './useSkillNodeController'");
    expect(viewTestSource).toContain("from './SkillNodeView'");
  });

  it("keeps the Beat state read model in Production", () => {
    const publicPath = resolve(SRC_ROOT, "modules/production/public.ts");
    const legacyPaths = [
      resolve(SRC_ROOT, "hooks/use-beat-states.ts"),
      resolve(SRC_ROOT, "lib/derive-beat-states.ts"),
      resolve(SRC_ROOT, "types/beat-state.ts"),
    ];
    const bypasses = sourceFiles(SRC_ROOT)
      .filter((path) => !relativeSource(path).startsWith("__tests__/"))
      .filter(
        (path) =>
          !relativeSource(path).startsWith("modules/production/") &&
          importSpecifiers(path).some(
            (specifier) =>
              specifier.startsWith("@/modules/production/") &&
              specifier !== "@/modules/production/public",
          ),
      )
      .map(relativeSource);

    for (const path of legacyPaths) expect(existsSync(path)).toBe(false);
    expect(importSpecifiers(publicPath)).toContain(
      "@/modules/production/domain/beat-state",
    );
    expect(bypasses).toEqual([]);
  });

  it("keeps task capabilities behind the Task Center public API", () => {
    const legacyQueryPath = resolve(SRC_ROOT, "lib/queries/tasks.ts");
    const legacyMonitorPath = resolve(SRC_ROOT, "api/tasks.ts");
    const publicPath = resolve(SRC_ROOT, "task-center/public.ts");
    const bypasses = sourceFiles(SRC_ROOT)
      .filter((path) => !relativeSource(path).startsWith("__tests__/"))
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier === "@/lib/queries/tasks" ||
              specifier === "@/api/tasks" ||
              specifier === "@/task-center/query-hooks" ||
              specifier === "@/task-center/task-monitor",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      );

    expect(existsSync(legacyQueryPath)).toBe(false);
    expect(existsSync(legacyMonitorPath)).toBe(false);
    expect(importSpecifiers(publicPath)).toContain("./query-hooks");
    expect(importSpecifiers(publicPath)).toContain("./task-monitor");
    expect(bypasses).toEqual([]);
  });

  it("keeps the migrated Story Intake route as an adapter", () => {
    const route = readFileSync(
      resolve(SRC_ROOT, "routes/_app/projects.$project/ingest.tsx"),
      "utf8",
    );

    expect(route).toContain(
      'import { IngestPageContent } from "@/modules/story_intake/public";',
    );
    expect(route).toContain("Route.useParams()");
    expect(route).not.toContain("useState(");
    expect(route).not.toContain("useQuery(");
    expect(route).not.toContain("useMutation(");
  });

  it("keeps the app shell and Project Workspace route as adapters", () => {
    const appRoute = readFileSync(resolve(SRC_ROOT, "routes/_app.tsx"), "utf8");
    const projectRoute = readFileSync(
      resolve(SRC_ROOT, "routes/_app/index.tsx"),
      "utf8",
    );

    expect(appRoute).toContain('import { AppLayout } from "@/app/AppLayout";');
    expect(appRoute).not.toContain("useEffect(");
    expect(appRoute).not.toContain("useState(");
    expect(projectRoute).toContain(
      'import { ProjectDashboardPage } from "@/modules/project_workspace/public";',
    );
    expect(projectRoute).not.toContain("useQuery(");
    expect(projectRoute).not.toContain("useMutation(");
    expect(projectRoute).not.toContain("useState(");
  });

  it("keeps new modules on the declared dependency direction", () => {
    const failures: string[] = [];
    for (const path of sourceFiles(MODULES_ROOT)) {
      const relativePath = relative(MODULES_ROOT, path).replace(/\\/g, "/");
      const [context, layer] = relativePath.split("/");
      if (!context || !["domain", "application", "infrastructure", "presentation"].includes(layer)) {
        continue;
      }

      for (const specifier of importSpecifiers(path)) {
        if (
          layer === "domain" &&
          (specifier === "react" ||
            specifier.startsWith("react/") ||
            specifier === "zustand" ||
            specifier.startsWith("@tanstack/") ||
            specifier.startsWith("@/api/") ||
            specifier.startsWith("@/shared/api/") ||
            specifier.startsWith("@/lib/queries/") ||
            specifier.startsWith("@/stores/"))
        ) {
          failures.push(`${relativePath}: domain imports runtime adapter ${specifier}`);
        }
        if (
          layer === "application" &&
          (specifier === "@/types/api" ||
            specifier === "@/shared/api/transport" ||
            specifier === "@/shared/api/client" ||
            specifier === "@/shared/api/path")
        ) {
          failures.push(`${relativePath}: application imports transport detail ${specifier}`);
        }
        if (layer === "presentation" && isRawDataImport(specifier)) {
          failures.push(`${relativePath}: presentation imports raw data layer ${specifier}`);
        }
        if (!specifier.startsWith("@/modules/")) continue;

        const [, , targetContext, targetLayer] = specifier.split("/");
        if (targetContext !== context) {
          if (specifier !== `@/modules/${targetContext}/public`) {
            failures.push(
              `${relativePath}: cross-module import must use @/modules/${targetContext}/public: ${specifier}`,
            );
          }
          continue;
        }
        if (layer === "domain" && ["application", "infrastructure", "presentation"].includes(targetLayer)) {
          failures.push(`${relativePath}: domain depends on ${targetLayer}: ${specifier}`);
        } else if (layer === "application" && ["infrastructure", "presentation"].includes(targetLayer)) {
          failures.push(`${relativePath}: application depends on ${targetLayer}: ${specifier}`);
        } else if (layer === "infrastructure" && targetLayer === "presentation") {
          failures.push(`${relativePath}: infrastructure depends on presentation: ${specifier}`);
        } else if (layer === "presentation" && targetLayer === "infrastructure") {
          failures.push(`${relativePath}: presentation bypasses application: ${specifier}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps Canvas infrastructure assembly out of application", () => {
    const applicationRoot = resolve(
      SRC_ROOT,
      "features/canvas/application",
    );
    const domainRoot = resolve(SRC_ROOT, "features/canvas/domain");
    const domainApplicationImports = sourceFiles(domainRoot)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier.startsWith("@/features/canvas/application/") ||
              /^(?:\.\.\/)+application(?:\/|$)/.test(specifier),
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();
    const failures = sourceFiles(applicationRoot).flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
            specifier.startsWith("@/features/canvas/infrastructure/") ||
            /^(?:\.\.\/)+composition$/.test(specifier) ||
            specifier === "@/features/canvas/composition",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const directApiUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).some((specifier) => specifier.startsWith("@/api/")),
      )
      .map(relativeSource)
      .sort();
    const directReactFlowUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).some(
          (specifier) =>
            specifier === "@xyflow/react" ||
            specifier.startsWith("@xyflow/react/"),
        ),
      )
      .map(relativeSource)
      .sort();
    const directCanvasStoreUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).includes("@/features/canvas/canvasStore"),
      )
      .map(relativeSource)
      .sort();
    const directUrlUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).includes("@/lib/url-params"),
      )
      .map(relativeSource)
      .sort();
    const directTaskCenterStoreUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).includes("@/task-center/store"),
      )
      .map(relativeSource)
      .sort();
    const directTaskCenterUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).some((specifier) =>
          specifier.startsWith("@/task-center/"),
        ),
      )
      .map(relativeSource)
      .sort();
    const directWindowUsers = sourceFiles(applicationRoot)
      .filter((path) => readFileSync(path, "utf8").includes("window."))
      .map(relativeSource)
      .sort();
    const directNavigatorUsers = sourceFiles(applicationRoot)
      .filter((path) => readFileSync(path, "utf8").includes("navigator."))
      .map(relativeSource)
      .sort();
    const directWorkerUsers = sourceFiles(applicationRoot)
      .filter((path) => readFileSync(path, "utf8").includes("new Worker("))
      .map(relativeSource)
      .sort();
    const directDocumentUsers = sourceFiles(applicationRoot)
      .filter((path) => readFileSync(path, "utf8").includes("document."))
      .map(relativeSource)
      .sort();
    const directImageConstructorUsers = sourceFiles(applicationRoot)
      .filter((path) => readFileSync(path, "utf8").includes("new Image("))
      .map(relativeSource)
      .sort();
    const directFileReaderUsers = sourceFiles(applicationRoot)
      .filter((path) => readFileSync(path, "utf8").includes("new FileReader("))
      .map(relativeSource)
      .sort();
    const directPerformanceUsers = sourceFiles(applicationRoot)
      .filter((path) => readFileSync(path, "utf8").includes("performance.now("))
      .map(relativeSource)
      .sort();
    const directFetchUsers = sourceFiles(applicationRoot)
      .filter((path) => readFileSync(path, "utf8").includes("fetch("))
      .map(relativeSource)
      .sort();
    const directAppFeatureUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).some((specifier) =>
          specifier.startsWith("@/features/app/"),
        ),
      )
      .map(relativeSource)
      .sort();
    const directCommandUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).some((specifier) =>
          specifier.startsWith("@/commands/"),
        ),
      )
      .map(relativeSource)
      .sort();
    const composition = readFileSync(
      resolve(SRC_ROOT, "features/canvas/composition.ts"),
      "utf8",
    );
    const nodeFactoryComposition = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodeFactoryComposition.ts"),
      "utf8",
    );
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const assetGateway = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/freezoneAssetGateway.ts",
      ),
      "utf8",
    );
    const graphGateway = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGraphGateway.ts",
      ),
      "utf8",
    );
    const services = readFileSync(
      resolve(applicationRoot, "canvasServices.ts"),
      "utf8",
    );
    const regenerateExportNode = readFileSync(
      resolve(applicationRoot, "regenerateExportNode.ts"),
      "utf8",
    );
    const resumeGeneration = readFileSync(
      resolve(applicationRoot, "resumeGeneration.ts"),
      "utf8",
    );
    const selectedBackgroundSlot = readFileSync(
      resolve(applicationRoot, "selectedBackgroundSlot.ts"),
      "utf8",
    );
    const uploadToolOutput = readFileSync(
      resolve(applicationRoot, "uploadToolOutput.ts"),
      "utf8",
    );
    const upstreamGraphHook = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useUpstreamGraph.ts"),
      "utf8",
    );
    const nodeGenerationTaskState = readFileSync(
      resolve(applicationRoot, "nodeGenerationTaskState.ts"),
      "utf8",
    );
    const nodeGenerationTaskStateHook = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useNodeGenerationTaskState.ts",
      ),
      "utf8",
    );
    const crossProjectAssets = readFileSync(
      resolve(applicationRoot, "crossProjectAssets.ts"),
      "utf8",
    );
    const generationErrorReport = readFileSync(
      resolve(applicationRoot, "generationErrorReport.ts"),
      "utf8",
    );
    const generationRuntimeGateway = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/browserGenerationRuntimeGateway.ts",
      ),
      "utf8",
    );
    const matteClient = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/matteClient.ts",
      ),
      "utf8",
    );
    const nodeActionToolbar = readFileSync(
      resolve(SRC_ROOT, "features/canvas/ui/NodeActionToolbar.tsx"),
      "utf8",
    );
    const videoTranscode = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/videoTranscode.ts",
      ),
      "utf8",
    );
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const toolProcessor = readFileSync(
      resolve(applicationRoot, "toolProcessor.ts"),
      "utf8",
    );
    const toolImageGateway = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/browserToolImageGateway.ts",
      ),
      "utf8",
    );
    const imageData = readFileSync(
      resolve(applicationRoot, "imageData.ts"),
      "utf8",
    );
    const imagePreparation = readFileSync(
      resolve(applicationRoot, "imagePreparation.ts"),
      "utf8",
    );
    const imageRuntime = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/browserImageRuntime.ts",
      ),
      "utf8",
    );
    const errorDialog = readFileSync(
      resolve(applicationRoot, "errorDialog.ts"),
      "utf8",
    );
    const globalErrorDialog = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/globalErrorDialog.ts",
      ),
      "utf8",
    );

    expect(failures).toEqual([]);
    expect(domainApplicationImports).toEqual([]);
    expect(directApiUsers).toEqual([]);
    expect(directReactFlowUsers).toEqual([]);
    expect(directCanvasStoreUsers).toEqual([]);
    expect(directUrlUsers).toEqual([]);
    expect(directTaskCenterStoreUsers).toEqual([]);
    expect(directTaskCenterUsers).toEqual([]);
    expect(directWindowUsers).toEqual([]);
    expect(directNavigatorUsers).toEqual([]);
    expect(directWorkerUsers).toEqual([]);
    expect(directDocumentUsers).toEqual([]);
    expect(directImageConstructorUsers).toEqual([]);
    expect(directFileReaderUsers).toEqual([]);
    expect(directPerformanceUsers).toEqual([]);
    expect(directFetchUsers).toEqual([]);
    expect(directAppFeatureUsers).toEqual([]);
    expect(directCommandUsers).toEqual([]);
    expect(
      existsSync(resolve(applicationRoot, "useUpstreamGraph.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(applicationRoot, "useNodeGenerationTaskState.ts"),
      ),
    ).toBe(false);
    expect(existsSync(resolve(applicationRoot, "matteClient.ts"))).toBe(false);
    expect(existsSync(resolve(applicationRoot, "matteWorker.ts"))).toBe(false);
    expect(existsSync(resolve(applicationRoot, "videoTranscode.ts"))).toBe(false);
    expect(
      existsSync(resolve(applicationRoot, "videoTranscodeFfmpeg.ts")),
    ).toBe(false);
    expect(composition).toContain(
      "export { canvasNodeFactory } from './nodeFactoryComposition';",
    );
    expect(nodeFactoryComposition).toContain("new CanvasNodeFactory(");
    expect(nodeFactoryComposition).toContain("uuidGenerator");
    expect(nodeFactoryComposition).toContain("nodeCatalog");
    expect(canvasStore).toContain(
      "@/features/canvas/nodeFactoryComposition",
    );
    expect(canvasStore).not.toContain("@/features/canvas/composition");
    expect(composition).toContain("new CanvasToolProcessor(");
    expect(composition).toContain("freezoneAiGateway");
    expect(composition).toContain("browserGenerationRuntimeGateway");
    expect(composition).toContain("getRuntimeDiagnostics()");
    expect(composition).toContain("uuidGenerator");
    expect(composition).toContain("webImageSplitGateway");
    expect(composition).toContain("browserToolImageGateway");
    expect(composition).toContain("browserImageRuntimeGateway");
    expect(composition).toContain("prepareNodeImageUseCase(");
    expect(composition).toContain(
      "export { showErrorDialog } from './infrastructure/globalErrorDialog';",
    );
    expect(composition).toContain("freezoneAssetGateway");
    expect(composition).toContain("migratePastedNodeAssetsUseCase(");
    expect(composition).toContain("currentOrigin: window.location.origin");
    expect(composition).toContain("uploadLocalImageToBackendUseCase(");
    expect(composition).toContain(
      "uploadAndAutoCommitSelectedBackgroundCandidateUseCase(",
    );
    expect(composition).toContain(
      "stageSelectedBackgroundOutputForSkillUseCase(",
    );
    expect(composition).toContain("zustandCanvasGraphGateway");
    expect(composition).toContain("canvasEventBus");
    expect(composition).toContain("regenerateExportImageNodeUseCase(");
    expect(composition).toContain("projectId: readUrl().project");
    expect(composition).toContain("freezoneRedrawTaskGateway");
    expect(composition).toContain("resumeNodeGenerationUseCase(");
    expect(composition).toContain("freezoneGenerationTaskGateway");
    expect(assetGateway).toContain("uploadFreezoneAsset(");
    expect(assetGateway).toContain("@/features/freezone/public");
    expect(assetGateway).not.toContain("@/api/ops");
    expect(assetGateway).toContain("async read(source, options)");
    expect(assetGateway).toContain("dataUrlToBlob(source)");
    expect(assetGateway).toContain("credentials: 'include'");
    expect(graphGateway).toContain("useCanvasStore.getState()");
    expect(services).not.toContain("infrastructure/");
    expect(selectedBackgroundSlot).toContain(
      "graphGateway: CanvasGraphGateway",
    );
    expect(selectedBackgroundSlot).toContain("eventBus: CanvasEventBus");
    expect(uploadToolOutput).toContain(
      "projectId: string | null | undefined",
    );
    expect(uploadToolOutput).toContain("assetSourceGateway.read(trimmed)");
    expect(upstreamGraphHook).toContain("useCanvasStore(");
    expect(upstreamGraphHook).toContain("useShallow(");
    expect(upstreamGraphHook).toContain("upstreamNodesInEdgeOrder(");
    expect(nodeGenerationTaskState).toContain(
      "export function resolveNodeGenerationTaskState(",
    );
    expect(nodeGenerationTaskState).toContain(
      "export interface CanvasNodeGenerationTask",
    );
    expect(nodeGenerationTaskStateHook).toContain("useTaskCenterStore(");
    expect(nodeGenerationTaskStateHook).toContain(
      "resolveNodeGenerationTaskState({",
    );
    expect(crossProjectAssets).toContain("currentOrigin: string");
    expect(crossProjectAssets).toContain("assetSourceGateway.read(fetchUrl");
    expect(generationErrorReport).toContain(
      "export function resolveGenerationOsInfo(",
    );
    expect(generationRuntimeGateway).toContain("navigator.userAgent");
    expect(generationRuntimeGateway).toContain("runtimeSessionId:");
    expect(matteClient).toContain('new URL("./matteWorker.ts"');
    expect(nodeActionToolbar).toContain(
      "@/features/canvas/infrastructure/matteClient",
    );
    expect(videoTranscode).toContain(
      'await import("./videoTranscodeFfmpeg")',
    );
    expect(composition).toContain("ensureWebSafeVideo");
    expect(videoNode).not.toContain(
      "@/features/canvas/infrastructure/videoTranscode",
    );
    expect(toolProcessor).toContain("CanvasToolImageGateway");
    expect(toolProcessor).not.toContain("document.");
    expect(toolProcessor).not.toContain("./imageData");
    expect(toolImageGateway).toContain("document.createElement('canvas')");
    expect(toolImageGateway).toContain("cropImageSource");
    expect(toolImageGateway).toContain("./browserImageRuntime");
    expect(imageData).not.toContain("document.");
    expect(imageData).not.toContain("new Image(");
    expect(imageData).not.toContain("new FileReader(");
    expect(imagePreparation).toContain("CanvasImageRuntimeGateway");
    expect(imagePreparation).toContain("runtime.preparePreview(");
    expect(imageRuntime).toContain("document.createElement('canvas')");
    expect(imageRuntime).toContain("new Image()");
    expect(imageRuntime).toContain("new FileReader()");
    expect(errorDialog).toContain("export function resolveErrorContent(");
    expect(errorDialog).not.toContain("openGlobalErrorDialog");
    expect(globalErrorDialog).toContain("openGlobalErrorDialog({");
    expect(regenerateExportNode).toContain("aiGateway: AiGateway");
    expect(regenerateExportNode).toContain(
      "params: RegenerateExportImageNodeParams",
    );
    expect(regenerateExportNode).toContain(
      "aiGateway.submitGenerateImageJob",
    );
    expect(resumeGeneration).toContain(
      "gateway: CanvasGenerationTaskGateway",
    );
  });

  it("keeps Canvas model defaults in one pure domain owner", () => {
    const defaultsPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/modelDefaults.ts",
    );
    const nodeRegistryPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/nodeRegistry.ts",
    );
    const modelRegistryPath = resolve(
      SRC_ROOT,
      "features/canvas/models/registry.ts",
    );
    const pickerPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/ProviderModelPicker.tsx",
    );
    const defaultNames = [
      "DEFAULT_IMAGE_MODEL_ID",
      "DEFAULT_SHARED_MODEL_ID",
      "DEFAULT_VIDEO_MODEL_ID",
    ];
    const declarationOwners = sourceFiles(
      resolve(SRC_ROOT, "features/canvas"),
    )
      .filter((path) => !path.includes(".test."))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return defaultNames.some((name) =>
          source.includes(`export const ${name}`),
        );
      })
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(defaultsPath)).toEqual([]);
    expect(declarationOwners).toEqual([
      "features/canvas/domain/modelDefaults.ts",
    ]);
    expect(importSpecifiers(nodeRegistryPath)).toContain("./modelDefaults");
    expect(importSpecifiers(nodeRegistryPath)).not.toContain("../models");
    expect(importSpecifiers(nodeRegistryPath)).not.toContain(
      "../ui/ProviderModelPicker",
    );
    expect(importSpecifiers(modelRegistryPath)).toContain(
      "../domain/modelDefaults",
    );
    expect(readFileSync(pickerPath, "utf8")).not.toContain(
      "export const DEFAULT_",
    );
  });

  it("publishes Freezone contracts through one public API", () => {
    const freezoneRoot = resolve(SRC_ROOT, "features/freezone");
    const contractPath = resolve(
      freezoneRoot,
      "domain/skillContract.ts",
    );
    const publicPath = resolve(freezoneRoot, "public.ts");
    const legacyPath = resolve(freezoneRoot, "context/skillRoles.ts");
    const nodeRegistryPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/nodeRegistry.ts",
    );
    const declarationOwners = sourceFiles(freezoneRoot)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "export const SKILL_SCHEMA_VERSION",
        ),
      )
      .map(relativeSource)
      .sort();
    const externalContractImportFailures = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(freezoneRoot))
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier.includes("features/freezone/domain/skillContract") ||
              specifier.includes("features/freezone/domain/skillExecution") ||
              specifier.includes("features/freezone/domain/sceneAssets") ||
              specifier.includes("features/freezone/domain/assetCommit") ||
              specifier.includes("features/freezone/domain/beatContext") ||
              specifier.includes("features/freezone/domain/capabilities/") ||
              specifier.includes("features/freezone/domain/canvasProjection") ||
              specifier.includes("features/freezone/domain/canvasStorage") ||
              specifier.includes("features/freezone/domain/referenceRoles") ||
              specifier.includes("features/freezone/domain/shotMetadata") ||
              specifier.includes("features/freezone/context/skillRoles") ||
              specifier.includes("freezone/context/skillRoles"),
          )
          .map((specifier) => `${relativeSource(path)} -> ${specifier}`),
      );
    const internalPublicConsumers = sourceFiles(freezoneRoot)
      .filter((path) => path !== publicPath && !path.includes(".test."))
      .filter((path) =>
        importSpecifiers(path).includes("@/features/freezone/public"),
      )
      .map(relativeSource)
      .sort();
    const modulePublicBypasses = sourceFiles(MODULES_ROOT)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier.startsWith("@/features/freezone/") &&
              specifier !== "@/features/freezone/public",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(contractPath)).toEqual([]);
    expect(declarationOwners).toEqual([
      "features/freezone/domain/skillContract.ts",
    ]);
    expect(new Set(importSpecifiers(publicPath))).toEqual(
      new Set([
        "@/features/freezone/application/canvasMetadataState",
        "@/features/freezone/application/canvasPreset",
        "@/features/freezone/application/canvasRuntimeState",
        "@/features/freezone/composition",
        "@/features/freezone/openPresetProjectionComposition",
        "@/features/freezone/canvasDraftComposition",
        "@/features/freezone/shotMetadataComposition",
        "@/features/freezone/domain/assetCommit",
        "@/features/freezone/domain/assetUpload",
        "@/features/freezone/domain/beatContext",
        "@/features/freezone/domain/capabilities/contracts",
        "@/features/freezone/domain/capabilities/registry",
        "@/features/freezone/domain/canvasProjection",
        "@/features/freezone/domain/canvasStorage",
        "@/features/freezone/domain/currentBeatContext",
        "@/features/freezone/domain/inferSkillConnectionRole",
        "@/features/freezone/domain/mainlineContext",
        "@/features/freezone/domain/pushTarget",
        "@/features/freezone/domain/referenceRoles",
        "@/features/freezone/domain/skillContract",
        "@/features/freezone/domain/skillExecution",
        "@/features/freezone/domain/sceneAssets",
        "@/features/freezone/domain/skillInputResolution",
        "@/features/freezone/hooks/useCanvasProjectionStatus",
        "@/features/freezone/presentation/NodeContextBadges",
        "@/features/freezone/presentation/skillI18n",
      ]),
    );
    expect(externalContractImportFailures).toEqual([]);
    expect(internalPublicConsumers).toEqual([]);
    expect(modulePublicBypasses).toEqual([]);
    expect(importSpecifiers(nodeRegistryPath)).toContain(
      "@/features/freezone/public",
    );
  });

  it("owns mainline context graph rules in the Freezone domain", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/context/mainlineContext.ts",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/mainlineContext.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasRoot = resolve(SRC_ROOT, "features/canvas");
    const contextRoot = resolve(SRC_ROOT, "features/freezone/context");
    const declarations = [
      "isMainlineContext(",
      "collectNodeMainlineContexts(",
      "collectCandidateBindingsForNode(",
      "validateCandidateBindingRoleCandidate(",
      "validatePropagatingEdgeCandidate(",
    ].map((name) => ["export function", name].join(" "));
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const canvasBypasses = sourceFiles(canvasRoot)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier === "@/features/freezone/context/mainlineContext" ||
              specifier === "@/features/freezone/domain/mainlineContext",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();
    const contextImportFailures = sourceFiles(contextRoot)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier.includes("mainlineContext") &&
              specifier !== "../domain/mainlineContext",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/domain/mainlineContext.ts",
      ]),
    );
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/domain/mainlineContext",
    );
    expect(canvasBypasses).toEqual([]);
    expect(contextImportFailures).toEqual([]);
  });

  it("owns current Beat Context parsing in the Freezone domain", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/context/currentBeatContext.ts",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/currentBeatContext.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/currentBeatContext.test.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const skillInputsPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/skillInputResolution.ts",
    );
    const canvasRoot = resolve(SRC_ROOT, "features/canvas");
    const domainSource = readFileSync(domainPath, "utf8");
    const declarations = [
      "parseBeatContextVisualMarkers(",
      "getCurrentBeatContextFromNode(",
      "currentBeatContextToMainlineContext(",
    ].map((name) => ["export function", name].join(" "));
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const canvasBypasses = sourceFiles(canvasRoot)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier === "@/features/freezone/context/currentBeatContext" ||
              specifier === "@/features/freezone/domain/currentBeatContext" ||
              specifier.endsWith("freezone/context/currentBeatContext.ts"),
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual(["./mainlineContext"]);
    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/domain/currentBeatContext.ts",
      ]),
    );
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("window.");
    expect(domainSource).not.toContain("document.");
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/domain/currentBeatContext",
    );
    expect(importSpecifiers(skillInputsPath)).toContain(
      "./currentBeatContext",
    );
    expect(importSpecifiers(testPath)).toEqual(["vitest", "./currentBeatContext"]);
    expect(canvasBypasses).toEqual([]);
  });

  it("owns Beat Context refresh projection in Canvas application", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/context/beatContextSnapshot.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/beatContextRefreshProjection.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/canvas/application/beatContextRefreshProjection.test.ts",
    );
    const nodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useBeatContextNodeController.ts",
    );
    const declaration = [
      "export function",
      "buildBeatContextNodeRefreshPatch(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const legacyConsumers = sourceFiles(SRC_ROOT)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter((specifier) => specifier.includes("beatContextSnapshot"))
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["@/features/freezone/public", "../domain/canvasNodes"]),
    );
    expect(declarationOwners).toEqual([
      "features/canvas/application/beatContextRefreshProjection.ts",
    ]);
    expect(importSpecifiers(nodePath)).toContain(
      "@/features/canvas/application/beatContextRefreshProjection",
    );
    expect(importSpecifiers(testPath)).toEqual([
      "vitest",
      "./beatContextRefreshProjection",
    ]);
    expect(legacyConsumers).toEqual([]);
  });

  it("owns Beat Context role bindings in the Canvas domain", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/context/beatContextProjection.ts",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/beatContextRoleBindings.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/beatContextRoleBindings.test.ts",
    );
    const nodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useBeatContextNodeController.ts",
    );
    const declaration = [
      "export function",
      "syncBeatContextMainlineEdges(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const legacyConsumers = sourceFiles(SRC_ROOT)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter((specifier) => specifier.includes("beatContextProjection"))
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual(["./canvasNodes"]);
    expect(declarationOwners).toEqual([
      "features/canvas/domain/beatContextRoleBindings.ts",
    ]);
    expect(importSpecifiers(nodePath)).toContain(
      "@/features/canvas/domain/beatContextRoleBindings",
    );
    expect(new Set(importSpecifiers(testPath))).toEqual(
      new Set(["vitest", "./beatContextRoleBindings", "./canvasNodes"]),
    );
    expect(legacyConsumers).toEqual([]);
  });

  it("owns Skill input resolution in the Freezone domain", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/context/skillNodeInputs.ts",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/skillInputResolution.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/skillInputResolution.test.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasRoot = resolve(SRC_ROOT, "features/canvas");
    const declarations = [
      "inputAcceptsNode(",
      "isSkillReadyToSubmit(",
      "resolveInputsForSkill(",
    ].map((name) => ["export function", name].join(" "));
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const canvasBypasses = sourceFiles(canvasRoot)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier === "@/features/freezone/context/skillNodeInputs" ||
              specifier === "@/features/freezone/domain/skillInputResolution" ||
              specifier.endsWith("freezone/context/skillNodeInputs.ts") ||
              specifier.endsWith("freezone/domain/skillInputResolution.ts"),
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(new Set(importSpecifiers(domainPath))).toEqual(
      new Set(["./currentBeatContext", "./skillContract"]),
    );
    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/domain/skillInputResolution.ts",
      ]),
    );
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/domain/skillInputResolution",
    );
    expect(new Set(importSpecifiers(testPath))).toEqual(
      new Set(["vitest", "./skillInputResolution", "./skillContract"]),
    );
    expect(canvasBypasses).toEqual([]);
  });

  it("owns Skill connection role inference in the Freezone domain", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/context/inferSkillConnectionRole.ts",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/inferSkillConnectionRole.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/inferSkillConnectionRole.test.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasConsumerPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/skillConnectionEdges.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const declaration = [
      "export function",
      "inferSkillConnectionRole(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const canvasImports = importSpecifiers(canvasConsumerPath);

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual(["./skillContract"]);
    expect(declarationOwners).toEqual([
      "features/freezone/domain/inferSkillConnectionRole.ts",
    ]);
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("window.");
    expect(domainSource).not.toContain("document.");
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/domain/inferSkillConnectionRole",
    );
    expect(canvasImports).toContain("@/features/freezone/public");
    expect(canvasImports).not.toContain(
      "../../freezone/context/inferSkillConnectionRole.ts",
    );
    expect(canvasImports).not.toContain(
      "@/features/freezone/domain/inferSkillConnectionRole",
    );
    expect(importSpecifiers(testPath)).toEqual([
      "vitest",
      "./inferSkillConnectionRole",
    ]);
  });

  it("owns Skill translations in Freezone presentation", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/context/skillI18n.ts",
    );
    const presentationPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/skillI18n.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/skillI18n.test.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasRoot = resolve(SRC_ROOT, "features/canvas");
    const presentationSource = readFileSync(presentationPath, "utf8");
    const declarations = [
      "translateSkillName(",
      "translateSkillDescription(",
      "translateSkillInputLabel(",
      "translateSkillOutputLabel(",
      "translateSkillParameterLabel(",
      "translateSkillParameterOption(",
      "translateSkillRequirement(",
      "translateSkillCardinality(",
    ].map((name) => ["export function", name].join(" "));
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const canvasBypasses = sourceFiles(canvasRoot)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier === "@/features/freezone/context/skillI18n" ||
              specifier === "@/features/freezone/presentation/skillI18n",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(new Set(importSpecifiers(presentationPath))).toEqual(
      new Set(["i18next", "../domain/skillContract"]),
    );
    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/skillI18n.ts",
      ]),
    );
    expect(presentationSource).not.toContain("react");
    expect(presentationSource).not.toContain("window.");
    expect(presentationSource).not.toContain("document.");
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/presentation/skillI18n",
    );
    expect(new Set(importSpecifiers(testPath))).toEqual(
      new Set(["vitest", "./skillI18n", "../domain/skillContract"]),
    );
    expect(canvasBypasses).toEqual([]);
  });

  it("owns mainline context badges in Freezone presentation", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/context/NodeContextBadges.tsx",
    );
    const presentationPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/NodeContextBadges.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/NodeContextBadges.test.tsx",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasRoot = resolve(SRC_ROOT, "features/canvas");
    const colorTestPath = resolve(
      SRC_ROOT,
      "__tests__/architecture/ui-color-literals.test.ts",
    );
    const assetDragTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/canvas/asset-drag-director-bundle.test.ts",
    );
    const declarations = [
      "validMainlineContexts(",
      "hasMainlineContexts(",
      "NodeContextBadges(",
      "CandidateBindingBadges(",
    ].map((name) => ["export function", name].join(" "));
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const canvasBypasses = sourceFiles(canvasRoot)
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier === "@/features/freezone/context/NodeContextBadges" ||
              specifier === "@/features/freezone/presentation/NodeContextBadges",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();
    const colorTestSource = readFileSync(colorTestPath, "utf8");
    const assetDragTestSource = readFileSync(assetDragTestPath, "utf8");

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(presentationPath)).toEqual([
      "../domain/mainlineContext",
    ]);
    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/NodeContextBadges.tsx",
      ]),
    );
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/presentation/NodeContextBadges",
    );
    expect(new Set(importSpecifiers(testPath))).toEqual(
      new Set(["@testing-library/react", "vitest", "./NodeContextBadges"]),
    );
    expect(canvasBypasses).toEqual([]);
    expect(colorTestSource).toContain(
      '"features/freezone/presentation/NodeContextBadges.tsx": 0',
    );
    expect(colorTestSource).not.toContain(
      '"features/freezone/context/NodeContextBadges.tsx": 0',
    );
    expect(assetDragTestSource).toContain(
      "src/features/freezone/presentation/NodeContextBadges.tsx",
    );
  });

  it("separates shot metadata rules, state, and cross-context composition", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/shotMetadataStore.ts",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/shotMetadata.ts",
    );
    const statePath = resolve(
      SRC_ROOT,
      "features/freezone/application/shotMetadataState.ts",
    );
    const storePath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/zustandShotMetadataStore.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/shotMetadataComposition.ts",
    );
    const gatewayPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAiGateway.ts",
    );
    const gatewayImports = importSpecifiers(gatewayPath);

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(importSpecifiers(statePath)).toEqual([
      "../domain/shotMetadata",
    ]);
    expect(new Set(importSpecifiers(storePath))).toEqual(
      new Set([
        "zustand",
        "../application/shotMetadataState",
        "../domain/shotMetadata",
      ]),
    );
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "./domain/shotMetadata",
        "./infrastructure/zustandShotMetadataStore",
      ]),
    );
    expect(gatewayImports).toContain("@/features/freezone/public");
    expect(gatewayImports).not.toContain(
      "@/features/freezone/domain/shotMetadata",
    );
    expect(gatewayImports).not.toContain(
      "@/features/freezone/infrastructure/zustandShotMetadataStore",
    );
    expect(readFileSync(domainPath, "utf8")).not.toContain("zustand");
    expect(readFileSync(domainPath, "utf8")).not.toContain("react");
    expect(readFileSync(compositionPath, "utf8")).toContain(
      "resolveCurrentShotMetadataPrompt(",
    );
  });

  it("publishes one high-level reference role prompt rule", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/referenceRoles.ts",
    );
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/referenceRoles.ts",
    );
    const gatewayPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAiGateway.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const gatewayImports = importSpecifiers(gatewayPath);

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export function resolvePromptReferenceRoles(",
    );
    expect(domainSource).not.toContain(
      "export function parseReferenceRoles(",
    );
    expect(domainSource).not.toContain(
      "export function reorderReferencesByRole(",
    );
    expect(domainSource).not.toContain(
      "export function renderReferenceRolesForPrompt(",
    );
    expect(gatewayImports).toContain("@/features/freezone/public");
    expect(gatewayImports).not.toContain(
      "@/features/freezone/referenceRoles",
    );
    expect(gatewayImports).not.toContain(
      "@/features/freezone/domain/referenceRoles",
    );
  });

  it("keeps canvas metadata state writable only inside Freezone", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasMetadataContext.ts",
    );
    const statePath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasMetadataState.ts",
    );
    const readerPaths = [
      "features/canvas/infrastructure/freezoneAiGateway.ts",
      "features/canvas/hooks/useBeatContextNodeController.ts",
      "features/canvas/hooks/useImageGenNodeController.ts",
      "features/canvas/hooks/usePano360ViewerNodeController.ts",
    ].map((path) => resolve(SRC_ROOT, path));
    const getterDeclaration = [
      "export function",
      "getFreezoneCanvasMetadata(",
    ].join(" ");
    const getterOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(getterDeclaration))
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(statePath)).toEqual([]);
    expect(getterOwners).toEqual([
      "features/freezone/application/canvasMetadataState.ts",
    ]);
    for (const readerPath of readerPaths) {
      const imports = importSpecifiers(readerPath);
      expect(imports).toContain("@/features/freezone/public");
      expect(imports).not.toContain(
        "@/features/freezone/canvasMetadataContext",
      );
      expect(imports).not.toContain(
        "@/features/freezone/application/canvasMetadataState",
      );
    }
  });

  it("separates generation capability contracts from the registry", () => {
    const contractsPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/capabilities/contracts.ts",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/capabilities/registry.ts",
    );
    const implementationPaths = [
      "candidateCapabilities.ts",
      "portraitFromRef.ts",
      "realSceneSketchRepair.ts",
    ].map((name) =>
      resolve(SRC_ROOT, "features/freezone/domain/capabilities", name),
    );
    const legacyPaths = [
      "capabilityRegistry.ts",
      "candidate_capabilities.ts",
      "portrait_from_ref.ts",
      "real_scene_sketch_repair.ts",
    ].map((name) =>
      resolve(SRC_ROOT, "features/freezone/capabilities", name),
    );
    const canvasConsumerPaths = [
      "features/canvas/infrastructure/freezoneAiGateway.ts",
      "features/canvas/application/imageEditNodeModel.ts",
      "features/canvas/hooks/useImageEditNodeController.ts",
      "features/canvas/nodes/ImageEditNodeView.tsx",
    ].map((path) => resolve(SRC_ROOT, path));

    expect(legacyPaths.every((path) => !existsSync(path))).toBe(true);
    expect(importSpecifiers(contractsPath)).toEqual([]);
    expect(new Set(importSpecifiers(registryPath))).toEqual(
      new Set([
        "./candidateCapabilities",
        "./contracts",
        "./portraitFromRef",
        "./realSceneSketchRepair",
      ]),
    );
    for (const implementationPath of implementationPaths) {
      expect(importSpecifiers(implementationPath)).toEqual(["./contracts"]);
      expect(readFileSync(implementationPath, "utf8")).not.toContain(
        "./registry",
      );
    }
    for (const consumerPath of canvasConsumerPaths) {
      const imports = importSpecifiers(consumerPath);
      expect(imports).toContain("@/features/freezone/public");
      expect(
        imports.some((specifier) =>
          specifier.startsWith("@/features/freezone/capabilities/"),
        ),
      ).toBe(false);
      expect(
        imports.some((specifier) =>
          specifier.startsWith("@/features/freezone/domain/capabilities/"),
        ),
      ).toBe(false);
    }
  });

  it("publishes shared Canvas helpers through one public API", () => {
    const canvasRoot = resolve(SRC_ROOT, "features/canvas");
    const publicPath = resolve(canvasRoot, "public.ts");
    const imageDataPath = resolve(canvasRoot, "application/imageData.ts");
    const eligibilityPath = resolve(
      canvasRoot,
      "domain/canvasCommitEligibility.ts",
    );
    const eligibilityTestPath = resolve(
      canvasRoot,
      "domain/canvasCommitEligibility.test.ts",
    );
    const legacyEligibilityPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/commitEligibility.ts",
    );
    const commitControllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasCommitController.ts",
    );
    const viewerKitRoot = resolve(SRC_ROOT, "features/viewer-kit");
    const externalRoots = [MODULES_ROOT, viewerKitRoot];
    const bypasses = externalRoots
      .flatMap((root) => sourceFiles(root))
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier.startsWith("@/features/canvas/") &&
              specifier !== "@/features/canvas/public",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();
    const publicSource = readFileSync(publicPath, "utf8");
    const eligibilityDeclaration = [
      "export function",
      "isCommitCandidateData(",
    ].join(" ");
    const eligibilityOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(eligibilityDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(publicPath)).toEqual([
      "@/features/canvas/application/imageData",
      "@/features/canvas/domain/canvasCommitEligibility",
      "@/features/canvas/pricing/types",
    ]);
    expect(publicSource).toContain("dataUrlToBlob,");
    expect(publicSource).toContain("withImageCacheBust,");
    expect(publicSource).toContain("DEFAULT_GRSAI_CREDIT_TIER_ID,");
    expect(publicSource).toContain("PRICE_DISPLAY_CURRENCY_MODES,");
    expect(publicSource).toContain("isCommitCandidateData");
    expect(readFileSync(imageDataPath, "utf8")).toContain(
      "export function dataUrlToBlob(",
    );
    expect(readFileSync(imageDataPath, "utf8")).toContain(
      "export function withImageCacheBust(",
    );
    expect(existsSync(legacyEligibilityPath)).toBe(false);
    expect(importSpecifiers(eligibilityPath)).toEqual([
      "@/features/freezone/public",
    ]);
    expect(eligibilityOwners).toEqual([
      "features/canvas/domain/canvasCommitEligibility.ts",
    ]);
    expect(importSpecifiers(eligibilityTestPath)).toEqual([
      "vitest",
      "./canvasCommitEligibility",
    ]);
    expect(importSpecifiers(commitControllerPath)).toContain(
      "@/features/canvas/public",
    );
    expect(importSpecifiers(commitControllerPath)).not.toContain(
      "../commit/commitEligibility",
    );
    expect(bypasses).toEqual([]);
  });

  it("installs Freezone storage recovery from the application bootstrap", () => {
    const bootstrapPath = resolve(SRC_ROOT, "app/bootstrap.tsx");
    const settingsPath = resolve(SRC_ROOT, "stores/settingsStore.ts");
    const legacyDraftStoragePath = resolve(
      SRC_ROOT,
      "features/freezone/canvasDraftStorage.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasDraftComposition.ts",
    );
    const draftStoragePath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/browserCanvasDraftStorageGateway.ts",
    );
    const bootstrap = readFileSync(bootstrapPath, "utf8");
    const settings = readFileSync(settingsPath, "utf8");
    const composition = readFileSync(compositionPath, "utf8");
    const draftStorage = readFileSync(draftStoragePath, "utf8");

    expect(existsSync(legacyDraftStoragePath)).toBe(false);
    expect(importSpecifiers(bootstrapPath)).toContain(
      "@/features/freezone/public",
    );
    expect(bootstrap).toContain("installFreezoneCanvasStorageReclaimer();");
    expect(importSpecifiers(settingsPath)).toContain("@/features/canvas/public");
    expect(settings).not.toContain("@/features/freezone/canvasDraftStorage");
    expect(settings).not.toContain("@/features/canvas/pricing/types");
    expect(composition).toContain(
      "export function installFreezoneCanvasStorageReclaimer()",
    );
    expect(composition).toContain(
      "return installBrowserCanvasStorageReclaimer();",
    );
    expect(draftStorage).toContain(
      "return registerStorageReclaimer(pruneFreezoneCanvasStorage);",
    );
    expect(draftStorage).not.toContain("registerStorageReclaimer(() =>");
    expect(draftStorage).not.toContain("pruneOldCanvasDrafts");
  });

  it("owns the Canvas Store inside Creative Canvas", () => {
    const storePath = resolve(SRC_ROOT, "features/canvas/canvasStore.ts");
    const legacyStorePath = resolve(SRC_ROOT, "stores/canvasStore.ts");
    const declaration = "export const useCanvasStore = create<CanvasState>";
    const owners = sourceFiles(SRC_ROOT)
      .filter((path) => !relativeSource(path).startsWith("__tests__/"))
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const legacyImports = sourceFiles(SRC_ROOT)
      .filter((path) =>
        importSpecifiers(path).includes("@/stores/canvasStore"),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(storePath)).toBe(true);
    expect(existsSync(legacyStorePath)).toBe(false);
    expect(owners).toEqual(["features/canvas/canvasStore.ts"]);
    expect(legacyImports).toEqual([]);
  });

  it("separates Canvas asset-drop rules from interaction state", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/assetDropInfo.ts",
    );
    const storePath = resolve(SRC_ROOT, "features/canvas/assetDropStore.ts");
    const legacyPath = resolve(SRC_ROOT, "stores/assetDropStore.ts");
    const declarations = [
      ["export function", "deriveNodeDropInfo("].join(" "),
      ["export function", "modelSourceUrlFromNodeData("].join(" "),
      ["export const", "useAssetDropStore = create<"].join(" "),
    ];
    const owners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => !relativeSource(path).startsWith("__tests__/"))
        .filter((path) => !path.includes(".test."))
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const legacyImports = sourceFiles(SRC_ROOT)
      .filter((path) =>
        importSpecifiers(path).includes("@/stores/assetDropStore"),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual(["./canvasNodes"]);
    expect(new Set(importSpecifiers(storePath))).toEqual(
      new Set(["zustand", "./domain/assetDropInfo"]),
    );
    expect(owners).toEqual([
      ["features/canvas/domain/assetDropInfo.ts"],
      ["features/canvas/domain/assetDropInfo.ts"],
      ["features/canvas/assetDropStore.ts"],
    ]);
    expect(legacyImports).toEqual([]);
  });

  it("keeps Freezone canvas and Beat Context transport behind application ports", () => {
    const canvasContractPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/canvasStorage.ts",
    );
    const beatContextContractPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/beatContext.ts",
    );
    const canvasApplicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/freezoneCanvasStorage.ts",
    );
    const canvasInfrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneCanvasStorageGateway.ts",
    );
    const freezoneApplicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/contextQueries.ts",
    );
    const freezoneInfrastructurePath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/httpFreezoneContextQueryGateway.ts",
    );
    const canvasCompositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const freezoneCompositionPath = resolve(
      SRC_ROOT,
      "features/freezone/composition.ts",
    );
    const beatContextNodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useBeatContextNodeController.ts",
    );
    const apiCanvasPath = resolve(SRC_ROOT, "api/canvas.ts");
    const apiProjectsPath = resolve(SRC_ROOT, "api/projects.ts");
    const legacyQueryPath = resolve(SRC_ROOT, "lib/queries/freezone.ts");
    const canvasCompositionSource = readFileSync(canvasCompositionPath, "utf8");
    const freezoneCompositionSource = readFileSync(freezoneCompositionPath, "utf8");
    const beatContextNodeSource = readFileSync(beatContextNodePath, "utf8");
    const presetEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("freezone/canvases:from-preset"),
      )
      .map(relativeSource)
      .sort();
    const beatContextEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("freezone/assets/beat-context"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(canvasContractPath)).toEqual([]);
    expect(new Set(importSpecifiers(beatContextContractPath))).toEqual(
      new Set(["./assetCommit", "./mainlineContext"]),
    );
    expect(new Set(importSpecifiers(canvasApplicationPath))).toEqual(
      new Set([
        "@/features/freezone/public",
        "./ports",
      ]),
    );
    expect(new Set(importSpecifiers(canvasInfrastructurePath))).toEqual(
      new Set([
        "@/features/freezone/public",
        "@/shared/api/client",
        "../application/freezoneCanvasStorage",
      ]),
    );
    expect(importSpecifiers(freezoneApplicationPath)).toEqual([
      "../domain/beatContext",
    ]);
    expect(new Set(importSpecifiers(freezoneInfrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/contextQueries",
        "../domain/beatContext",
      ]),
    );
    expect(presetEndpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneCanvasStorageGateway.ts",
    ]);
    expect(beatContextEndpointOwners).toEqual([
      "features/freezone/infrastructure/httpFreezoneContextQueryGateway.ts",
    ]);
    expect(existsSync(apiCanvasPath)).toBe(false);
    expect(existsSync(apiProjectsPath)).toBe(false);
    expect(existsSync(legacyQueryPath)).toBe(false);
    expect(importSpecifiers(beatContextNodePath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(beatContextNodePath)).toContain(
      "@/features/freezone/public",
    );
    expect(importSpecifiers(beatContextNodePath)).toContain(
      "@/modules/narrative_planning/public",
    );
    expect(beatContextNodeSource).not.toContain("@/api/canvas");
    expect(beatContextNodeSource).not.toContain("@/api/projects");
    expect(canvasCompositionSource).toContain("freezoneCanvasStorageGateway");
    expect(freezoneCompositionSource).toContain(
      "httpFreezoneContextQueryGateway",
    );
  });

  it("keeps Freezone React Query adapters in presentation hooks", () => {
    const legacyQueryPath = resolve(SRC_ROOT, "lib/queries/freezone.ts");
    const legacyCanvasQueryHooksPath = resolve(
      SRC_ROOT,
      "features/canvas/application/freezoneCanvasQueryHooks.ts",
    );
    const legacyContextQueryHooksPath = resolve(
      SRC_ROOT,
      "features/freezone/application/contextQueryHooks.ts",
    );
    const canvasQueryHooksPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/freezoneCanvasQueryHooks.ts",
    );
    const contextQueryHooksPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/contextQueryHooks.ts",
    );
    const canvasCompositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const freezoneCompositionPath = resolve(
      SRC_ROOT,
      "features/freezone/composition.ts",
    );
    const freezonePublicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasesTabPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CanvasesTab.tsx",
    );
    const canvasBrowserControllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasBrowserController.ts",
    );
    const assetLibraryControllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useAssetLibraryCatalogController.ts",
    );
    const assetLibraryPanelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.tsx",
    );
    const declarations = [
      ["export function", "createFreezoneCanvasQueryHooks("].join(" "),
      ["export function", "createFreezoneContextQueryHooks("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => !path.includes(".test."))
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const legacyConsumers = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        importSpecifiers(path).includes("@/lib/queries/freezone"),
      )
      .map(relativeSource)
      .sort();
    const applicationReactQueryUsers = [
      ...sourceFiles(resolve(SRC_ROOT, "features/canvas/application")),
      ...sourceFiles(resolve(SRC_ROOT, "features/freezone/application")),
    ]
      .flatMap((path) =>
        importSpecifiers(path)
          .filter((specifier) => specifier.startsWith("@tanstack/react-query"))
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      )
      .sort();
    const canvasCompositionSource = readFileSync(canvasCompositionPath, "utf8");
    const freezoneCompositionSource = readFileSync(freezoneCompositionPath, "utf8");
    const freezonePublicSource = readFileSync(freezonePublicPath, "utf8");

    expect(existsSync(legacyQueryPath)).toBe(false);
    expect(existsSync(legacyCanvasQueryHooksPath)).toBe(false);
    expect(existsSync(legacyContextQueryHooksPath)).toBe(false);
    expect(new Set(importSpecifiers(canvasQueryHooksPath))).toEqual(
      new Set([
        "@tanstack/react-query",
        "@/lib/query-keys",
        "../application/freezoneCanvasStorage",
      ]),
    );
    expect(new Set(importSpecifiers(contextQueryHooksPath))).toEqual(
      new Set([
        "@tanstack/react-query",
        "@/lib/query-keys",
        "../application/contextQueries",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/hooks/freezoneCanvasQueryHooks.ts"],
      ["features/freezone/hooks/contextQueryHooks.ts"],
    ]);
    expect(legacyConsumers).toEqual([]);
    expect(applicationReactQueryUsers).toEqual([]);
    expect(importSpecifiers(canvasBrowserControllerPath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(canvasesTabPath)).toContain(
      "../hooks/useCanvasBrowserController",
    );
    expect(importSpecifiers(canvasesTabPath)).not.toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(assetLibraryControllerPath)).toContain(
      "@/features/freezone/composition",
    );
    expect(importSpecifiers(assetLibraryControllerPath)).not.toContain(
      "@/features/freezone/public",
    );
    expect(importSpecifiers(assetLibraryPanelPath)).not.toContain(
      "@/features/freezone/composition",
    );
    expect(importSpecifiers(assetLibraryPanelPath)).not.toContain(
      "@/features/freezone/public",
    );
    expect(canvasCompositionSource).toContain("createFreezoneCanvasQueryHooks(");
    expect(canvasCompositionSource).toContain("freezoneCanvasStorageGateway,");
    expect(freezoneCompositionSource).toContain(
      "createFreezoneContextQueryHooks(httpFreezoneContextQueryGateway)",
    );
    expect(freezonePublicSource).toContain("useFreezoneBeatContext,");
    expect(freezonePublicSource).toContain("useFreezoneProjectAssets,");
  });

  it("does not retain an unreachable frontend Freezone bootstrap client", () => {
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) => readFileSync(path, "utf8").includes("freezone/init"))
      .map(relativeSource)
      .sort();

    expect(endpointOwners).toEqual([]);
  });

  it("does not retain unreachable frontend Freezone operation clients", () => {
    const opsPath = resolve(SRC_ROOT, "api/ops.ts");
    const retiredEndpointOwners = [
      "freezone/sketch-from-context",
      "freezone/frame-from-context",
      "freezone/extract-frames",
      "freezone/analyze-shots",
    ].map((fragment) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => !path.includes(".test."))
        .filter((path) => readFileSync(path, "utf8").includes(fragment))
        .map(relativeSource)
        .sort(),
    );
    const scenePanoEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("/pano/generate-async"),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(opsPath)).toBe(false);
    expect(retiredEndpointOwners).toEqual([[], [], [], []]);
    expect(scenePanoEndpointOwners).toEqual([
      "modules/asset_world/infrastructure/http-scene-gateway.ts",
    ]);
  });

  it("keeps retired pipeline import code out of the Freezone boundary", () => {
    const legacyRoot = resolve(SRC_ROOT, "pipeline-import");
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneShellView.tsx",
    );
    const dialogs = [
      ["CompareDialog", "features/freezone/presentation/CompareDialog.tsx"],
      [
        "CreateIdentityDialog",
        "features/freezone/presentation/CreateIdentityDialog.tsx",
      ],
      ["MaskEditor", "features/freezone/presentation/MaskEditor.tsx"],
    ] as const;
    const declarationOwners = dialogs.map(([name]) =>
      sourceFiles(SRC_ROOT)
        .filter((path) =>
          readFileSync(path, "utf8").includes(`export function ${name}(`),
        )
        .map(relativeSource)
        .sort(),
    );
    const legacyImports = sourceFiles(SRC_ROOT).flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "@/pipeline-import" ||
            specifier.startsWith("@/pipeline-import/"),
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const shellImports = importSpecifiers(shellPath);

    expect(existsSync(legacyRoot)).toBe(false);
    expect(legacyImports).toEqual([]);
    expect(declarationOwners).toEqual(
      dialogs.map(([, path]) => [path]),
    );
    for (const [name] of dialogs) {
      expect(shellImports).toContain(`./${name}`);
    }
  });

  it("keeps Freezone asset upload behind one application gateway", () => {
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/assetUpload.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/httpFreezoneAssetUploadGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/composition.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasGatewayPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAssetGateway.ts",
    );
    const aiGatewayPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAiGateway.ts",
    );
    const propGatewayPath = resolve(
      SRC_ROOT,
      "modules/asset_world/infrastructure/http-prop-gateway.ts",
    );
    const pipelineConsumerPaths = [
      "features/freezone/presentation/MaskEditor.tsx",
    ].map((path) => resolve(SRC_ROOT, path));
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const canvasGatewaySource = readFileSync(canvasGatewayPath, "utf8");
    const propGatewaySource = readFileSync(propGatewayPath, "utf8");
    const uploadEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/upload`"),
      )
      .map(relativeSource)
      .sort();
    const helperDeclarations = [
      ["export async function", "ensureBackendImageUrl("].join(" "),
      ["export async function", "ensureBackendImageUrls("].join(" "),
    ];
    const helperOwners = helperDeclarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => !path.includes(".test."))
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(applicationPath)).toEqual([
      "../domain/assetUpload",
    ]);
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/assetUpload",
        "../domain/assetUpload",
      ]),
    );
    expect(uploadEndpointOwners).toEqual([
      "features/freezone/infrastructure/httpFreezoneAssetUploadGateway.ts",
    ]);
    expect(infrastructureSource).toContain('method: "POST"');
    expect(infrastructureSource).toContain(
      "params.options?.disableTimeout ? false : undefined",
    );
    expect(compositionSource).toContain("uploadFreezoneAssetUseCase(");
    expect(compositionSource).toContain("httpFreezoneAssetUploadGateway");
    expect(publicSource).toContain("uploadFreezoneAsset,");
    expect(publicSource).toContain("FreezoneAssetUploadResult,");
    expect(helperOwners).toEqual(
      helperDeclarations.map(() => [
        "features/canvas/infrastructure/freezoneAssetGateway.ts",
      ]),
    );
    expect(importSpecifiers(canvasGatewayPath)).toContain(
      "@/features/freezone/public",
    );
    expect(importSpecifiers(canvasGatewayPath)).not.toContain("@/api/ops");
    expect(canvasGatewaySource).toContain("uploadFreezoneAsset(");
    expect(importSpecifiers(propGatewayPath)).toContain(
      "@/features/freezone/public",
    );
    expect(propGatewaySource).toContain("uploadFreezoneAsset(");
    expect(propGatewaySource).not.toContain("}/freezone/upload`");
    expect(importSpecifiers(aiGatewayPath)).toContain(
      "./freezoneAssetGateway",
    );
    expect(importSpecifiers(legacyOpsPath)).not.toContain(
      "@/features/canvas/infrastructure/freezoneAssetGateway",
    );
    expect(legacyOpsSource).not.toContain("FreezoneUploadResult");
    expect(legacyOpsSource).not.toContain("FreezoneUploadOptions");
    expect(legacyOpsSource).not.toContain("uploadFreezoneImage");
    expect(legacyOpsSource).not.toContain("uploadFreezoneVideo");
    expect(legacyOpsSource).not.toContain("}/freezone/upload`");
    for (const consumerPath of pipelineConsumerPaths) {
      const source = readFileSync(consumerPath, "utf8");
      expect(importSpecifiers(consumerPath)).toContain(
        "@/features/canvas/composition",
      );
      expect(source).toContain("uploadCanvasAsset(");
      expect(source).not.toContain("uploadFreezoneImage");
    }
  });

  it("keeps all non-projection canvas persistence behind the Canvas composition", () => {
    const apiCanvasPath = resolve(SRC_ROOT, "api/canvas.ts");
    const canvasContractPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/canvasStorage.ts",
    );
    const removedDebugPanelPath = resolve(
      SRC_ROOT,
      "features/freezone/CanvasDebugPanel.tsx",
    );
    const canvasApplicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/freezoneCanvasStorage.ts",
    );
    const canvasInfrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneCanvasStorageGateway.ts",
    );
    const canvasCompositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasContractSource = readFileSync(canvasContractPath, "utf8");
    const canvasApplicationSource = readFileSync(canvasApplicationPath, "utf8");
    const canvasInfrastructureSource = readFileSync(
      canvasInfrastructurePath,
      "utf8",
    );
    const canvasCompositionSource = readFileSync(canvasCompositionPath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const directCanvasApiConsumers = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) => importSpecifiers(path).includes("@/api/canvas"))
      .map(relativeSource)
      .sort();
    const migratedConsumerPaths = [
      "features/freezone/hooks/useCanvasBrowserController.ts",
    ];
    const canvasesTabPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CanvasesTab.tsx",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const saveControllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSaveController.ts",
    );
    const hydrationLifecyclePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
    );
    const presetRefreshControllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasPresetRefreshController.ts",
    );
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const removedHistoryClientSymbols = [
      "FreezoneCanvasHistoryEntry",
      "FreezoneCanvasRestoreRequest",
      "extractHistoryId",
      "listFreezoneCanvasHistory",
      "restoreFreezoneCanvasVersion",
    ];

    expect(existsSync(apiCanvasPath)).toBe(false);
    expect(existsSync(removedDebugPanelPath)).toBe(false);
    expect(importSpecifiers(canvasContractPath)).toEqual([]);
    expect(directCanvasApiConsumers).toEqual([]);
    for (const consumerPath of migratedConsumerPaths) {
      const source = readFileSync(resolve(SRC_ROOT, consumerPath), "utf8");
      expect(source).not.toContain("@/api/canvas");
      expect(source).toContain("@/features/canvas/composition");
    }
    expect(importSpecifiers(canvasesTabPath)).toContain(
      "../hooks/useCanvasBrowserController",
    );
    expect(importSpecifiers(canvasesTabPath)).not.toContain(
      "@/features/canvas/composition",
    );
    expect(syncHookSource).not.toContain("@/api/canvas");
    expect(syncHookSource).not.toContain("@/features/canvas/composition");
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasSaveController",
    );
    expect(importSpecifiers(saveControllerPath)).toContain(
      "../canvasSaveComposition",
    );
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasHydrationLifecycle",
    );
    expect(importSpecifiers(hydrationLifecyclePath)).toContain(
      "../canvasHydrationComposition",
    );
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasPresetRefreshController",
    );
    expect(importSpecifiers(presetRefreshControllerPath)).toContain(
      "../canvasPresetRefreshComposition",
    );
    expect(canvasApplicationSource).toContain("idGenerator.next()");
    expect(canvasApplicationSource).not.toContain("@/shared/api/");
    expect(canvasInfrastructureSource).toContain('method: "PUT"');
    expect(canvasInfrastructureSource).toContain('method: "DELETE"');
    expect(canvasCompositionSource).toContain(
      "generateClientSaveIdUseCase(uuidGenerator)",
    );
    for (const source of [
      canvasContractSource,
      canvasApplicationSource,
      canvasInfrastructureSource,
      canvasCompositionSource,
      publicSource,
    ]) {
      for (const symbol of removedHistoryClientSymbols) {
        expect(source).not.toContain(symbol);
      }
    }
    expect(canvasInfrastructureSource).not.toContain("/history");
    expect(canvasInfrastructureSource).not.toContain("/restore");
  });

  it("keeps Freezone canvas projection behind one application gateway", () => {
    const legacyApiPath = resolve(SRC_ROOT, "api/canvas.ts");
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/canvasProjection.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasProjection.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/httpFreezoneCanvasProjectionGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/composition.ts",
    );
    const compositionSource = readFileSync(compositionPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const buildEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "freezone/projections:build-from-preset",
        ),
      )
      .map(relativeSource)
      .sort();
    const statusEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("/projections:status"),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyApiPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual(["./canvasStorage"]);
    expect(importSpecifiers(applicationPath)).toEqual([
      "../domain/canvasProjection",
    ]);
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/canvasProjection",
        "../domain/canvasProjection",
      ]),
    );
    expect(buildEndpointOwners).toEqual([
      "features/freezone/infrastructure/httpFreezoneCanvasProjectionGateway.ts",
    ]);
    expect(statusEndpointOwners).toEqual([
      "features/freezone/infrastructure/httpFreezoneCanvasProjectionGateway.ts",
    ]);
    const commandControllerImports = importSpecifiers(
      resolve(
        SRC_ROOT,
        "features/freezone/hooks/useCanvasProjectionCommandController.ts",
      ),
    );
    const projectionRequestImports = importSpecifiers(
      resolve(
        SRC_ROOT,
        "features/freezone/domain/canvasProjectionRequest.ts",
      ),
    );
    const projectionMetadataImports = importSpecifiers(
      resolve(
        SRC_ROOT,
        "features/freezone/domain/canvasProjectionMetadata.ts",
      ),
    );
    const projectionGraphImports = importSpecifiers(
      resolve(
        SRC_ROOT,
        "features/freezone/application/canvasProjectionGraph.ts",
      ),
    );
    const projectionGraphIdImports = importSpecifiers(
      resolve(
        SRC_ROOT,
        "features/canvas/domain/projectionGraphIds.ts",
      ),
    );
    const openProjectionImports = importSpecifiers(
      resolve(
        SRC_ROOT,
        "features/freezone/application/openPresetProjection.ts",
      ),
    );
    const statusStateImports = importSpecifiers(
      resolve(
        SRC_ROOT,
        "features/freezone/application/canvasProjectionStatusState.ts",
      ),
    );
    expect(commandControllerImports).toContain("../composition");
    expect(projectionRequestImports).toEqual(["./canvasStorage"]);
    expect(new Set(projectionMetadataImports)).toEqual(
      new Set(["./canvasProjectionRequest", "./canvasStorage"]),
    );
    expect(new Set(projectionGraphImports)).toEqual(
      new Set([
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/domain/projectionGraphIds",
      ]),
    );
    expect(projectionGraphIdImports).toEqual(["./canvasNodes"]);
    expect(
      existsSync(resolve(SRC_ROOT, "features/freezone/projections.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/freezone/projectionGraphIds.ts")),
    ).toBe(false);
    expect(openProjectionImports).toContain(
      "../domain/canvasStorage",
    );
    expect(statusStateImports).toEqual(["../domain/canvasProjection"]);
    for (const imports of [
      commandControllerImports,
      projectionRequestImports,
      projectionMetadataImports,
      projectionGraphImports,
      projectionGraphIdImports,
      openProjectionImports,
      statusStateImports,
    ]) {
      expect(imports).not.toContain("@/features/freezone/public");
      expect(imports).not.toContain("@/api/canvas");
    }
    expect(infrastructureSource).toContain('method: "POST"');
    expect(compositionSource).toContain(
      "httpFreezoneCanvasProjectionGateway",
    );
  });

  it("separates preset projection opening from browser composition", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/openPresetProjection.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/openPresetProjection.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/openPresetProjectionComposition.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasConsumerPaths = [
      "features/canvas/hooks/useBeatContextNodeController.ts",
      "features/canvas/ui/NodeActionToolbar.tsx",
    ].map((path) => resolve(SRC_ROOT, path));
    const applicationSource = readFileSync(applicationPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const declaration = [
      "export const",
      "openPresetProjectionInMyCanvas",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/canvasIdentity",
        "../domain/canvasProjection",
        "../domain/canvasProjectionMetadata",
        "../domain/canvasProjectionRequest",
        "../domain/canvasStorage",
      ]),
    );
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "@/features/canvas/domain/canvasNodes",
        "@/lib/app-router",
        "@/lib/url-params",
        "@/modules/identity_access/public",
        "./application/canvasRuntimeState",
        "./application/openPresetProjection",
        "./composition",
      ]),
    );
    expect(applicationSource).not.toContain("window.");
    expect(applicationSource).not.toContain("getAppRouter");
    expect(applicationSource).not.toContain("useAuthStore");
    expect(applicationSource).not.toContain("buildProjectionFromPreset");
    expect(compositionSource).toContain("createOpenPresetProjection({");
    expect(compositionSource).toContain("getAppRouter()");
    expect(compositionSource).toContain("window.history.pushState(");
    expect(compositionSource).toContain("queueLocalFreezoneProjection(");
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/openPresetProjectionComposition",
    );
    expect(declarationOwners).toEqual([
      "features/freezone/openPresetProjectionComposition.ts",
    ]);
    for (const consumerPath of canvasConsumerPaths) {
      const imports = importSpecifiers(consumerPath);
      expect(imports).toContain("@/features/freezone/public");
      expect(imports).not.toContain(
        "@/features/freezone/openPresetProjection",
      );
      expect(imports).not.toContain(
        "@/features/freezone/openPresetProjectionComposition",
      );
      expect(imports).not.toContain(
        "@/features/freezone/application/openPresetProjection",
      );
    }
  });

  it("separates projection status state from its React hook", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/projectionStatusStore.ts",
    );
    const statePath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasProjectionStatusState.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasProjectionStatus.ts",
    );
    const canvasConsumerPaths = [
      "features/canvas/hooks/useGroupNodeController.ts",
      "features/canvas/ui/NodeActionToolbar.tsx",
    ].map((path) => resolve(SRC_ROOT, path));
    const stateSource = readFileSync(statePath, "utf8");

    expect(existsSync(legacyPath)).toBe(false);
    expect(importSpecifiers(statePath)).toEqual([
      "../domain/canvasProjection",
    ]);
    expect(new Set(importSpecifiers(hookPath))).toEqual(
      new Set([
        "react",
        "../application/canvasProjectionStatusState",
        "../domain/canvasProjection",
      ]),
    );
    expect(stateSource).not.toContain("react");
    expect(stateSource).not.toContain("useSyncExternalStore");
    for (const consumerPath of canvasConsumerPaths) {
      const imports = importSpecifiers(consumerPath);
      expect(imports).toContain("@/features/freezone/public");
      expect(imports).not.toContain(
        "@/features/freezone/projectionStatusStore",
      );
      expect(imports).not.toContain(
        "@/features/freezone/hooks/useCanvasProjectionStatus",
      );
    }
  });

  it("keeps canvas projection status polling in one presentation hook", () => {
    const lifecyclePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasProjectionStatusLifecycle.ts",
    );
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneShellController.ts",
    );
    const lifecycleSource = readFileSync(lifecyclePath, "utf8");
    const shellSource = readFileSync(shellPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasProjectionStatusLifecycle(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(lifecyclePath))).toEqual(
      new Set([
        "react",
        "../application/canvasProjectionStatusState",
        "../application/canvasSyncStorage",
        "../composition",
      ]),
    );
    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasProjectionStatusLifecycle.ts",
    ]);
    expect(importSpecifiers(shellPath)).toContain(
      "./useCanvasProjectionStatusLifecycle",
    );
    expect(lifecycleSource).toContain("getProjectionStatuses(");
    expect(lifecycleSource).toContain("window.addEventListener(\"focus\"");
    expect(lifecycleSource).toContain("setCanvasProjectionStatuses(");
    expect(lifecycleSource).toContain("clearCanvasProjectionStatuses()");
    expect(shellSource).toContain("useCanvasProjectionStatusLifecycle({");
    expect(shellSource).not.toContain("getProjectionStatuses(");
    expect(shellSource).not.toContain("setCanvasProjectionStatuses(");
    expect(shellSource).not.toContain("clearCanvasProjectionStatuses()");
    expect(shellSource).not.toContain("PROJECTION_STATUS_REFRESH_MS");
  });

  it("keeps canvas projection event commands in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasProjectionCommandController.ts",
    );
    const projectionMetadataPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/canvasProjectionMetadata.ts",
    );
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneShellController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const projectionMetadataSource = readFileSync(
      projectionMetadataPath,
      "utf8",
    );
    const shellSource = readFileSync(shellPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasProjectionCommandController(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/application/canvasServices",
        "@/features/canvas/canvasStore",
        "../application/canvasRuntimeState",
        "../composition",
        "../application/canvasProjectionStatusState",
        "../domain/canvasProjectionMetadata",
        "../domain/canvasProjectionRequest",
      ]),
    );
    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasProjectionCommandController.ts",
    ]);
    expect(importSpecifiers(shellPath)).toContain(
      "./useCanvasProjectionCommandController",
    );
    expect(projectionMetadataSource).toContain(
      "export function requestFromProjectionMetadata(",
    );
    expect(controllerSource).toContain("buildProjectionFromPreset(");
    expect(controllerSource).toContain("queueLocalFreezoneProjection(");
    expect(controllerSource).toContain("removeLocalFreezoneProjection(");
    expect(controllerSource).toContain('"freezone/projection-sync"');
    expect(controllerSource).toContain('"freezone/projection-remove"');
    expect(shellSource).toContain("useCanvasProjectionCommandController({");
    expect(shellSource).not.toContain("requestFromProjectionMetadata(");
    expect(shellSource).not.toContain("buildProjectionFromPreset(");
    expect(shellSource).not.toContain("queueLocalFreezoneProjection(");
    expect(shellSource).not.toContain("removeLocalFreezoneProjection(");
    expect(shellSource).not.toContain('"freezone/projection-sync"');
    expect(shellSource).not.toContain('"freezone/projection-remove"');
  });

  it("separates Freezone chat state from its presentation view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneChatDock.tsx",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneChatDockController.ts",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneChatDockView.tsx",
    );
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneShellView.tsx",
    );
    const entryTestPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneChatDock.test.tsx",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneChatDockController.test.tsx",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const shellSource = readFileSync(shellPath, "utf8");
    const entryTestSource = readFileSync(entryTestPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const declarations = [
      ["export function", "FreezoneChatDock("].join(" "),
      ["export function", "FreezoneChatDockView("].join(" "),
      ["export function", "useFreezoneChatDockController("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "../hooks/useFreezoneChatDockController",
        "./FreezoneChatDockView",
      ]),
    );
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set(["react", "@/hooks/use-media-query"]),
    );
    expect(new Set(importSpecifiers(viewPath))).toEqual(
      new Set([
        "react",
        "@/components/ui/button",
        "@/components/ui/sheet",
        "@/features/superchat/superchat-panel",
        "@/lib/utils",
        "../hooks/useFreezoneChatDockController",
      ]),
    );
    expect(declarationOwners).toEqual([
      ["features/freezone/presentation/FreezoneChatDock.tsx"],
      ["features/freezone/presentation/FreezoneChatDockView.tsx"],
      ["features/freezone/hooks/useFreezoneChatDockController.ts"],
    ]);
    expect(importSpecifiers(shellPath)).toContain(
      "./FreezoneChatDock",
    );
    expect(entrySource).toContain("useFreezoneChatDockController({");
    expect(entrySource).toContain("<FreezoneChatDockView");
    expect(viewSource).toContain('<SuperChatPanel');
    expect(viewSource).toContain("<Sheet open={open}");
    expect(viewSource).toContain('src="/images/avatar-motion.mp4"');
    expect(controllerSource).toContain("CHAT_LAUNCHER_POS_STORAGE_KEY");
    expect(controllerSource).toContain(
      'window.addEventListener("pointermove"',
    );
    expect(controllerSource).toContain(
      "setShouldRenderPanel(false), 320",
    );
    expect(entryTestSource).toContain('from "./FreezoneChatDock"');
    expect(controllerTestSource).toContain(
      'from "./useFreezoneChatDockController"',
    );
    expect(shellSource).toContain("<FreezoneChatDock");
    expect(shellSource).not.toContain("function FreezoneChatDock(");
    for (const source of [entrySource, shellSource]) {
      expect(source).not.toContain("function FreezoneChatToggleButton(");
      expect(source).not.toContain("CHAT_LAUNCHER_POS_STORAGE_KEY");
      expect(source).not.toContain('<SuperChatPanel');
      expect(source).not.toContain("<Sheet open={open}");
      expect(source).not.toContain('window.addEventListener("pointermove"');
    }
    expect(viewSource).not.toContain("useMediaQuery(");
    expect(viewSource).not.toContain("useEffect(");
    expect(controllerSource).not.toContain("className=");
  });

  it("keeps Freezone canvas feedback in one presentation module", () => {
    const presentationPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneCanvasFeedback.tsx",
    );
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneShellView.tsx",
    );
    const presentationSource = readFileSync(presentationPath, "utf8");
    const shellSource = readFileSync(shellPath, "utf8");
    const shellImports = importSpecifiers(shellPath);
    const declarations = [
      "FreezoneToast",
      "CanvasConflictOverlay",
      "BackupStatusIndicator",
      "CanvasLoadingScreen",
      "CanvasLoadingOverlay",
      "CanvasErrorOverlay",
    ];

    expect(new Set(importSpecifiers(presentationPath))).toEqual(
      new Set([
        "react",
        "react-i18next",
        "@/features/freezone/domain/canvasStorage",
        "../application/canvasSyncStorage",
      ]),
    );
    expect(shellImports).toContain(
      "./FreezoneCanvasFeedback",
    );
    for (const name of declarations) {
      const declaration = ["export function", `${name}(`].join(" ");
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/freezone/presentation/FreezoneCanvasFeedback.tsx",
      ]);
      expect(shellSource).toContain(`<${name}`);
      expect(shellSource).not.toContain(`function ${name}(`);
    }
    expect(presentationSource).toContain("readConflictSnapshot()");
    expect(presentationSource).toContain("URL.createObjectURL(blob)");
    expect(presentationSource).toContain('status !== "pending"');
    expect(shellImports).not.toContain("./application/canvasSyncStorage");
    expect(shellImports).not.toContain(
      "@/features/freezone/domain/canvasStorage",
    );
    expect(shellSource).not.toContain("URL.createObjectURL(");
  });

  it("keeps Freezone canvas commit decisions in one pure rules module", () => {
    const rulesPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasCommitRules.ts",
    );
    const committedPatchPath = resolve(
      SRC_ROOT,
      "features/freezone/application/committedNodePatch.ts",
    );
    const legacyRulesPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/canvasCommitRules.ts",
    );
    const legacyCommittedPatchPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/committedNodePatch.ts",
    );
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneShellController.ts",
    );
    const submitControllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCommitDialogSubmitController.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasCommitRules.test.ts",
    );
    const committedPatchTestPath = resolve(
      SRC_ROOT,
      "features/freezone/application/committedNodePatch.test.ts",
    );
    const legacyCommittedPatchTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/freezone/committed-node-patch.test.ts",
    );
    const rulesSource = readFileSync(rulesPath, "utf8");
    const shellSource = readFileSync(shellPath, "utf8");
    const submitControllerSource = readFileSync(submitControllerPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      "renderCommitSuccessMessage",
      "sceneDirectorWorldDataForManifest",
      "nodeDataPatchAfterCommittedSourceSlot",
      "nodeDataPatchAfterCommittedTarget",
      "resolveSubmitNodeData",
      "shouldRefreshCommittedTargetNodes",
      "normalizePushTarget",
      "inferCanonicalRefreshTarget",
      "pushTargetsEqual",
      "defaultCharacterFromMetadata",
    ];

    expect(new Set(importSpecifiers(rulesPath))).toEqual(
      new Set([
        "../domain/assetCommit",
        "../domain/directorWorldCommit",
        "../domain/pushTarget",
        "./committedNodePatch",
      ]),
    );
    expect(new Set(importSpecifiers(committedPatchPath))).toEqual(
      new Set([
        "../domain/assetCommit",
        "../domain/directorWorldCommit",
      ]),
    );
    expect(new Set(importSpecifiers(committedPatchTestPath))).toEqual(
      new Set([
        "vitest",
        "../domain/assetCommit",
        "./committedNodePatch",
      ]),
    );
    expect(existsSync(legacyRulesPath)).toBe(false);
    expect(existsSync(legacyCommittedPatchPath)).toBe(false);
    expect(existsSync(legacyCommittedPatchTestPath)).toBe(false);
    expect(importSpecifiers(shellPath)).toContain(
      "../application/canvasCommitRules",
    );
    expect(importSpecifiers(submitControllerPath)).toContain(
      "../application/canvasCommitRules",
    );
    expect(submitControllerSource).not.toContain(
      "function renderCommitSuccessMessage(",
    );
    expect(testSource).toContain('from "./canvasCommitRules"');
    for (const name of declarations) {
      const declaration = ["export function", `${name}(`].join(" ");
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/freezone/application/canvasCommitRules.ts",
      ]);
      expect(shellSource).not.toContain(`function ${name}(`);
    }
    expect(rulesSource).not.toContain('from "react"');
    expect(rulesSource).not.toContain("window.");
    expect(rulesSource).not.toContain("document.");
    expect(rulesSource).not.toContain("useCanvasStore");
  });

  it("keeps CommitDialog presentation rules in one pure view model", () => {
    const viewModelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/commitDialogViewModel.ts",
    );
    const legacyViewModelPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/commitDialogViewModel.ts",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CommitDialogView.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "__tests__/features/freezone/commit-dialog-targets.test.ts",
    );
    const viewModelSource = readFileSync(viewModelPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export const", "KIND_LABELS"].join(" "),
      ["export const", "GLOBAL_SLOT_KINDS"].join(" "),
      ["export const", "BEAT_SLOT_KINDS"].join(" "),
      ["export const", "SCENE_SLOT_KINDS"].join(" "),
      ["export function", "isUserSelectableCommitKind("].join(" "),
      ["export function", "modelSlotKindsForNodeData("].join(" "),
      ["export function", "identityOptionValue("].join(" "),
      ["export function", "identityOptionLabel("].join(" "),
      ["export function", "firstIdentityOptionValue("].join(" "),
      ["export function", "sceneOptionValue("].join(" "),
      ["export function", "sceneOptionLabel("].join(" "),
      ["export function", "renderMediaLabel("].join(" "),
      ["export function", "directorWorldSourceDisplayName("].join(" "),
      ["export function", "identityOptionsForSelect("].join(" "),
      ["export function", "buildCommitTarget("].join(" "),
      ["export function", "renderCommitTargetLabel("].join(" "),
      ["export function", "shortKindLabel("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/commitDialogViewModel.ts",
      ]),
    );
    expect(existsSync(legacyViewModelPath)).toBe(false);
    expect(new Set(importSpecifiers(viewModelPath))).toEqual(
      new Set([
        "@/features/freezone/domain/assetCommit",
        "@/features/canvas/domain/assetDropInfo",
        "@/modules/asset_world/public",
      ]),
    );
    expect(viewModelSource).not.toContain("react");
    expect(viewModelSource).not.toContain("window.");
    expect(viewModelSource).not.toContain("document.");
    expect(viewModelSource).not.toContain("@/features/freezone/composition");
    expect(viewModelSource).not.toContain("@/shared/api/");
    expect(importSpecifiers(viewPath)).toContain(
      "./commitDialogViewModel",
    );
    for (const declaration of declarations) {
      expect(viewSource).not.toContain(declaration);
    }
    expect(testSource).toContain(
      'from "@/features/freezone/presentation/commitDialogViewModel"',
    );
  });

  it("keeps CommitDialog target state and catalog loading in one controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCommitDialogTargetController.ts",
    );
    const dialogPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CommitDialog.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCommitDialogTargetController.test.tsx",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const dialogSource = readFileSync(dialogPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declaration = [
      "export function",
      "useCommitDialogTargetController(",
    ].join(" ");
    const owners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const catalogCalls = [
      "listCharacters(project)",
      "listCharacterIdentities(project, character)",
      "listScenes(project)",
      "listEpisodes(project)",
      "listBeats(project, episode)",
      "previewAssetImpact(project, target)",
    ];

    expect(owners).toEqual([
      "features/freezone/hooks/useCommitDialogTargetController.ts",
    ]);
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/freezone/domain/assetCommit",
        "@/features/canvas/domain/assetDropInfo",
        "@/modules/asset_world/public",
        "@/modules/narrative_planning/public",
        "../composition",
        "../presentation/commitDialogViewModel",
      ]),
    );
    expect(importSpecifiers(dialogPath)).toContain(
      "../hooks/useCommitDialogTargetController",
    );
    expect(testSource).toContain(
      'from "./useCommitDialogTargetController"',
    );
    for (const call of catalogCalls) {
      expect(controllerSource).toContain(call);
      expect(dialogSource).not.toContain(call);
    }
    expect(dialogSource).not.toContain("modelCommitKindAllowed");
  });

  it("keeps CommitDialog submission orchestration in one controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCommitDialogSubmitController.ts",
    );
    const dialogPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CommitDialog.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCommitDialogSubmitController.test.tsx",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const dialogSource = readFileSync(dialogPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declaration = [
      "export function",
      "useCommitDialogSubmitController(",
    ].join(" ");
    const owners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const orchestrationCalls = [
      "commitDirectorRenderFromCanvasSource(",
      "commitSceneDirectorWorldFromCanvasNode(",
      "modelSourceUrlFromNodeData(latestNodeData)",
      "promoteToAsset(project, submitSourceUrl, target, {",
      "nodeDataAfterCommittedSlot(",
      "renderCommitSuccessMessage(target, result)",
    ];

    expect(owners).toEqual([
      "features/freezone/hooks/useCommitDialogSubmitController.ts",
    ]);
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/domain/assetDropInfo",
        "@/features/freezone/domain/assetCommit",
        "../application/canvasCommitRules",
        "../application/committedNodePatch",
        "../composition",
        "../domain/directorWorldCommit",
      ]),
    );
    expect(importSpecifiers(dialogPath)).toContain(
      "../hooks/useCommitDialogSubmitController",
    );
    expect(testSource).toContain(
      'from "./useCommitDialogSubmitController"',
    );
    for (const call of orchestrationCalls) {
      expect(controllerSource).toContain(call);
      expect(dialogSource).not.toContain(call);
    }
    expect(dialogSource).not.toContain("setSubmitting");
  });

  it("keeps CommitDialog DOM in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CommitDialogView.tsx",
    );
    const entryPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CommitDialog.tsx",
    );
    const legacyEntryPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/CommitDialog.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CommitDialogView.test.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const entrySource = readFileSync(entryPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declaration = [
      "export function",
      "CommitDialogView(",
    ].join(" ");
    const owners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const presentationMarkers = [
      "createPortal(",
      "<UiPanel",
      'aria-label="目标类型"',
      "function sourceDisplayName(",
    ];

    expect(owners).toEqual([
      "features/freezone/presentation/CommitDialogView.tsx",
    ]);
    expect(new Set(importSpecifiers(viewPath))).toEqual(
      new Set([
        "react",
        "react-dom",
        "lucide-react",
        "@/features/freezone/domain/assetCommit",
        "@/features/canvas/domain/assetDropInfo",
        "@/components/ui",
        "@/components/ui/motion",
        "@/components/ui/useDialogTransition",
        "@/modules/asset_world/public",
        "@/modules/narrative_planning/public",
        "./commitDialogViewModel",
      ]),
    );
    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "@/features/freezone/domain/assetCommit",
        "@/features/canvas/domain/assetDropInfo",
        "../hooks/useCommitDialogSubmitController",
        "../hooks/useCommitDialogTargetController",
        "./CommitDialogView",
      ]),
    );
    expect(existsSync(legacyEntryPath)).toBe(false);
    expect(entrySource).toContain("<CommitDialogView");
    expect(testSource).toContain('from "./CommitDialogView"');
    for (const marker of presentationMarkers) {
      expect(viewSource).toContain(marker);
      expect(entrySource).not.toContain(marker);
    }
    expect(importSpecifiers(viewPath)).not.toContain(
      "../hooks/useCommitDialogTargetController",
    );
    expect(importSpecifiers(viewPath)).not.toContain(
      "../hooks/useCommitDialogSubmitController",
    );
  });

  it("keeps Freezone canvas commit orchestration in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasCommitController.ts",
    );
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneShellController.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasCommitController.test.tsx",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const shellSource = readFileSync(shellPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      "useCanvasCommitController",
      "latestCanvasNodeData",
      "refreshCommittedTargetNodes",
      "markCommitCandidatePushed",
    ];

    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@tanstack/react-query",
        "@/features/canvas/application/canvasServices",
        "@/features/canvas/application/imageData",
        "@/features/canvas/canvasStore",
        "@/features/canvas/domain/assetDropInfo",
        "@/features/canvas/domain/directorWorldSceneSaveRegistry",
        "@/features/canvas/public",
        "@/features/freezone/domain/assetCommit",
        "@/lib/query-keys",
        "../application/canvasCommitRules",
        "../composition",
        "../domain/directorWorldCommit",
        "../domain/pushTarget",
      ]),
    );
    expect(importSpecifiers(shellPath)).toContain(
      "./useCanvasCommitController",
    );
    expect(testSource).toContain('from "./useCanvasCommitController"');
    for (const name of declarations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(`function ${name}(`))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/freezone/hooks/useCanvasCommitController.ts",
      ]);
      expect(shellSource).not.toContain(`function ${name}(`);
    }
    expect(shellSource).not.toContain("canvasEventBus");
    expect(shellSource).not.toContain("promoteToAsset");
    expect(shellSource).not.toContain("commitDirectorRenderFromCanvasSource");
    expect(shellSource).not.toContain("commitSceneDirectorWorldFromCanvasNode");
    expect(shellSource).not.toContain("interface PushPrompt");
    expect(controllerSource).not.toContain("CommitDialog");
  });

  it("keeps Freezone canvas entry side effects in one lifecycle hook", () => {
    const lifecyclePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneCanvasEntryLifecycle.ts",
    );
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneShellController.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneCanvasEntryLifecycle.test.tsx",
    );
    const lifecycleSource = readFileSync(lifecyclePath, "utf8");
    const shellSource = readFileSync(shellPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declaration = [
      "export function",
      "useFreezoneCanvasEntryLifecycle(",
    ].join(" ");
    const owners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(lifecyclePath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/canvasStore",
        "@/features/canvas/hooks/useFreezoneCameraOptions",
        "@/features/canvas/hooks/useFreezoneImageModels",
        "@/features/canvas/hooks/useFreezoneStyleTemplates",
        "@/features/canvas/hooks/useFreezoneVideoCameraTemplates",
        "@/features/canvas/hooks/useFreezoneVideoModels",
        "@/lib/app-router",
        "@/lib/url-params",
        "../application/canvasSyncStorage",
      ]),
    );
    expect(owners).toEqual([
      "features/freezone/hooks/useFreezoneCanvasEntryLifecycle.ts",
    ]);
    expect(importSpecifiers(shellPath)).toContain(
      "./useFreezoneCanvasEntryLifecycle",
    );
    expect(testSource).toContain('from "./useFreezoneCanvasEntryLifecycle"');
    expect(shellSource).not.toContain("prefetchFreezoneImageModels");
    expect(shellSource).not.toContain("prefetchFreezoneVideoModels");
    expect(shellSource).not.toContain("prefetchFreezoneCameraOptions");
    expect(shellSource).not.toContain("prefetchFreezoneStyleTemplates");
    expect(shellSource).not.toContain("prefetchFreezoneVideoCameraTemplates");
    expect(shellSource).not.toContain("rememberLastCanvas");
    expect(shellSource).not.toContain("currentCanvasParam");
    expect(shellSource).not.toContain("lastRenderedCanvasKey");
    expect(lifecycleSource).not.toContain("CanvasLoadingScreen");
    expect(lifecycleSource).not.toContain("CanvasLoadingOverlay");
  });

  it("keeps Freezone asset commits behind one application gateway", () => {
    const legacyApiPath = resolve(SRC_ROOT, "api/push.ts");
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/assetCommit.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/assetCommit.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/httpFreezoneAssetCommitGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/composition.ts",
    );
    const pushTargetPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/pushTarget.ts",
    );
    const legacyPushTargetPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/pushTarget.ts",
    );
    const legacyPromotePath = resolve(
      SRC_ROOT,
      "features/freezone/commit/promoteToAsset.ts",
    );
    const unusedBatchDialogPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/BatchCommitDialog.tsx",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const pushTargetSource = readFileSync(pushTargetPath, "utf8");
    const directLegacyConsumers = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        importSpecifiers(path).some((specifier) => specifier.includes("api/push")),
      )
      .map(relativeSource)
      .sort();
    const pushEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/push`"),
      )
      .map(relativeSource)
      .sort();
    const impactEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/impact`"),
      )
      .map(relativeSource)
      .sort();
    const internalConsumerPaths = [
      "features/freezone/hooks/useFreezoneShellController.ts",
      "features/freezone/hooks/useAssetLibraryReplacementController.ts",
      "features/freezone/hooks/useCommitDialogTargetController.ts",
      "features/freezone/hooks/useCommitDialogSubmitController.ts",
      "features/freezone/presentation/CommitDialog.tsx",
      "features/freezone/presentation/CommitDialogView.tsx",
    ];
    const publicConsumerPaths = [
      "features/canvas/domain/assetDrag.ts",
      "features/canvas/domain/canvasCommitEligibility.ts",
      "features/canvas/domain/mainlineNodeTypes.ts",
      "features/canvas/domain/mainlineNodeFlags.ts",
      "features/canvas/application/imageEditNodeModel.ts",
      "features/canvas/hooks/useImageEditNodeController.ts",
      "modules/asset_world/infrastructure/http-prop-gateway.ts",
    ];

    expect(existsSync(legacyApiPath)).toBe(false);
    expect(existsSync(legacyPromotePath)).toBe(false);
    expect(existsSync(legacyPushTargetPath)).toBe(false);
    expect(existsSync(unusedBatchDialogPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(importSpecifiers(pushTargetPath)).toEqual(["./assetCommit"]);
    expect(pushTargetSource).not.toContain("@/features/canvas/");
    expect(importSpecifiers(applicationPath)).toEqual([
      "../domain/assetCommit",
    ]);
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/assetCommit",
        "../domain/assetCommit",
      ]),
    );
    expect(directLegacyConsumers).toEqual([]);
    expect(pushEndpointOwners).toEqual([
      "features/freezone/infrastructure/httpFreezoneAssetCommitGateway.ts",
    ]);
    expect(impactEndpointOwners).toEqual([
      "features/freezone/infrastructure/httpFreezoneAssetCommitGateway.ts",
    ]);
    for (const consumerPath of internalConsumerPaths) {
      const imports = importSpecifiers(resolve(SRC_ROOT, consumerPath));
      expect(imports).toContain("@/features/freezone/domain/assetCommit");
      expect(imports).not.toContain("@/features/freezone/public");
      expect(imports).not.toContain("@/api/push");
    }
    for (const consumerPath of publicConsumerPaths) {
      const imports = importSpecifiers(resolve(SRC_ROOT, consumerPath));
      expect(imports).toContain("@/features/freezone/public");
      expect(imports).not.toContain("@/api/push");
    }
    expect(applicationSource).toContain("validateCommitTarget(params.target)");
    expect(applicationSource).toContain('target.kind === "scene_director_world"');
    expect(applicationSource).not.toContain("@/shared/api/");
    expect(compositionSource).toContain("commitFreezoneAssetUseCase(");
    expect(compositionSource).toContain("getFreezoneAssetImpactUseCase(");
    expect(compositionSource).toContain("httpFreezoneAssetCommitGateway");
  });

  it("keeps Canvas node preferences behind one browser gateway", () => {
    const legacyDomainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/lastVideoModel.ts",
    );
    const registryPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/nodeRegistry.ts",
    );
    const defaultDataPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeDefaultData.ts",
    );
    const nodeFactoryPath = resolve(
      SRC_ROOT,
      "features/canvas/application/nodeFactory.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserCanvasNodeDefaultDataGateway.ts",
    );
    const nodeFactoryCompositionPath = resolve(
      SRC_ROOT,
      "features/canvas/nodeFactoryComposition.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const videoNodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoNodeController.ts",
    );
    const canvasStorePath = resolve(SRC_ROOT, "features/canvas/canvasStore.ts");
    const registrySource = readFileSync(registryPath, "utf8");
    const defaultDataSource = readFileSync(defaultDataPath, "utf8");
    const nodeFactorySource = readFileSync(nodeFactoryPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const nodeFactoryCompositionSource = readFileSync(
      nodeFactoryCompositionPath,
      "utf8",
    );
    const compositionSource = readFileSync(compositionPath, "utf8");
    const videoNodeSource = readFileSync(videoNodePath, "utf8");
    const canvasStoreSource = readFileSync(canvasStorePath, "utf8");
    const domainRuntimeOwners = sourceFiles(
      resolve(SRC_ROOT, "features/canvas/domain"),
    )
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes("window.") || source.includes("localStorage");
      })
      .map(relativeSource)
      .sort();
    const storageOwners = sourceFiles(
      resolve(SRC_ROOT, "features/canvas"),
    )
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("canvas.lastVideoModel"),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyDomainPath)).toBe(false);
    expect(domainRuntimeOwners).toEqual([]);
    expect(storageOwners).toEqual([
      "features/canvas/infrastructure/browserCanvasNodeDefaultDataGateway.ts",
    ]);
    expect(registrySource).not.toContain("readLastVideoModel");
    expect(registrySource).toContain("model: DEFAULT_VIDEO_MODEL_ID");
    expect(new Set(importSpecifiers(defaultDataPath))).toEqual(
      new Set(["../domain/canvasNodes", "./ports"]),
    );
    expect(defaultDataSource).toContain(
      "nodeDefaultDataGateway?.getOverrides(type)",
    );
    expect(nodeFactorySource).toContain("createCanvasNodeDefaultData(");
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set(["../domain/canvasNodes", "../application/ports"]),
    );
    expect(adapterSource).toContain(
      'const LAST_VIDEO_MODEL_STORAGE_KEY = "canvas.lastVideoModel"',
    );
    expect(nodeFactoryCompositionSource).toContain(
      "browserCanvasNodeDefaultDataGateway",
    );
    expect(nodeFactoryCompositionSource).toContain(
      "canvasNodeDefaultDataGateway,",
    );
    expect(compositionSource).toContain(
      "export { rememberLastVideoModel } from './nodeFactoryComposition';",
    );
    expect(videoNodeSource).toContain("rememberLastVideoModel(nextModelId)");
    expect(videoNodeSource).not.toContain("domain/lastVideoModel");
    expect(
      canvasStoreSource.match(
        /nodeDefaultDataGateway: canvasNodeDefaultDataGateway/g,
      ),
    ).toHaveLength(3);
  });

  it("keeps Canvas history rules in the domain model", () => {
    const historyPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasHistory.ts",
    );
    const navigationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasHistoryNavigation.ts",
    );
    const historySlicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasHistorySlice.ts",
    );
    const historyModel = readFileSync(historyPath, "utf8");
    const navigationModel = readFileSync(navigationPath, "utf8");
    const historySlice = readFileSync(historySlicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasSync = readFileSync(
      resolve(SRC_ROOT, "features/freezone/hooks/useCanvasSync.ts"),
      "utf8",
    );
    const canvasSyncStorage = readFileSync(
      resolve(
        SRC_ROOT,
        "features/freezone/application/canvasSyncStorage.ts",
      ),
      "utf8",
    );
    const draftStorage = readFileSync(
      resolve(SRC_ROOT, "features/freezone/application/canvasDraft.ts"),
      "utf8",
    );
    const forbiddenHistoryImports = importSpecifiers(historyPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+(?:application|infrastructure)(?:\/|$)/.test(specifier),
    );
    const forbiddenNavigationImports = importSpecifiers(navigationPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const historyContractDeclaration = [
      "export interface",
      "CanvasHistoryState",
    ].join(" ");
    const historyContractOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(historyContractDeclaration),
      )
      .map(relativeSource)
      .sort();
    const navigationDeclaration = [
      "export function",
      "navigateCanvasHistory(",
    ].join(" ");
    const navigationOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(navigationDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenHistoryImports).toEqual([]);
    expect(forbiddenNavigationImports).toEqual([]);
    expect(historyContractOwners).toEqual([
      "features/canvas/domain/canvasHistory.ts",
    ]);
    expect(navigationOwners).toEqual([
      "features/canvas/application/canvasHistoryNavigation.ts",
    ]);
    expect(historyModel).toContain("export function undoHistory(");
    expect(historyModel).toContain("export function redoHistory(");
    expect(navigationModel).toContain(navigationDeclaration);
    expect(navigationModel).toContain("undoHistory(state.history, current)");
    expect(navigationModel).toContain("redoHistory(state.history, current)");
    expect(historySlice).toContain(
      "../domain/canvasHistory",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasHistory",
    );
    expect(canvasStore).not.toContain("function pushSnapshot(");
    expect(canvasStore).not.toContain("function undoHistory(");
    expect(canvasStore).not.toContain("function redoHistory(");
    expect(canvasStore).not.toContain("undoHistory(");
    expect(canvasStore).not.toContain("redoHistory(");
    expect(historySlice).toContain("../application/canvasHistoryNavigation");
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasHistoryNavigation",
    );
    expect(canvasSyncStorage).toContain(
      "@/features/canvas/domain/canvasHistory",
    );
    expect(canvasSync).toContain("../application/canvasSyncStorage");
    expect(canvasSync).not.toContain(
      "@/features/canvas/domain/canvasHistory",
    );
    expect(draftStorage).toContain(
      "@/features/canvas/domain/canvasHistory",
    );
  });

  it("keeps Canvas graph change intent outside the Zustand store", () => {
    const changeIntentPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasChangeIntent.ts",
    );
    const changeEffectsPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeChangeEffects.ts",
    );
    const edgeEffectsPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasEdgeChangeEffects.ts",
    );
    const historyPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasHistory.ts",
    );
    const changeIntent = readFileSync(changeIntentPath, "utf8");
    const changeEffects = readFileSync(changeEffectsPath, "utf8");
    const edgeEffects = readFileSync(edgeEffectsPath, "utf8");
    const graphMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGraphMutationSlice.ts",
      ),
      "utf8",
    );
    const historyModel = readFileSync(historyPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenIntentImports = [
      changeIntentPath,
      changeEffectsPath,
      edgeEffectsPath,
    ].flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "react" ||
            specifier.startsWith("react/") ||
            specifier === "@xyflow/react" ||
            specifier.startsWith("@/stores/") ||
            specifier.startsWith("@/features/canvas/infrastructure/") ||
            specifier === "@/features/canvas/composition",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const interactionHistoryDeclaration = [
      "export function",
      "recordCanvasInteractionHistory(",
    ].join(" ");
    const interactionHistoryOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(interactionHistoryDeclaration),
      )
      .map(relativeSource)
      .sort();
    const changeEffectsDeclaration = [
      "export function",
      "applyCanvasNodeChangeEffects(",
    ].join(" ");
    const changeEffectsOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(changeEffectsDeclaration),
      )
      .map(relativeSource)
      .sort();
    const edgeEffectsDeclaration = [
      "export function",
      "applyCanvasEdgeChangeEffects(",
    ].join(" ");
    const edgeEffectsOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(edgeEffectsDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenIntentImports).toEqual([]);
    expect(interactionHistoryOwners).toEqual([
      "features/canvas/domain/canvasHistory.ts",
    ]);
    expect(changeEffectsOwners).toEqual([
      "features/canvas/application/canvasNodeChangeEffects.ts",
    ]);
    expect(edgeEffectsOwners).toEqual([
      "features/canvas/application/canvasEdgeChangeEffects.ts",
    ]);
    expect(changeIntent).toContain("export function classifyCanvasNodeChanges(");
    expect(changeIntent).toContain(
      "export function hasMeaningfulCanvasEdgeChange(",
    );
    expect(historyModel).toContain(interactionHistoryDeclaration);
    expect(changeEffects).toContain(changeEffectsDeclaration);
    expect(changeEffects).toContain("recordCanvasInteractionHistory(");
    expect(changeEffects).toContain("withManualSizeLock(node)");
    expect(edgeEffects).toContain(edgeEffectsDeclaration);
    expect(edgeEffects).toContain("hasMeaningfulCanvasEdgeChange(changes)");
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasChangeIntent",
    );
    expect(changeEffects).toContain("from './canvasChangeIntent';");
    expect(canvasView).not.toContain(
      "@/features/canvas/application/canvasChangeIntent",
    );
    expect(graphMutationSlice).toContain(
      "../application/canvasNodeChangeEffects",
    );
    expect(graphMutationSlice).toContain(
      "../application/canvasEdgeChangeEffects",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasNodeChangeEffects",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasEdgeChangeEffects",
    );
    expect(canvasStore).not.toContain("recordCanvasInteractionHistory(");
    expect(canvasStore).not.toContain("classifyCanvasNodeChanges(");
    expect(canvasStore).not.toContain("withManualSizeLock(");
    for (const source of [canvasStore, canvasView]) {
      expect(source).not.toContain("const hasDragMove =");
      expect(source).not.toContain("const hasDragEnd =");
      expect(source).not.toContain("const hasResizeMove =");
      expect(source).not.toContain("const hasResizeEnd =");
    }
    expect(canvasStore).not.toContain("let nextDragHistorySnapshot =");
  });

  it("keeps Canvas image viewer transitions outside the Zustand store", () => {
    const viewerPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasImageViewer.ts",
    );
    const viewerModel = readFileSync(viewerPath, "utf8");
    const viewportSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasViewportSlice.ts",
      ),
      "utf8",
    );
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewerPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const viewerContractDeclaration = [
      "export interface",
      "CanvasImageViewerState",
    ].join(" ");
    const viewerContractOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(viewerContractDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(viewerContractOwners).toEqual([
      "features/canvas/application/canvasImageViewer.ts",
    ]);
    expect(viewerModel).toContain("export function openCanvasImageViewer(");
    expect(viewerModel).toContain("export function navigateCanvasImageViewer(");
    expect(viewportSlice).toContain("../application/canvasImageViewer");
    expect(viewportSlice).toContain(
      "imageViewer: createClosedCanvasImageViewer()",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasImageViewer",
    );
    expect(canvasStore).not.toContain("const list = imageList.length");
    expect(canvasStore).not.toContain("const newIndex = currentIndex");
    expect(
      existsSync(resolve(SRC_ROOT, "features/canvas/hooks/useImageViewer.ts")),
    ).toBe(false);
  });

  it("keeps Canvas mutation and persistence state in the domain model", () => {
    const mutationPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasMutation.ts",
    );
    const mutationModel = readFileSync(mutationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeDeletionSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeDeletionSlice.ts",
      ),
      "utf8",
    );
    const canvasSyncCore = readFileSync(
      resolve(SRC_ROOT, "features/freezone/application/canvasSyncCore.ts"),
      "utf8",
    );
    const draftStorage = readFileSync(
      resolve(SRC_ROOT, "features/freezone/application/canvasDraft.ts"),
      "utf8",
    );
    const forbiddenMutationImports = importSpecifiers(mutationPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/"),
    );
    const mutationContractDeclaration = [
      "export interface",
      "CanvasMutationState",
    ].join(" ");
    const mutationContractOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(mutationContractDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenMutationImports).toEqual([]);
    expect(mutationContractOwners).toEqual([
      "features/canvas/domain/canvasMutation.ts",
    ]);
    expect(mutationModel).toContain("export function trackEdit(");
    expect(mutationModel).toContain("export function isDeleteToEmpty(");
    expect(nodeDeletionSlice).toContain(
      "../domain/canvasMutation",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasMutation",
    );
    expect(canvasStore).not.toContain("export type CanvasMutationSource");
    expect(canvasStore).not.toContain("function trackEdit(");
    expect(canvasStore).not.toContain("function isDeleteToEmpty(");
    expect(canvasSyncCore).toContain(
      "@/features/canvas/domain/canvasMutation",
    );
    expect(draftStorage).toContain(
      "@/features/canvas/domain/canvasMutation",
    );
    expect(draftStorage).not.toContain("interface CanvasDraftMutationState");
  });

  it("keeps Canvas graph geometry independent from the Zustand store", () => {
    const geometryPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasGeometry.ts",
    );
    const geometryModel = readFileSync(geometryPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const viewportSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasViewportSlice.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const clipboardDuplicationPlanner = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/application/canvasClipboardDuplication.ts",
      ),
      "utf8",
    );
    const backToNodesView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/ui/BackToNodesHint.tsx"),
      "utf8",
    );
    const forbiddenGeometryImports = importSpecifiers(geometryPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/"),
    );
    const placementDeclaration = [
      "export function",
      "findAvailableNodePosition(",
    ].join(" ");
    const collisionDeclaration = [
      "export function",
      "hasRectCollision(",
    ].join(" ");
    const intersectionDeclaration = [
      "export function",
      "rectsIntersect(",
    ].join(" ");
    const boundsDeclaration = [
      "export function",
      "getTopLevelCanvasBounds(",
    ].join(" ");
    const viewportOverlapDeclaration = [
      "export function",
      "canvasViewportOverlapsRect(",
    ].join(" ");
    const visibleNodeDeclaration = [
      "export function",
      "hasVisibleTopLevelCanvasNode(",
    ].join(" ");
    const placementOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(placementDeclaration),
      )
      .map(relativeSource)
      .sort();
    const rectangleRuleOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes(collisionDeclaration) ||
          source.includes(intersectionDeclaration) ||
          source.includes(boundsDeclaration) ||
          source.includes(viewportOverlapDeclaration) ||
          source.includes(visibleNodeDeclaration)
        );
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenGeometryImports).toEqual([]);
    expect(placementOwners).toEqual([
      "features/canvas/domain/canvasGeometry.ts",
    ]);
    expect(rectangleRuleOwners).toEqual([
      "features/canvas/domain/canvasGeometry.ts",
    ]);
    expect(geometryModel).toContain("export function getNodeSize(");
    expect(geometryModel).toContain(collisionDeclaration);
    expect(geometryModel).toContain(intersectionDeclaration);
    expect(geometryModel).toContain(boundsDeclaration);
    expect(geometryModel).toContain(viewportOverlapDeclaration);
    expect(geometryModel).toContain(visibleNodeDeclaration);
    expect(geometryModel).toContain("export function resolveAbsolutePosition(");
    expect(geometryModel).toContain("export function getDerivedNodePosition(");
    expect(geometryModel).toContain(placementDeclaration);
    expect(viewportSlice).toContain(
      "../domain/canvasGeometry",
    );
    expect(viewportSlice).toContain("return findAvailableNodePosition({");
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasGeometry",
    );
    expect(canvasStore).not.toContain("function getNodeSize(");
    expect(canvasStore).not.toContain("function resolveAbsolutePosition(");
    expect(canvasStore).not.toContain("function getDerivedNodePosition(");
    expect(canvasStore).not.toContain("const collides =");
    expect(canvasStore).not.toContain("const overflowAmount =");
    expect(clipboardDuplicationPlanner).toContain("../domain/canvasGeometry");
    expect(canvasView).not.toContain(
      "@/features/canvas/domain/canvasGeometry",
    );
    expect(canvasView).not.toContain("function getNodeSize(");
    expect(canvasView).not.toContain("function hasRectCollision(");
    expect(canvasView).not.toContain("function rectsIntersect(");
    expect(canvasView).not.toContain("const topLevelNodes = nodes.filter(");
    expect(canvasView).not.toContain("const overlapsView =");
    expect(canvasView).not.toContain("initialViewportCorrectionPendingRef");
    expect(canvasView).not.toContain("useNodesInitialized");
    expect(backToNodesView).toContain(
      "@/features/canvas/domain/canvasGeometry",
    );
    expect(backToNodesView).not.toContain("function nodeFallbackSize(");
    expect(backToNodesView).not.toContain("let minX =");
    expect(backToNodesView).not.toContain("const viewMinX =");
    expect(canvasView).not.toContain(
      "resolveAbsolutePosition, useCanvasStore",
    );
  });

  it("keeps Canvas capture partner rules in the domain model", () => {
    const partnersPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasCapturePartners.ts",
    );
    const partnersModel = readFileSync(partnersPath, "utf8");
    const linkedDragController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasLinkedCaptureDragController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(partnersPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const ruleDeclaration = [
      "export function",
      "findLinkedCapturePartnerIds(",
    ].join(" ");
    const ruleOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(ruleDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(ruleOwners).toEqual([
      "features/canvas/domain/canvasCapturePartners.ts",
    ]);
    expect(partnersModel).toContain(ruleDeclaration);
    expect(linkedDragController).toContain("../domain/canvasCapturePartners");
    expect(linkedDragController).toContain("findLinkedCapturePartnerIds(");
    expect(canvasView).not.toContain(
      "@/features/canvas/domain/canvasCapturePartners",
    );
    expect(canvasView).not.toContain(ruleDeclaration);
  });

  it("keeps Canvas DOM interaction rules in one UI helper", () => {
    const interactionPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/canvasInteractionTargets.ts",
    );
    const interactionModel = readFileSync(interactionPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const stageView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/ui/CanvasStageView.tsx"),
      "utf8",
    );
    const zoomView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/ui/CanvasZoomControl.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(interactionPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      "isCanvasPaneTarget(",
      "isTypingTarget(",
      "isSpacePanKey(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return declarations.some((declaration) => source.includes(declaration));
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/ui/canvasInteractionTargets.ts",
    ]);
    for (const declaration of declarations) {
      expect(interactionModel).toContain(declaration);
    }
    expect(stageView).toContain("./canvasInteractionTargets");
    expect(zoomView).toContain("./canvasInteractionTargets");
    expect(canvasView).not.toContain("./ui/canvasInteractionTargets");
    expect(canvasView).not.toContain("function isCanvasPaneTarget(");
    expect(canvasView).not.toContain("function isTypingTarget(");
    expect(canvasView).not.toContain("function isSpacePanKey(");
    expect(canvasView).not.toContain("const PAN_ACTIVATION_KEY_CODE");
    expect(zoomView).not.toContain("function isTypingTarget(");
  });

  it("keeps Canvas browser media transfer parsing in one UI helper", () => {
    const transferPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/canvasMediaTransfer.ts",
    );
    const transferModel = readFileSync(transferPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const mediaPasteController = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useCanvasMediaPaste.ts"),
      "utf8",
    );
    const mediaDropController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasMediaDropController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(transferPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      "resolveClipboardImageFile(",
      "collectDroppedMediaFiles(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return declarations.some((declaration) => source.includes(declaration));
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/ui/canvasMediaTransfer.ts",
    ]);
    for (const declaration of declarations) {
      expect(transferModel).toContain(declaration);
    }
    expect(transferModel).toContain(
      "@/features/canvas/application/videoFileTypes",
    );
    expect(mediaPasteController).toContain("../ui/canvasMediaTransfer");
    expect(mediaDropController).toContain("../ui/canvasMediaTransfer");
    expect(canvasView).not.toContain("./ui/canvasMediaTransfer");
    expect(canvasView).not.toContain("function resolveClipboardImageFile(");
    expect(canvasView).not.toContain("function collectDroppedMediaFiles(");
  });

  it("keeps Canvas connection gesture adapters in one UI helper", () => {
    const interactionPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/canvasConnectionInteraction.ts",
    );
    const interactionModel = readFileSync(interactionPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const gestureController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasConnectionGestureController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(interactionPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      "getClientPosition(",
      "resolveCanvasConnectionStart(",
      "resolveCanvasConnectionEnd(",
      "resolveCanvasPlusConnectionStart(",
      "resolveCanvasPlusConnectionEnd(",
      "createPreviewPath(",
      "cssEscape(",
      "resolveConnectEndHandleId(",
      "resolveManualDropTargetElement(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return declarations.some((declaration) => source.includes(declaration));
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/ui/canvasConnectionInteraction.ts",
    ]);
    for (const declaration of declarations) {
      expect(interactionModel).toContain(declaration);
    }
    expect(gestureController).toContain("../ui/canvasConnectionInteraction");
    expect(canvasView).not.toContain("./ui/canvasConnectionInteraction");
    expect(canvasView).not.toContain("function getClientPosition(");
    expect(canvasView).not.toContain("getClientPosition(");
    expect(canvasView).not.toContain("canNodeBeManualConnectionSource(");
    expect(canvasView).not.toContain("interface PendingConnectStart");
    expect(canvasView).not.toContain(
      "eventTarget?.closest?.('.react-flow__handle')",
    );
    expect(canvasView).not.toContain("function createPreviewPath(");
    expect(canvasView).not.toContain("function cssEscape(");
    expect(canvasView).not.toContain("function handleIdFromElement(");
    expect(canvasView).not.toContain("function isVisibleConnectionHandle(");
    expect(canvasView).not.toContain("function nearestHandleIdAtPoint(");
    expect(canvasView).not.toContain("function resolveConnectEndHandleId(");
    expect(canvasView).not.toContain("MANUAL_DROP_PROXIMITY_PX");
    expect(canvasView).not.toContain("let bestDist = Infinity");
    expect(canvasView).not.toContain("Math.hypot(dx, dy)");
    expect(canvasView).not.toContain("const nodeElementFromTarget");
    expect(canvasView).not.toContain("let startX:");
    expect(canvasView).not.toContain("connectionState.from");
    expect(canvasView).not.toContain("interface PreviewConnectionLine");
    expect(interactionModel).toContain(
      "export interface CanvasPendingConnectionStart",
    );
    expect(interactionModel).toContain(
      "export type CanvasConnectionEndResolution",
    );
  });

  it("keeps Canvas viewport surface assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasViewportSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasViewportSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const childControllers = [
      "./useCanvasMinimapVisibility",
      "./useCanvasViewportRuntimeController",
      "./useCanvasLifecycle",
      "./useCanvasSnapAlignment",
      "./useCanvasNodeFocusController",
      "./useCanvasAutoLayoutController",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasViewportSurfaceController.ts",
    ]);
    for (const childController of childControllers) {
      expect(controllerSource).toContain(childController);
      expect(canvasView).not.toContain(
        childController.replace("./", "./hooks/"),
      );
    }
    expect(controllerSource).toContain("../trackpad-pan/trackpadPanStore");
    expect(controllerSource).toContain("../snap-align/snapAlignStore");
    expect(controllerSource).toContain("viewportPort.fitView(options)");
    expect(controllerSource).toContain("useSnapAlignStore.getState()");
    expect(canvasView).toContain("./hooks/useCanvasViewportSurfaceController");
    expect(canvasView).not.toContain("useTrackpadPanStore");
    expect(canvasView).not.toContain("useSnapAlignStore");
    expect(canvasView).not.toContain("CANVAS_SNAP_ALIGNMENT_PORT");
    expect(canvasView).not.toContain("fitAutoLayoutViewport");
  });

  it("keeps Canvas minimap visibility state in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasMinimapVisibility.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasMinimapVisibility(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasMinimapVisibility.ts",
    ]);
    expect(hookModel).toContain(hookDeclaration);
    expect(hookModel).toContain("isTypingTarget");
    expect(hookModel).toContain("isImmersiveViewerActive");
    expect(canvasView).toContain("./hooks/useCanvasViewportSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasMinimapVisibility");
    expect(canvasView).not.toContain("const [minimapPinned,");
    expect(canvasView).not.toContain("const [minimapHovered,");
    expect(canvasView).not.toContain("minimapHideTimerRef");
    expect(canvasView).not.toContain("setMinimapPinned(");
    expect(canvasView).not.toContain("handleMinimapKey");
    expect(canvasView).not.toContain("event.key.toLowerCase() !== 'm'");
  });

  it("keeps Canvas connection-gesture assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasConnectionGestureSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        (specifier.startsWith("@/stores/") &&
          specifier !== "@/features/canvas/canvasStore") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasConnectionGestureSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const childControllers = [
      "./useCanvasNodeHover",
      "./useCanvasConnectionGestureController",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasConnectionGestureSurfaceController.ts",
    ]);
    for (const childController of childControllers) {
      expect(controllerSource).toContain(childController);
      expect(canvasView).not.toContain(
        childController.replace("./", "./hooks/"),
      );
    }
    expect(controllerSource).toContain("@/features/canvas/canvasStore");
    expect(controllerSource).toContain(
      "clearHoveredNodeTimer: hover.clearHoveredNodeTimer",
    );
    expect(controllerSource).toContain("setHoveredNodeId,");
    expect(canvasView).toContain(
      "./hooks/useCanvasConnectionGestureSurfaceController",
    );
    expect(canvasView).not.toContain("state.hoveredNodeId");
    expect(canvasView).not.toContain("state.setHoveredNodeId");
  });

  it("keeps Canvas transient node UI timing in presentation hooks", () => {
    const hoverHookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeHover.ts",
    );
    const placementHookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodePlacementConfirm.ts",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const hookPaths = [hoverHookPath, placementHookPath];
    const forbiddenImports = hookPaths.flatMap((path) =>
      importSpecifiers(path).filter(
        (specifier) =>
          specifier === "@xyflow/react" ||
          specifier.startsWith("@xyflow/react/") ||
          specifier === "zustand" ||
          specifier.startsWith("zustand/") ||
          specifier.startsWith("@/stores/") ||
          specifier.startsWith("@/features/canvas/application/") ||
          specifier.startsWith("@/features/canvas/infrastructure/") ||
          specifier === "@/features/canvas/composition",
      ),
    );
    const declarations = [
      "useCanvasNodeHover(",
      "useCanvasNodePlacementConfirm(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      ["features/canvas/hooks/useCanvasNodeHover.ts"],
      ["features/canvas/hooks/useCanvasNodePlacementConfirm.ts"],
    ]);
    expect(canvasView).toContain(
      "./hooks/useCanvasConnectionGestureSurfaceController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasNodeHover");
    expect(canvasView).toContain("./hooks/useCanvasRenderSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasNodePlacementConfirm");
    expect(canvasView).not.toContain("hoveredNodeClearTimerRef");
    expect(canvasView).not.toContain("NODE_SPAWN_PLUS_HIDE_DELAY_MS");
    expect(canvasView).not.toContain("placementConfirmTimerRef");
    expect(canvasView).not.toContain("setPlacementConfirmNodeId");
  });

  it("keeps Canvas node placement state in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodePlacementController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasNodePlacementController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasNodePlacementController.ts",
    ]);
    expect(hookModel).toContain("NODE_PLACEMENT_PREVIEW_WIDTH");
    expect(hookModel).toContain("NODE_PLACEMENT_PREVIEW_HEIGHT");
    expect(hookModel).toContain("createNode(");
    expect(hookModel).toContain("bindSkill(");
    expect(hookModel).toContain("confirmPlacement(");
    expect(canvasView).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasNodeInteractionController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasNodePlacementController",
    );
    expect(canvasView).not.toContain("const [pendingNodePlacement");
    expect(canvasView).not.toContain("nodePlacementClientPosition");
    expect(canvasView).not.toContain("setPendingNodePlacement");
    expect(canvasView).not.toContain("setNodePlacementClientPosition");
    expect(canvasView).not.toContain("NODE_PLACEMENT_PREVIEW_WIDTH");
    expect(canvasView).not.toContain("NODE_PLACEMENT_PREVIEW_HEIGHT");
    expect(canvasView).not.toContain(
      "const commitNodePlacementAtClientPosition = useCallback",
    );
    expect(canvasView).not.toContain("const nodePlacementPreview = useMemo");
  });

  it("keeps Canvas node-click orchestration in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeClickController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasNodeClickController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeClickController.ts",
    ]);
    expect(hookModel).toContain("isStoryboardGroupNode(node)");
    expect(hookModel).toContain("DEFAULT_NODE_WIDTH");
    expect(hookModel).toContain("DEFAULT_STORYBOARD_GROUP_HEIGHT = 240");
    expect(hookModel).toContain("zoom: 1");
    expect(hookModel).toContain("duration: 320");
    expect(canvasView).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasNodeInteractionController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasNodeClickController");
    expect(canvasView).not.toContain("const handleNodeClick = useCallback");
    expect(canvasView).not.toContain("isStoryboardGroupNode(");
    expect(canvasView).not.toContain("DEFAULT_NODE_WIDTH");
    expect(canvasView).not.toContain("node.position.x + width / 2");
  });

  it("keeps Canvas drop indicator state in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasDropIndicator.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const mediaDropController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasMediaDropController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasDropIndicator(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasDropIndicator.ts",
    ]);
    expect(hookModel).toContain("CANVAS_ASSET_DRAG_MIME");
    expect(mediaDropController).toContain("./useCanvasDropIndicator");
    expect(canvasView).not.toContain("./hooks/useCanvasDropIndicator");
    expect(canvasView).not.toContain("fileDragDepthRef");
    expect(canvasView).not.toContain("setIsFileDropActive");
    expect(canvasView).not.toContain("hasDraggedFiles");
    expect(canvasView).not.toContain("hasDraggedAsset");
    expect(canvasView).not.toContain("hasDraggedAnyPayload");
  });

  it("keeps Canvas media-drop orchestration in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasMediaDropController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const transferController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasMediaTransferController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasMediaDropController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasMediaDropController.ts",
    ]);
    expect(hookModel).toContain("readAssetDragPayload(");
    expect(hookModel).toContain("collectDroppedMediaFiles(");
    expect(hookModel).toContain("DROPPED_FILE_OFFSET = 36");
    expect(hookModel).toContain("scheduleAfterMount(");
    expect(transferController).toContain("./useCanvasMediaDropController");
    expect(canvasView).toContain("./hooks/useCanvasMediaSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasMediaTransferController");
    expect(canvasView).not.toContain("./hooks/useCanvasMediaDropController");
    expect(canvasView).not.toContain("const handleCanvasDrop = useCallback");
    expect(canvasView).not.toContain("readAssetDragPayload(");
    expect(canvasView).not.toContain("collectDroppedMediaFiles(");
    expect(canvasView).not.toContain("index * 36");
    expect(canvasView).not.toMatch(
      /requestAnimationFrame\(\(\) => \{\s*canvasEventBus\.publish\('upload-node\/external-file'/,
    );
  });

  it("keeps Canvas auto-layout orchestration in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasAutoLayoutController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasAutoLayoutController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasAutoLayoutController.ts",
    ]);
    expect(hookModel).toContain("computeAutoLayout(nodes, edges)");
    expect(hookModel).toContain("changedCount > 0");
    expect(hookModel).toContain("scheduleAfterLayout(");
    expect(hookModel).toContain("duration: 240");
    expect(hookModel).toContain("padding: 0.2");
    expect(canvasView).toContain("./hooks/useCanvasViewportSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasAutoLayoutController");
    expect(canvasView).not.toContain("computeAutoLayout(");
    expect(canvasView).not.toContain("const handleOrganizeCanvas = useCallback");
    expect(canvasView).not.toContain("Object.keys(positions)");
    expect(canvasView).not.toContain("requestAnimationFrame");
    expect(canvasView).not.toContain("duration: 240");
  });

  it("keeps Canvas history-asset planning and orchestration outside the view", () => {
    const plannerPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasHistoryAssetSpawn.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasHistoryAssetController.ts",
    );
    const plannerModel = readFileSync(plannerPath, "utf8");
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const quickActionView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/ui/CanvasQuickActionBar.tsx"),
      "utf8",
    );
    const historyAssetsController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasHistoryAssetsModalController.ts",
      ),
      "utf8",
    );
    const plannerForbiddenImports = importSpecifiers(plannerPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const hookForbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declarations = [
      ["export function", "createCanvasHistoryAssetPayload("].join(" "),
      ["export function", "resolveCanvasHistoryAssetPosition("].join(" "),
      ["export function", "useCanvasHistoryAssetController("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(plannerForbiddenImports).toEqual([]);
    expect(hookForbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      ["features/canvas/application/canvasHistoryAssetSpawn.ts"],
      ["features/canvas/application/canvasHistoryAssetSpawn.ts"],
      ["features/canvas/hooks/useCanvasHistoryAssetController.ts"],
    ]);
    expect(plannerModel).toContain("restoreAsGeneratedImage: true");
    expect(plannerModel).toContain("HISTORY_ASSET_GRID_MAX_COLUMNS = 4");
    expect(plannerModel).toContain("HISTORY_ASSET_GRID_GAP = 320");
    expect(hookModel).toContain("createCanvasHistoryAssetPayload(asset)");
    expect(hookModel).toContain("resolveCanvasHistoryAssetPosition(");
    expect(hookModel).toContain("selectNode(nodeId)");
    expect(canvasView).toContain("./hooks/useCanvasMediaSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasHistoryAssetController");
    expect(canvasView).not.toContain("const handleUseHistoryAsset = useCallback");
    expect(canvasView).not.toContain("const handleDeleteHistoryNode = useCallback");
    expect(canvasView).not.toContain("restoreAsGeneratedImage: true");
    expect(canvasView).not.toContain("Math.min(4, placement.total)");
    expect(canvasView).not.toContain("@/features/canvas/domain/canvasAssets");
    expect(quickActionView).toContain("CanvasHistoryAssetPlacement");
    expect(historyAssetsController).toContain("CanvasHistoryAssetPlacement");
    expect(quickActionView).not.toContain(
      "placement?: { index: number; total: number }",
    );
    expect(historyAssetsController).not.toContain(
      "placement?: { index: number; total: number }",
    );
  });

  it("keeps Canvas quick-add orchestration in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasQuickAddController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasQuickAddController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasQuickAddController.ts",
    ]);
    expect(hookModel).toContain("wrapperRef.current?.getBoundingClientRect()");
    expect(hookModel).toContain("window.innerWidth / 2");
    expect(hookModel).toContain("createCanvasSkillNodeData(skill)");
    expect(hookModel).toContain("bindSkill(nodeId, skill)");
    expect(canvasView).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasNodeInteractionController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasQuickAddController");
    expect(canvasView).toContain(
      "getViewportCenter: getQuickAddViewportCenter",
    );
    expect(canvasView).not.toContain("const spawnAtViewportCenter = useCallback");
    expect(canvasView).not.toContain("const handleQuickAddNode = useCallback");
    expect(canvasView).not.toContain("const handleQuickAddSkill = useCallback");
    expect(canvasView).not.toContain("window.innerWidth / 2");
  });

  it("keeps Canvas viewport commit throttling in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasViewportCommit.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const viewportController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasViewportRuntimeController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasViewportCommit(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasViewportCommit.ts",
    ]);
    expect(hookModel).toContain("VIEWPORT_COMMIT_INTERVAL_MS = 120");
    expect(viewportController).toContain("./useCanvasViewportCommit");
    expect(canvasView).toContain("./hooks/useCanvasViewportSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasViewportRuntimeController");
    expect(canvasView).not.toContain("./hooks/useCanvasViewportCommit");
    expect(canvasView).not.toContain("lastViewportCommitRef");
    expect(canvasView).not.toContain("handleMoveStart");
    expect(canvasView).not.toContain("onMoveStart=");
  });

  it("keeps Canvas viewport bookmark shortcuts in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasViewportBookmarkShortcuts.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const viewportController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasViewportRuntimeController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasViewportBookmarkShortcuts(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasViewportBookmarkShortcuts.ts",
    ]);
    expect(hookModel).toContain("digitToBookmarkIndex");
    expect(hookModel).toContain("isTypingTarget");
    expect(hookModel).toContain("isImmersiveViewerActive");
    expect(viewportController).toContain("./useCanvasViewportBookmarkShortcuts");
    expect(viewportController).toContain("captureCurrentViewport(viewportPort)");
    expect(viewportController).toContain("jumpToBookmark(viewportPort, bookmark)");
    expect(canvasView).not.toContain("./hooks/useCanvasViewportBookmarkShortcuts");
    expect(canvasView).not.toContain("captureCurrentViewport");
    expect(canvasView).not.toContain("handleBookmarkKeys");
    expect(canvasView).not.toContain("digitToBookmarkIndex");
  });

  it("keeps Canvas edge-pan gestures in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasEdgePan.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const viewportController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasViewportRuntimeController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasEdgePan(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasEdgePan.ts",
    ]);
    expect(hookModel).toContain("EDGE_PAN_DRAG_THRESHOLD_PX = 4");
    expect(viewportController).toContain("./useCanvasEdgePan");
    expect(canvasView).not.toContain("./hooks/useCanvasEdgePan");
    expect(canvasView).not.toContain("edgePanGestureRef");
    expect(canvasView).not.toContain("suppressNextEdgeClickRef");
    expect(canvasView).not.toContain("react-flow__edge-interaction");
    expect(canvasView).not.toContain("react-flow__edgeupdater");
  });

  it("keeps Canvas space-pan keyboard state in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasSpacePan.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const marqueeView = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasMarqueeSelection.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasSpacePan(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasSpacePan.ts",
    ]);
    expect(hookModel).toContain("isSpacePanKey");
    expect(hookModel).toContain("isTypingTarget");
    expect(hookModel).toContain("isImmersiveViewerActive");
    expect(marqueeView).toContain("./useCanvasSpacePan");
    expect(canvasView).toContain("./hooks/useCanvasSelectionSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasMarqueeSelection");
    expect(canvasView).not.toContain("./hooks/useCanvasSpacePan");
    expect(canvasView).not.toContain("spacePanActiveRef");
    expect(canvasView).not.toContain("isSpacePanKey");
    expect(canvasView).not.toContain("event.code !== 'Space'");
  });

  it("keeps Canvas editing keyboard mapping in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasKeyboardShortcuts.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const commandSurface = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasCommandSurfaceController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasKeyboardShortcuts(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasKeyboardShortcuts.ts",
    ]);
    expect(hookModel).toContain("isTypingTarget");
    expect(hookModel).toContain("isImmersiveViewerActive");
    expect(hookModel).toContain("event.key === 'Escape'");
    expect(commandSurface).toContain("./useCanvasKeyboardShortcuts");
    expect(canvasView).toContain("./hooks/useCanvasCommandSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasKeyboardShortcuts");
    expect(canvasView).not.toContain("document.addEventListener('keydown'");
    expect(canvasView).not.toContain("const isUndo =");
    expect(canvasView).not.toContain("const isOrganize =");
  });

  it("keeps Canvas media surface assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasMediaSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasMediaSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const childControllers = [
      "./useCanvasMediaTransferController",
      "./useCanvasHistoryAssetController",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasMediaSurfaceController.ts",
    ]);
    for (const childController of childControllers) {
      expect(controllerSource).toContain(childController);
      expect(canvasView).not.toContain(
        childController.replace("./", "./hooks/"),
      );
    }
    expect(controllerSource).toContain("'spawnAsset'");
    expect(controllerSource).toContain("...mediaTransfer");
    expect(controllerSource).toContain("spawnAsset,");
    expect(canvasView).toContain("./hooks/useCanvasMediaSurfaceController");
    expect(canvasView).not.toContain("spawnTransferredAsset");
  });

  it("keeps Canvas media paste coordination in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasMediaPaste.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const transferController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasMediaTransferController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasMediaPaste(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasMediaPaste.ts",
    ]);
    expect(hookModel).toContain("resolveClipboardImageFile");
    expect(hookModel).toContain("collectDroppedMediaFiles");
    expect(hookModel).toContain("mediaPasteHandledRef");
    expect(transferController).toContain("./useCanvasMediaPaste");
    expect(canvasView).not.toContain("./hooks/useCanvasMediaPaste");
    expect(canvasView).not.toContain("document.addEventListener('paste'");
    expect(canvasView).not.toContain("pasteImageHandledRef");
    expect(canvasView).not.toContain("resolveClipboardImageFile");
  });

  it("keeps Canvas graph-editing assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasGraphEditingSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasGraphEditingSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const childControllers = [
      "./useCanvasClipboardController",
      "./useCanvasGraphInteractionController",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasGraphEditingSurfaceController.ts",
    ]);
    for (const childController of childControllers) {
      expect(controllerSource).toContain(childController);
      expect(canvasView).not.toContain(
        childController.replace("./", "./hooks/"),
      );
    }
    expect(controllerSource).toContain("'duplicateNodes'");
    expect(controllerSource).toContain("...clipboard");
    expect(controllerSource).toContain("duplicateNodes,");
    expect(canvasView).toContain(
      "./hooks/useCanvasGraphEditingSurfaceController",
    );
    expect(canvasView).not.toContain("duplicateNodes");
  });

  it("keeps Canvas node clipboard state in one controller", () => {
    const builderPath = resolve(
      SRC_ROOT,
      "features/canvas/application/createCanvasClipboardSnapshot.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeClipboard.ts",
    );
    const builderModel = readFileSync(builderPath, "utf8");
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasClipboardController.ts",
    );
    const controllerModel = readFileSync(controllerPath, "utf8");
    const builderForbiddenImports = importSpecifiers(builderPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookForbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const controllerDeclaration = [
      "export function",
      "useCanvasClipboardController(",
    ].join(" ");
    const controllerOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(controllerDeclaration))
      .map(relativeSource)
      .sort();

    expect(builderForbiddenImports).toEqual([]);
    expect(hookForbiddenImports).toEqual([]);
    expect(controllerOwners).toEqual([
      "features/canvas/hooks/useCanvasClipboardController.ts",
    ]);
    expect(builderModel).toContain("cloneCanvasNodeData(node.data)");
    expect(hookModel).toContain("sharedCanvasNodeClipboard");
    expect(hookModel).toContain("queueSnapshotPaste(() =>");
    expect(controllerModel).toContain("./useCanvasNodeClipboard");
    expect(controllerModel).toContain("createCanvasClipboardSnapshot({");
    expect(canvasView).toContain(
      "./hooks/useCanvasGraphEditingSurfaceController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasClipboardController");
    expect(canvasView).not.toContain("./hooks/useCanvasNodeClipboard");
    expect(canvasView).not.toContain("createCanvasClipboardSnapshot({");
    expect(canvasView).not.toContain("sharedNodeClipboard");
    expect(canvasView).not.toContain("copiedSnapshotRef");
    expect(canvasView).not.toContain("pasteFromClipboardRef");
    expect(canvasView).not.toContain("interface ClipboardSnapshot");
  });

  it("keeps Canvas clipboard duplication planning and orchestration outside the view", () => {
    const plannerPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasClipboardDuplication.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasClipboardDuplicationController.ts",
    );
    const plannerModel = readFileSync(plannerPath, "utf8");
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const controllerModel = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasClipboardController.ts",
      ),
      "utf8",
    );
    const plannerForbiddenImports = importSpecifiers(plannerPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const hookForbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const plannerDeclaration = [
      "export function",
      "planCanvasClipboardDuplication(",
    ].join(" ");
    const hookDeclaration = [
      "export function",
      "useCanvasClipboardDuplicationController(",
    ].join(" ");
    const implementationOwners = [plannerDeclaration, hookDeclaration].map(
      (declaration) =>
        sourceFiles(SRC_ROOT)
          .filter((path) => readFileSync(path, "utf8").includes(declaration))
          .map(relativeSource)
          .sort(),
    );

    expect(plannerForbiddenImports).toEqual([]);
    expect(hookForbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      ["features/canvas/application/canvasClipboardDuplication.ts"],
      ["features/canvas/hooks/useCanvasClipboardDuplicationController.ts"],
    ]);
    expect(plannerModel).toContain("DUPLICATION_FALLBACK_MAX_STEP = 16");
    expect(plannerModel).toContain("PASTE_ITERATION_OFFSET = { x: 8, y: 6 }");
    expect(plannerModel).toContain("generationClientSessionId = null");
    expect(plannerModel).toContain("sourceHandle: edge.sourceHandle ?? 'source'");
    expect(hookModel).toContain("const pasteIterationRef = useRef(0)");
    expect(hookModel).toContain("planCanvasClipboardDuplication({");
    expect(hookModel).toContain("commitNodeSelection(");
    expect(hookModel).toContain("void migrateAssets({");
    expect(controllerModel).toContain("./useCanvasClipboardDuplicationController");
    expect(controllerModel).toContain("migrateAssets: migratePastedNodeAssets");
    expect(canvasView).not.toContain("./hooks/useCanvasClipboardDuplicationController");
    expect(canvasView).not.toContain("migrateAssets: migratePastedNodeAssets");
    expect(canvasView).not.toContain("interface DuplicateOptions");
    expect(canvasView).not.toContain("const duplicateNodes = useCallback");
    expect(canvasView).not.toContain("pasteIterationRef");
    expect(canvasView).not.toContain("getNodeSize(");
  });

  it("keeps Canvas Alt-drag copy lifecycle in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasAltDragCopyController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const lifecycleModel = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasDragLifecycleController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasAltDragCopyController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasAltDragCopyController.ts",
    ]);
    expect(hookModel).toContain("ALT_DRAG_COPY_Z_INDEX = 2000");
    expect(hookModel).toContain("const copyStateRef = useRef<");
    expect(hookModel).toContain("createPositionCommits(");
    expect(hookModel).toContain("disableOffsetIteration: true");
    expect(hookModel).toContain("selectNode(state.copiedNodeIds[0])");
    expect(canvasView).toContain(
      "./hooks/useCanvasGraphEditingSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasGraphInteractionController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasAltDragCopyController");
    expect(lifecycleModel).toContain("beginAltDragCopy(event.altKey, node.id)");
    expect(lifecycleModel).toContain("updateAltDragCopy(node.id, node.position)");
    expect(lifecycleModel).toContain("finishAltDragCopy(node.id, node.position)");
    expect(canvasView).not.toContain("isCopyDragActive");
    expect(canvasView).not.toContain("altDragCopyRef");
    expect(canvasView).not.toContain("ALT_DRAG_COPY_Z_INDEX");
    expect(canvasView).not.toContain("sourceToCopyIdMap");
    expect(canvasView).not.toContain("disableOffsetIteration: true");
  });

  it("keeps Canvas group-fit drag lifecycle in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasGroupFitDragController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const lifecycleModel = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasDragLifecycleController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasGroupFitDragController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasGroupFitDragController.ts",
    ]);
    expect(hookModel).toContain("resolveParentGroupIds(");
    expect(hookModel).toContain("const groupIds = new Set<string>()");
    expect(hookModel).toContain("draggedNodeIds.length > 0");
    expect(hookModel).toContain("if (altKey)");
    expect(hookModel).toContain("fitGroupToChildren(groupId)");
    expect(canvasView).toContain(
      "./hooks/useCanvasGraphEditingSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasGraphInteractionController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasGroupFitDragController");
    expect(lifecycleModel).toContain("beginGroupFitNodeDrag(");
    expect(lifecycleModel).toContain("beginGroupFitSelectionDrag(");
    expect(lifecycleModel).toContain("finishGroupFitDrag()");
    expect(lifecycleModel).toContain(
      "handleSelectionDragStop: finishGroupFitDrag",
    );
    expect(canvasView).not.toContain("groupFitDragRef");
    expect(canvasView).not.toContain("fitGroupToChildren(groupId)");
  });

  it("keeps Canvas linked-capture drag lifecycle in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasLinkedCaptureDragController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const lifecycleModel = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasDragLifecycleController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasLinkedCaptureDragController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasLinkedCaptureDragController.ts",
    ]);
    expect(hookModel).toContain("findLinkedCapturePartnerIds(");
    expect(hookModel).toContain("const linkedDragRef = useRef<");
    expect(hookModel).toContain("draggedNodeCount > 1");
    expect(hookModel).toContain("partner && !partner.parentId");
    expect(hookModel).toContain("dragging: true as const");
    expect(canvasView).toContain(
      "./hooks/useCanvasGraphEditingSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasGraphInteractionController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasLinkedCaptureDragController",
    );
    expect(lifecycleModel).toContain("beginLinkedCaptureDrag(");
    expect(lifecycleModel).toContain("updateLinkedCaptureDrag(node.position)");
    expect(lifecycleModel).toContain("finishLinkedCaptureDrag()");
    expect(canvasView).not.toContain("linkedDragRef");
    expect(canvasView).not.toContain("partnerStarts");
    expect(canvasView).not.toContain("findLinkedCapturePartnerIds(");
  });

  it("keeps Canvas node-menu selection orchestration in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeMenuSelectionController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasNodeMenuSelectionController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeMenuSelectionController.ts",
    ]);
    expect(hookModel).toContain("planCanvasNodeMenuSelection({");
    expect(hookModel).toContain("createCanvasSkillNodeData(skill)");
    expect(hookModel).toContain("preferredPosition");
    expect(hookModel).toContain("getLastCanvasPointerPosition()");
    expect(hookModel).toContain("fallbackPosition");
    expect(hookModel).toContain("connectSpawnedNode({");
    expect(hookModel).toContain("closeNodeMenu()");
    expect(canvasView).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasNodeInteractionController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasNodeMenuSelectionController",
    );
    expect(canvasView).toContain("selectNodeType: handleNodeSelect");
    expect(canvasView).toContain("selectSkill: handleSkillSelect");
    expect(canvasView).not.toContain("const finalizeNodeSpawn = useCallback");
    expect(canvasView).not.toContain("const handleNodeSelect = useCallback");
    expect(canvasView).not.toContain("const handleSkillSelect = useCallback");
    expect(canvasView).not.toContain("planCanvasNodeMenuSelection({");
    expect(canvasView).not.toContain("createCanvasSkillNodeData(skill)");
  });

  it("keeps Canvas project assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasProjectSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasProjectSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const childControllers = [
      "./useCanvasProjectContextController",
      "./useCanvasGenerationRecoveryController",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasProjectSurfaceController.ts",
    ]);
    for (const childController of childControllers) {
      expect(controllerSource).toContain(childController);
      expect(canvasView).not.toContain(
        childController.replace("./", "./hooks/"),
      );
    }
    expect(controllerSource).toContain("projectContext.projectId");
    expect(canvasView).toContain("./hooks/useCanvasProjectSurfaceController");
    expect(
      canvasView.match(/useCanvasProjectSurfaceController\(\{/g),
    ).toHaveLength(1);
  });

  it("keeps Canvas Beat Context prefetch projection outside the view", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasBeatContextReferences.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasBeatContextPrefetch.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasProjectContextController.ts",
    );
    const domainModel = readFileSync(domainPath, "utf8");
    const hookModel = readFileSync(hookPath, "utf8");
    const controllerModel = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const domainForbiddenImports = importSpecifiers(domainPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookForbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const controllerForbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const controllerDeclaration = [
      "export function",
      "useCanvasProjectContextController(",
    ].join(" ");
    const controllerOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(controllerDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(domainForbiddenImports).toEqual([]);
    expect(hookForbiddenImports).toEqual([]);
    expect(controllerForbiddenImports).toEqual([]);
    expect(controllerOwners).toEqual([
      "features/canvas/hooks/useCanvasProjectContextController.ts",
    ]);
    expect(domainModel).toContain("collectCanvasBeatContextEpisodeReferences");
    expect(hookModel).toContain("stableReferencesRef");
    expect(controllerModel).toContain("./useCanvasBeatContextPrefetch");
    expect(controllerModel).toContain("prefetchEpisodeBeats");
    expect(controllerModel).toContain("prefetchEpisodeDetail");
    expect(controllerModel).toContain("readUrl().project");
    expect(canvasView).toContain("./hooks/useCanvasProjectSurfaceController");
    expect(canvasView).not.toContain(
      "./hooks/useCanvasProjectContextController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasBeatContextPrefetch");
    expect(canvasView).not.toContain("useQueryClient");
    expect(canvasView).not.toContain("prefetchEpisodeBeats");
    expect(canvasView).not.toContain("prefetchEpisodeDetail");
    expect(canvasView).not.toContain("readUrl().project");
    expect(canvasView).not.toContain("beatContextEpisodesKey");
    expect(canvasView).not.toContain("lastIndexOf(':')");
    expect(canvasView).not.toContain("type BeatContextNodeData");
  });

  it("keeps Canvas mount and unmount effects in one lifecycle hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasLifecycle.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasLifecycle(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasLifecycle.ts",
    ]);
    expect(hookModel).toContain("resolveCanvasOriginViewport(");
    expect(hookModel).toContain("return closeImageViewer;");
    expect(canvasView).toContain("./hooks/useCanvasViewportSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasLifecycle");
    expect(canvasView).not.toContain("useEffect(");
    expect(canvasView).not.toContain("resolveCanvasOriginViewport(");
  });

  it("keeps Canvas selection deletion rules in the domain", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasSelectionDeletion.ts",
    );
    const domainModel = readFileSync(domainPath, "utf8");
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasSelectionCommandController.ts",
    );
    const controllerModel = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(domainPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "resolveCanvasSelectionDeletion(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const controllerForbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );

    expect(forbiddenImports).toEqual([]);
    expect(controllerForbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/domain/canvasSelectionDeletion.ts",
    ]);
    expect(domainModel).toContain("isPresetManagedNode");
    expect(domainModel).toContain("isPresetManagedEdge");
    expect(controllerModel).toContain("resolveCanvasSelectionDeletion({");
    expect(controllerModel).toContain("edges: getCurrentEdges()");
    expect(canvasView).toContain("./hooks/useCanvasSelectionSurfaceController");
    expect(canvasView).not.toContain(
      "./hooks/useCanvasSelectionCommandController",
    );
    expect(canvasView).not.toContain("resolveCanvasSelectionDeletion({");
    expect(canvasView).not.toContain("const deleteSelectedElements = useCallback");
    expect(canvasView).not.toContain("const deletableEdgeIds");
    expect(canvasView).not.toContain("const hasSelectedEdge");
    expect(canvasView).not.toContain("const idsToDelete");
  });

  it("keeps preset-managed Canvas change guards in the application layer", () => {
    const guardPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasManagedChangeGuard.ts",
    );
    const guardModel = readFileSync(guardPath, "utf8");
    const graphChangeController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasGraphChangeController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(guardPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );

    expect(forbiddenImports).toEqual([]);
    expect(guardModel).toContain("filterPresetManagedNodeChanges");
    expect(guardModel).toContain("filterPresetManagedEdgeChanges");
    expect(graphChangeController).toContain(
      "filterPresetManagedNodeChanges(nodes, changes)",
    );
    expect(graphChangeController).toContain(
      "filterPresetManagedEdgeChanges(edges, changes)",
    );
    expect(canvasView).not.toContain("filterPresetManagedNodeChanges(");
    expect(canvasView).not.toContain("filterPresetManagedEdgeChanges(");
    expect(canvasView).not.toContain("const lockedNodeIds");
    expect(canvasView).not.toContain("const lockedEdgeIds");
  });

  it("keeps Canvas graph-change orchestration in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasGraphChangeController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasGraphChangeController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasGraphChangeController.ts",
    ]);
    expect(hookModel).toContain("alignNodeChanges({");
    expect(hookModel).toContain("copyDragActive: isCopyDragActive()");
    expect(hookModel).toContain("canDeleteCanvasEdge(edge)");
    expect(hookModel).toContain("deleteEdge(edge.id)");
    expect(hookModel).not.toContain("isPresetManagedEdge(");
    expect(canvasView).toContain(
      "./hooks/useCanvasGraphEditingSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasGraphInteractionController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasGraphChangeController");
    expect(canvasView).not.toContain("const handleNodesChange = useCallback");
    expect(canvasView).not.toContain("const handleEdgesChange = useCallback");
    expect(canvasView).not.toContain("const handleEdgeDoubleClick = useCallback");
    expect(canvasView).not.toContain("isPresetManagedEdge(");
  });

  it("keeps Canvas snap-alignment orchestration in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasSnapAlignment.ts",
    );
    const computePath = resolve(
      SRC_ROOT,
      "features/canvas/snap-align/computeSnapAlign.ts",
    );
    const storePath = resolve(
      SRC_ROOT,
      "features/canvas/snap-align/snapAlignStore.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const computeModel = readFileSync(computePath, "utf8");
    const storeModel = readFileSync(storePath, "utf8");
    const graphChangeController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasGraphChangeController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );

    expect(forbiddenImports).toEqual([]);
    expect(hookModel).toContain("snapAlignIndexRef");
    expect(hookModel).toContain("computeSnapAlignFromIndex(");
    expect(computeModel).toContain("export interface SnapAlignGuides");
    expect(computeModel).not.toContain("./snapAlignStore");
    expect(storeModel).toContain("from './computeSnapAlign'");
    expect(canvasView).toContain("./hooks/useCanvasViewportSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasSnapAlignment");
    expect(graphChangeController).toContain("alignNodeChanges({");
    expect(canvasView).not.toContain("alignNodeChanges({");
    expect(canvasView).not.toContain("snapAlignIndexRef");
    expect(canvasView).not.toContain("const draggingPositionChanges");
    expect(canvasView).not.toContain("computeSnapAlignFromIndex(");
  });

  it("keeps Canvas pane context-menu state in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasPaneContextMenu.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const controllerModel = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasContextMenuController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const commandSurface = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasCommandSurfaceController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasPaneContextMenu(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasPaneContextMenu.ts",
    ]);
    expect(hookModel).toContain("isCanvasPaneTarget");
    expect(controllerModel).toContain("./useCanvasPaneContextMenu");
    expect(commandSurface).toContain("./useCanvasContextMenuController");
    expect(canvasView).not.toContain("./hooks/useCanvasContextMenuController");
    expect(canvasView).not.toContain("./hooks/useCanvasPaneContextMenu");
    expect(canvasView).not.toContain("const [contextMenu, setContextMenu]");
    expect(canvasView).not.toContain("addEventListener('contextmenu'");
    expect(canvasView).not.toContain("setContextMenu(");
  });

  it("keeps Canvas node-menu pointer and shortcut state in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeMenuShortcut.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasNodeMenuShortcut(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeMenuShortcut.ts",
    ]);
    expect(hookModel).toContain("isCanvasPaneTarget");
    expect(hookModel).toContain("isTypingTarget");
    expect(hookModel).toContain("isImmersiveViewerActive");
    expect(canvasView).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasNodeInteractionController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasNodeMenuShortcut");
    expect(canvasView).not.toContain("lastCanvasPointerClientPositionRef");
    expect(canvasView).not.toContain("ReactPointerEvent");
    expect(canvasView).not.toContain("event.key !== 'Tab'");
    expect(canvasView).not.toContain(".react-flow__pane");
  });

  it("keeps Canvas viewport metrics in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasViewportMetrics.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const viewportControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasViewportRuntimeController.ts",
    );
    const viewportController = readFileSync(viewportControllerPath, "utf8");
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasViewportMetrics(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasViewportMetrics.ts",
    ]);
    expect(hookModel).toContain("--ai-anime-canvas-zoom");
    expect(hookModel).toContain("new ResizeObserver(updateSize)");
    const controllerDeclaration = [
      "export function",
      "useCanvasViewportRuntimeController(",
    ].join(" ");
    const controllerOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(controllerDeclaration))
      .map(relativeSource)
      .sort();

    expect(controllerOwners).toEqual([
      "features/canvas/hooks/useCanvasViewportRuntimeController.ts",
    ]);
    expect(viewportController).toContain("./useCanvasViewportMetrics");
    expect(canvasView).not.toContain("./hooks/useCanvasViewportMetrics");
    expect(canvasView).not.toContain("style.setProperty('--ai-anime-canvas-zoom'");
    expect(canvasView).not.toContain("new ResizeObserver(");
  });

  it("keeps Canvas selection surface assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasSelectionSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasSelectionSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const childControllers = [
      "./useCanvasMarqueeSelection",
      "./useCanvasSelectionSync",
      "./useCanvasSelectionCommandController",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasSelectionSurfaceController.ts",
    ]);
    for (const childController of childControllers) {
      expect(controllerSource).toContain(childController);
      expect(canvasView).not.toContain(
        childController.replace("./", "./hooks/"),
      );
    }
    expect(controllerSource).toContain("nativeSelectionStore.setState({");
    expect(controllerSource).toContain("() => getGraph().edges");
    expect(canvasView).toContain("./hooks/useCanvasSelectionSurfaceController");
    expect(canvasView).not.toContain("setNativeSelectionActive");
    expect(canvasView).not.toContain("getCurrentSelectionEdges");
  });

  it("keeps Canvas selected-node projection in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasSelectionSync.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasSelectionSync(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasSelectionSync.ts",
    ]);
    expect(hookModel).toContain("CANVAS_NODE_TYPES.upload");
    expect(canvasView).toContain("./hooks/useCanvasSelectionSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasSelectionSync");
    expect(canvasView).not.toContain("selectedNodeIds.length === 1");
    expect(canvasView).not.toContain(
      "nodes.filter((node) => Boolean(node.selected)).map((node) => node.id)",
    );
  });

  it("keeps Canvas skill-registry loading in one presentation hook", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/skillCatalog.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/skillCatalog.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneSkillCatalogGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/catalogComposition.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasSkillRegistry.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeCatalogController.ts",
    );
    const skillNodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useSkillNodeController.ts",
    );
    const legacyApiPath = resolve(SRC_ROOT, "api/skills.ts");
    const domainModel = readFileSync(domainPath, "utf8");
    const adapterModel = readFileSync(adapterPath, "utf8");
    const compositionModel = readFileSync(compositionPath, "utf8");
    const hookModel = readFileSync(hookPath, "utf8");
    const controllerModel = readFileSync(controllerPath, "utf8");
    const skillNodeModel = readFileSync(skillNodePath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasSkillRegistry(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();
    const controllerDeclaration = [
      "export function",
      "useCanvasNodeCatalogController(",
    ].join(" ");
    const controllerOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(controllerDeclaration),
      )
      .map(relativeSource)
      .sort();
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          'apiCall<SkillDefinition[]>("freezone/skills")',
        ),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(new Set(importSpecifiers(domainPath))).toEqual(
      new Set(["@/features/freezone/public"]),
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["@/features/freezone/public"]),
    );
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "@/features/freezone/public",
        "../application/skillCatalog",
        "../domain/skillCatalog",
      ]),
    );
    expect(domainModel).toContain("normalizeCanvasSkillCatalog(");
    expect(adapterModel).toContain("REGISTRY_CACHE_TTL_MS");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneSkillCatalogGateway.ts",
    ]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasSkillRegistry.ts",
    ]);
    expect(controllerOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeCatalogController.ts",
    ]);
    expect(hookModel).toContain("loadSkillRegistry()");
    expect(hookModel).toContain("cancelled = true");
    expect(compositionModel).toContain("freezoneSkillCatalogGateway.listSkills()");
    expect(controllerModel).toContain("./useCanvasSkillRegistry");
    expect(controllerModel).toContain("loadCanvasSkillRegistry");
    expect(controllerModel).toContain("nodeCatalog.getDefinition");
    expect(controllerModel).toContain("translateSkillName");
    expect(skillNodeModel).toContain(
      "useCanvasSkillRegistry(\n    loadCanvasSkillRegistry,",
    );
    expect(skillNodeModel).not.toContain("getSkillRegistry");
    expect(existsSync(legacyApiPath)).toBe(false);
    expect(canvasView).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasNodeCatalogController");
    expect(canvasView).not.toContain("./hooks/useCanvasSkillRegistry");
    expect(canvasView).not.toContain("getSkillRegistry");
    expect(canvasView).not.toContain("nodeCatalog");
    expect(canvasView).not.toContain("translateSkillName");
    expect(canvasView).not.toContain("setSkillRegistry");
    expect(canvasView).not.toContain("new Map(skillRegistry.map");
  });

  it("keeps Canvas viewer assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasViewerSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasViewerSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasViewerSurfaceController.ts",
    ]);
    expect(controllerSource).toContain("@/features/canvas/canvasStore");
    expect(controllerSource).toContain("./useCanvasExternalDialogs");
    expect(controllerSource).toContain("imageViewerProps:");
    expect(controllerSource).toContain("videoViewerProps:");
    expect(canvasView).toContain("./hooks/useCanvasViewerSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasExternalDialogs");
    expect(canvasView).not.toContain("state.imageViewer");
    expect(canvasView).not.toContain("videoViewer.isOpen");
  });

  it("keeps Canvas external dialog subscriptions in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasExternalDialogs.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasExternalDialogs(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasExternalDialogs.ts",
    ]);
    expect(hookModel).toContain("eventPort.subscribe('tool-dialog/open'");
    expect(hookModel).toContain("const unsubscribeVideoOpen = eventPort.subscribe(");
    expect(hookModel).toContain("'video-viewer/open'");
    expect(canvasView).toContain("./hooks/useCanvasViewerSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasExternalDialogs");
    expect(canvasView).not.toContain("setVideoViewer");
    expect(canvasView).not.toContain("canvasEventBus.subscribe('tool-dialog/open'");
  });

  it("keeps Canvas pending-node focus in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasPendingNodeFocus.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeFocusController.ts",
    );
    const controllerModel = readFileSync(controllerPath, "utf8");
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasPendingNodeFocus(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();
    const controllerDeclaration = [
      "export function",
      "useCanvasNodeFocusController(",
    ].join(" ");
    const controllerOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(controllerDeclaration))
      .map(relativeSource)
      .sort();
    const forbiddenControllerImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );

    expect(forbiddenImports).toEqual([]);
    expect(forbiddenControllerImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasPendingNodeFocus.ts",
    ]);
    expect(controllerOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeFocusController.ts",
    ]);
    expect(hookModel).toContain("getNodeSize(target)");
    expect(hookModel).toContain("viewportPort.getNodeAbsolutePosition");
    expect(controllerModel).toContain("./useCanvasPendingNodeFocus");
    expect(controllerModel).toContain("runtimePort.getInternalNode(nodeId)");
    expect(controllerModel).toContain("runtimePort.setCenter(");
    expect(canvasView).toContain("./hooks/useCanvasViewportSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasNodeFocusController");
    expect(canvasView).not.toContain("./hooks/useCanvasPendingNodeFocus");
    expect(canvasView).not.toContain("nodeFocusViewportPort");
    expect(canvasView).not.toContain("getInternalNode(");
    expect(canvasView).not.toContain("Math.max(currentZoom, 0.6)");
  });

  it("keeps Canvas persistence triggered by useCanvasSync", () => {
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const canvasSync = readFileSync(
      resolve(SRC_ROOT, "features/freezone/hooks/useCanvasSync.ts"),
      "utf8",
    );
    const saveController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/freezone/hooks/useCanvasSaveController.ts",
      ),
      "utf8",
    );

    expect(canvasView).not.toContain("persistCanvasSnapshot");
    expect(canvasView).not.toContain("scheduleCanvasPersist");
    expect(canvasView).not.toContain("saveTimerRef");
    expect(canvasView).not.toContain("isRestoringCanvasRef");
    expect(canvasSync).toContain("useCanvasSaveController({");
    expect(canvasSync).not.toContain("useCanvasStore.subscribe(");
    expect(saveController).toContain(
      "const unsubscribeCanvas = useCanvasStore.subscribe((state, previous) =>",
    );
    expect(saveController).toContain("void saveCurrent();");
  });

  it("separates Freezone canvas sync decisions from its presentation hook", () => {
    const legacyCorePath = resolve(
      SRC_ROOT,
      "features/freezone/canvasSyncCore.ts",
    );
    const legacyHookPath = resolve(
      SRC_ROOT,
      "features/freezone/useCanvasSync.ts",
    );
    const corePath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasSyncCore.ts",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const runtimeBridgePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasRuntimeBridge.ts",
    );
    const hydrationLifecyclePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
    );
    const shellPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useFreezoneShellController.ts",
    );
    const coreSource = readFileSync(corePath, "utf8");
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const runtimeBridgeSource = readFileSync(runtimeBridgePath, "utf8");
    const hydrationLifecycleSource = readFileSync(
      hydrationLifecyclePath,
      "utf8",
    );
    const forbiddenCoreImports = importSpecifiers(corePath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/features/freezone/infrastructure/") ||
        specifier === "@/features/freezone/composition" ||
        specifier.startsWith("@/shared/api/"),
    );
    const declarations = [
      ["export function", "decideSaveAction("].join(" "),
      ["export function", "canvasEnvelopeFromRemote("].join(" "),
      ["export function", "saveErrorStatusAndBody("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(existsSync(legacyCorePath)).toBe(false);
    expect(existsSync(legacyHookPath)).toBe(false);
    expect(forbiddenCoreImports).toEqual([]);
    expect(coreSource).not.toContain("window.");
    expect(coreSource).not.toContain("document.");
    expect(coreSource).not.toContain("localStorage");
    expect(declarationOwners).toEqual([
      ["features/freezone/application/canvasSyncCore.ts"],
      ["features/freezone/application/canvasSyncCore.ts"],
      ["features/freezone/application/canvasSyncCore.ts"],
    ]);
    expect(importSpecifiers(runtimeBridgePath)).toContain(
      "../application/canvasSyncCore",
    );
    expect(importSpecifiers(hydrationLifecyclePath)).toContain(
      "../application/canvasSyncCore",
    );
    expect(importSpecifiers(syncHookPath)).not.toContain(
      "../application/canvasSyncCore",
    );
    expect(runtimeBridgeSource).not.toContain(
      "function canvasEnvelopeFromRemote(",
    );
    expect(hydrationLifecycleSource).not.toContain(
      "function canvasEnvelopeFromRemote(",
    );
    expect(syncHookSource).not.toContain("function saveErrorStatusAndBody(");
    expect(importSpecifiers(shellPath)).toContain("./useCanvasSync");
  });

  it("keeps canvas save orchestration in Freezone application", () => {
    const savePath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasSave.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasSaveComposition.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSaveController.ts",
    );
    const saveSource = readFileSync(savePath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const declaration = [
      "export function",
      "createCanvasSaveScheduler(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(
      importSpecifiers(savePath).filter(
        (specifier) =>
          specifier === "react" ||
          specifier.startsWith("react/") ||
          specifier === "@xyflow/react" ||
          specifier.startsWith("@xyflow/react/") ||
          specifier === "zustand" ||
          specifier.startsWith("zustand/") ||
          specifier.startsWith("@/features/freezone/infrastructure/") ||
          specifier.startsWith("@/features/freezone/composition") ||
          specifier.startsWith("@/shared/api/"),
      ),
    ).toEqual([]);
    expect(saveSource).not.toContain("window.");
    expect(saveSource).not.toContain("document.");
    expect(saveSource).not.toContain("localStorage");
    expect(declarationOwners).toEqual([
      "features/freezone/application/canvasSave.ts",
    ]);
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "@/features/canvas/canvasStore",
        "@/features/canvas/composition",
        "./application/canvasSave",
        "./canvasConflictRecoveryComposition",
        "./canvasDraftComposition",
      ]),
    );
    expect(importSpecifiers(controllerPath)).toContain(
      "../canvasSaveComposition",
    );
    expect(controllerSource).not.toContain("async function scheduleSave(");
    expect(controllerSource).not.toContain("async function performSave(");
    expect(controllerSource).not.toContain("function consumeSaveResponse(");
    expect(controllerSource).not.toContain("async function handleSaveError(");
    expect(controllerSource).not.toContain("LOCK_BUSY_MAX_RETRIES");
  });

  it("keeps canvas unload saves behind application and transport ports", () => {
    const unloadPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasUnloadSave.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasUnloadSaveComposition.ts",
    );
    const gatewayPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneCanvasStorageGateway.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSaveController.ts",
    );
    const unloadSource = readFileSync(unloadPath, "utf8");
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const declaration = [
      "export function",
      "createCanvasUnloadSaver(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(
      importSpecifiers(unloadPath).filter(
        (specifier) =>
          specifier === "react" ||
          specifier.startsWith("react/") ||
          specifier === "@xyflow/react" ||
          specifier.startsWith("@xyflow/react/") ||
          specifier === "zustand" ||
          specifier.startsWith("zustand/") ||
          specifier.startsWith("@/features/freezone/infrastructure/") ||
          specifier === "@/features/canvas/composition" ||
          specifier.startsWith("@/shared/api/"),
      ),
    ).toEqual([]);
    expect(unloadSource).not.toContain("window.");
    expect(unloadSource).not.toContain("document.");
    expect(unloadSource).not.toContain("fetch(");
    expect(declarationOwners).toEqual([
      "features/freezone/application/canvasUnloadSave.ts",
    ]);
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "@/features/canvas/composition",
        "./application/canvasUnloadSave",
        "./canvasSyncComposition",
      ]),
    );
    expect(gatewaySource).toContain("saveCanvasKeepalive(params)");
    expect(gatewaySource).toContain("keepalive: true");
    expect(importSpecifiers(controllerPath)).toContain(
      "../canvasUnloadSaveComposition",
    );
    expect(controllerSource).not.toContain("fetch(");
    expect(controllerSource).not.toContain("keepalive: true");
    expect(controllerSource).not.toContain("buildSavePayload(");
    expect(controllerSource).not.toContain("decideSaveAction(");
  });

  it("keeps canvas conflict recovery in one Freezone application service", () => {
    const recoveryPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasConflictRecovery.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasConflictRecoveryComposition.ts",
    );
    const saveCompositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasSaveComposition.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasConflictController.ts",
    );
    const recoverySource = readFileSync(recoveryPath, "utf8");
    const hookSource = readFileSync(hookPath, "utf8");
    const declaration = [
      "export function",
      "createCanvasConflictRecovery(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(
      importSpecifiers(recoveryPath).filter(
        (specifier) =>
          specifier === "react" ||
          specifier.startsWith("react/") ||
          specifier === "@xyflow/react" ||
          specifier.startsWith("@xyflow/react/") ||
          specifier === "zustand" ||
          specifier.startsWith("zustand/") ||
          specifier.startsWith("@/features/freezone/infrastructure/") ||
          specifier === "@/features/canvas/composition" ||
          specifier.startsWith("@/shared/api/"),
      ),
    ).toEqual([]);
    expect(recoverySource).not.toContain("window.");
    expect(recoverySource).not.toContain("document.");
    expect(recoverySource).not.toContain("localStorage");
    expect(declarationOwners).toEqual([
      "features/freezone/application/canvasConflictRecovery.ts",
    ]);
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "@/features/canvas/composition",
        "./application/canvasConflictRecovery",
        "./application/canvasSyncStorage",
        "./canvasDraftComposition",
        "./canvasSyncComposition",
      ]),
    );
    expect(importSpecifiers(saveCompositionPath)).toContain(
      "./canvasConflictRecoveryComposition",
    );
    expect(importSpecifiers(controllerPath)).toContain(
      "../canvasConflictRecoveryComposition",
    );
    expect(importSpecifiers(hookPath)).toContain(
      "./useCanvasConflictController",
    );
    expect(importSpecifiers(hookPath)).not.toContain(
      "../canvasConflictRecoveryComposition",
    );
    expect(hookSource).not.toContain("snapshotConflict");
    expect(hookSource).not.toContain("buildConflictCopyCanvasId");
    expect(hookSource).not.toContain("buildConflictCopyMetadata");
    expect(hookSource).not.toContain(
      "canvasSyncStorageGateway.readConflictSnapshot",
    );
    expect(hookSource).not.toContain(
      "canvasSyncStorageGateway.writeConflictSnapshot",
    );
    expect(hookSource).not.toContain(
      "canvasSyncStorageGateway.clearConflictSnapshot",
    );
  });

  it("keeps canvas conflict commands in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasConflictController.ts",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasConflictController.test.tsx",
    );
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasConflictController(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/freezone/domain/canvasStorage",
        "../application/canvasSyncStorage",
        "../canvasConflictRecoveryComposition",
        "../shotMetadataComposition",
        "./useCanvasSaveController",
      ]),
    );
    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasConflictController.ts",
    ]);
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasConflictController",
    );
    expect(testSource).toContain('from "./useCanvasConflictController"');
    expect(syncHookSource).not.toContain("canvasConflictRecovery.discard(");
    expect(syncHookSource).not.toContain("canvasConflictRecovery.saveCopy(");
    expect(syncHookSource).not.toContain("canvasConflictRecovery.readSnapshot(");
    expect(syncHookSource).not.toContain("canvasConflictRecovery.clearSnapshot(");
  });

  it("keeps mainline preset refresh orchestration in Freezone application", () => {
    const refreshPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasPresetRefresh.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasPresetRefreshComposition.ts",
    );
    const hydrationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasSyncHydration.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasPresetRefreshController.ts",
    );
    const refreshSource = readFileSync(refreshPath, "utf8");
    const hydrationSource = readFileSync(hydrationPath, "utf8");
    const hookSource = readFileSync(hookPath, "utf8");
    const declaration = [
      "export function",
      "createCanvasPresetRefresher(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(
      importSpecifiers(refreshPath).filter(
        (specifier) =>
          specifier === "react" ||
          specifier.startsWith("react/") ||
          specifier === "@xyflow/react" ||
          specifier.startsWith("@xyflow/react/") ||
          specifier === "zustand" ||
          specifier.startsWith("zustand/") ||
          specifier.startsWith("@/features/freezone/infrastructure/") ||
          specifier === "@/features/canvas/composition" ||
          specifier.startsWith("@/shared/api/"),
      ),
    ).toEqual([]);
    expect(refreshSource).not.toContain("window.");
    expect(refreshSource).not.toContain("document.");
    expect(refreshSource).not.toContain("localStorage");
    expect(declarationOwners).toEqual([
      "features/freezone/application/canvasPresetRefresh.ts",
    ]);
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "@/features/canvas/composition",
        "./application/canvasPresetRefresh",
      ]),
    );
    expect(importSpecifiers(controllerPath)).toContain(
      "../canvasPresetRefreshComposition",
    );
    expect(importSpecifiers(hookPath)).toContain(
      "./useCanvasPresetRefreshController",
    );
    expect(importSpecifiers(hookPath)).not.toContain(
      "../canvasPresetRefreshComposition",
    );
    for (const legacyName of [
      "shouldAbortBestEffortPresetRefresh",
      "shouldDeferPresetRefreshUntilReady",
      "shouldFlushBeforePresetRefresh",
    ]) {
      expect(hydrationSource).not.toContain(legacyName);
      expect(hookSource).not.toContain(legacyName);
    }
    expect(hookSource).not.toContain("presetRequestFromMetadata");
    expect(hookSource).not.toContain("createCanvasFromPreset");
    expect(hookSource).not.toContain("saveErrorStatusAndBody");
  });

  it("keeps canvas preset refresh commands in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasPresetRefreshController.ts",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasPresetRefreshController.test.tsx",
    );
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasPresetRefreshController(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/canvasStore",
        "../application/canvasSyncStorage",
        "../canvasPresetRefreshComposition",
      ]),
    );
    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasPresetRefreshController.ts",
    ]);
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasPresetRefreshController",
    );
    expect(testSource).toContain('from "./useCanvasPresetRefreshController"');
    expect(syncHookSource).not.toContain("refreshCanvasPreset({");
    expect(syncHookSource).not.toContain("userEditsSinceHydrate:");
    expect(syncHookSource).not.toContain("preset: metadata?.preset");
  });

  it("keeps asset library Director World modeling in one Freezone domain module", () => {
    const modelPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/assetLibraryModel.ts",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.tsx",
    );
    const panelViewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanelView.tsx",
    );
    const projectionPath = resolve(
      SRC_ROOT,
      "features/freezone/application/assetLibraryProjection.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/assetLibraryModel.test.ts",
    );
    const dragTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/canvas/asset-drag-director-bundle.test.ts",
    );
    const modelSource = readFileSync(modelPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const panelViewSource = readFileSync(panelViewPath, "utf8");
    const projectionSource = readFileSync(projectionPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const dragTestSource = readFileSync(dragTestPath, "utf8");
    const declarations = [
      ["export const", "SCENE_DIRECTOR_WORLD_ROLE"].join(" "),
      ["export interface", "LibraryAsset {"].join(" "),
      ["export function", "directorControlBundleFromAssetSource("].join(" "),
      ["export function", "assetDropMediaType("].join(" "),
      ["export function", "isThreeDAsset("].join(" "),
      ["export function", "finalizeDirectorWorldAssets("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const forbiddenModelImports = importSpecifiers(modelPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier === "@/features/canvas/canvasStore" ||
        specifier === "@/features/canvas/assetDropStore" ||
        specifier === "@/features/freezone/composition" ||
        specifier.startsWith("@/features/freezone/infrastructure/") ||
        specifier.startsWith("@/shared/api/") ||
        specifier.startsWith("@/api/"),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/domain/assetLibraryModel.ts",
      ]),
    );
    expect(forbiddenModelImports).toEqual([]);
    expect(modelSource).not.toContain("window.");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("localStorage");
    expect(importSpecifiers(panelViewPath)).toContain(
      "../domain/assetLibraryModel",
    );
    expect(importSpecifiers(projectionPath)).toContain(
      "../domain/assetLibraryModel",
    );
    expect(projectionSource).toContain("finalizeDirectorWorldAssets(out)");
    for (const legacyDeclaration of [
      ["function", "attachThreeDCovers("].join(" "),
      ["function", "coalesceSceneDirectorWorldAssets("].join(" "),
      ["function", "createSceneDirectorWorldAsset("].join(" "),
      ["function", "directorWorldSourceFromSceneAsset("].join(" "),
      ["function", "assetDropMediaType("].join(" "),
      ["function", "isThreeDAsset("].join(" "),
      ["export function", "directorControlBundleFromAssetSource("].join(" "),
      ["interface", "LibraryAsset {"].join(" "),
      ["type", "AssetTab ="].join(" "),
    ]) {
      expect(panelSource).not.toContain(legacyDeclaration);
      expect(panelViewSource).not.toContain(legacyDeclaration);
    }
    expect(modelTestSource).toContain('from "./assetLibraryModel"');
    expect(dragTestSource).toContain(
      "@/features/freezone/domain/assetLibraryModel",
    );
    expect(dragTestSource).not.toContain(
      "@/features/freezone/presentation/AssetLibraryPanel",
    );
  });

  it("keeps asset library catalog projection in one Freezone application module", () => {
    const projectionPath = resolve(
      SRC_ROOT,
      "features/freezone/application/assetLibraryProjection.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useAssetLibraryCatalogController.ts",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/application/assetLibraryProjection.test.ts",
    );
    const projectionSource = readFileSync(projectionPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export function", "buildLibraryAssets("].join(" "),
      ["function", "isUsableAsset("].join(" "),
      ["function", "isDirectorControlRef("].join(" "),
      ["function", "fromFreezoneAsset("].join(" "),
      ["function", "normalizeMainlineAssetLabel("].join(" "),
      ["function", "libraryAssetDedupKey("].join(" "),
      ["function", "isBeatScopedLibraryAsset("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/application/assetLibraryProjection.ts",
      ]),
    );
    expect(new Set(importSpecifiers(projectionPath))).toEqual(
      new Set([
        "../domain/assetLibraryModel",
        "../domain/beatContext",
        "../domain/mainlineContext",
      ]),
    );
    expect(projectionSource).not.toContain("window.");
    expect(projectionSource).not.toContain("document.");
    expect(projectionSource).not.toContain("localStorage");
    expect(projectionSource).not.toContain("@/features/freezone/composition");
    expect(projectionSource).not.toContain("@/features/freezone/infrastructure/");
    expect(projectionSource).not.toContain("@/shared/api/");
    expect(importSpecifiers(controllerPath)).toContain(
      "@/features/freezone/application/assetLibraryProjection",
    );
    expect(importSpecifiers(panelPath)).not.toContain(
      "@/features/freezone/application/assetLibraryProjection",
    );
    for (const legacyDeclaration of declarations) {
      expect(panelSource).not.toContain(legacyDeclaration);
      expect(controllerSource).not.toContain(legacyDeclaration);
    }
    expect(panelSource).not.toContain("BEAT_SCOPED_LIBRARY_ASSET_ROLES");
    expect(panelSource).not.toContain("BEAT_SCOPED_LIBRARY_ASSET_KINDS");
    expect(testSource).toContain('from "./assetLibraryProjection"');
  });

  it("keeps asset library query lifecycle in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useAssetLibraryCatalogController.ts",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useAssetLibraryCatalogController.test.tsx",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export function", "useAssetLibraryCatalogController("].join(" "),
      ["function", "errorMessage("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(resolve(SRC_ROOT, "features/freezone"))
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/hooks/useAssetLibraryCatalogController.ts",
      ]),
    );
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/freezone/application/assetLibraryProjection",
        "@/features/freezone/composition",
        "../domain/assetLibraryModel",
        "../presentation/assetLibraryViewModel",
      ]),
    );
    expect(controllerSource).not.toContain("zustand");
    expect(controllerSource).not.toContain("useAssetDropStore");
    expect(controllerSource).not.toContain("@/features/canvas/canvasStore");
    expect(controllerSource).not.toContain("@/features/freezone/infrastructure/");
    expect(controllerSource).not.toContain("@/shared/api/");
    expect(controllerSource).toContain("projectAssetsQuery.refetch()");
    expect(controllerSource).toContain("beatContextQuery.refetch()");
    expect(controllerSource).toContain("buildLibraryAssets({");
    expect(importSpecifiers(panelPath)).toContain(
      "../hooks/useAssetLibraryCatalogController",
    );
    for (const legacyOwner of [
      "useFreezoneProjectAssets",
      "useFreezoneBeatContext",
      "buildLibraryAssets",
      "projectAssetsReloadKey",
      "beatContextReloadKey",
      "previousProjectAssetsReloadKeyRef",
      "previousBeatContextReloadKeyRef",
      "beatContextEnabled",
      "projectAssetsError",
      "beatContextError",
      "assetPreviewCacheToken",
    ]) {
      expect(panelSource).not.toContain(legacyOwner);
    }
    expect(testSource).toContain(
      'from "./useAssetLibraryCatalogController"',
    );
  });

  it("keeps asset library presentation rules in one pure view model", () => {
    const viewModelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/assetLibraryViewModel.ts",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.tsx",
    );
    const panelViewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanelView.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/assetLibraryViewModel.test.ts",
    );
    const viewModelSource = readFileSync(viewModelPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const panelViewSource = readFileSync(panelViewPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export function", "beatAssetItems("].join(" "),
      ["export function", "sceneAssetTypeBadge("].join(" "),
      ["export function", "groupBeatAssets("].join(" "),
      ["function", "beatGroupForAsset("].join(" "),
      ["export function", "countAssetsForTab("].join(" "),
      ["export function", "buildAssetLibraryTabs("].join(" "),
      ["export function", "filterAssetLibraryAssets("].join(" "),
      ["export function", "resolveCanvasKind("].join(" "),
      ["export function", "resolveCurrentEpisode("].join(" "),
      ["export function", "resolveCurrentBeat("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/assetLibraryViewModel.ts",
      ]),
    );
    expect(importSpecifiers(viewModelPath)).toEqual([
      "../domain/assetLibraryModel",
    ]);
    expect(viewModelSource).not.toContain("react");
    expect(viewModelSource).not.toContain("zustand");
    expect(viewModelSource).not.toContain("window.");
    expect(viewModelSource).not.toContain("document.");
    expect(viewModelSource).not.toContain("localStorage");
    expect(viewModelSource).not.toContain("@/features/freezone/composition");
    expect(viewModelSource).not.toContain("@/shared/api/");
    expect(importSpecifiers(panelPath)).toContain(
      "./assetLibraryViewModel",
    );
    expect(importSpecifiers(panelViewPath)).toContain(
      "./assetLibraryViewModel",
    );
    expect(panelViewSource).toContain(
      "buildAssetLibraryTabs(canvasKind, catalog.assets)",
    );
    expect(panelViewSource).toContain(
      "filterAssetLibraryAssets(catalog.assets, tab, query)",
    );
    for (const legacyDeclaration of declarations) {
      expect(panelSource).not.toContain(legacyDeclaration);
      expect(panelViewSource).not.toContain(legacyDeclaration);
    }
    expect(panelSource).not.toContain("ROLE_LABELS");
    expect(panelSource).not.toContain("ROLE_ORDER");
    expect(panelSource).not.toContain("beatTabLabel");
    expect(panelSource).not.toContain("source.from_beat_context");
    expect(panelSource).not.toContain("countAssetsForTab(");
    expect(panelViewSource).not.toContain("countAssetsForTab(");
    expect(testSource).toContain('from "./assetLibraryViewModel"');
  });

  it("keeps canvas browser presentation rules in one pure view model", () => {
    const viewModelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/canvasBrowserViewModel.ts",
    );
    const tabPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CanvasesTab.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CanvasBrowserView.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "__tests__/features/freezone/canvases-tab.test.ts",
    );
    const viewModelSource = readFileSync(viewModelPath, "utf8");
    const tabSource = readFileSync(tabPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export function", "buildCanvasBrowserSections("].join(" "),
      ["export function", "canDeleteCanvasSummary("].join(" "),
      ["export function", "canvasKindFromSummary("].join(" "),
      ["export function", "displayNameForCanvasSummary("].join(" "),
      ["export function", "findDuplicateCanvasName("].join(" "),
      ["export function", "formatCanvasRelativeTime("].join(" "),
      ["export function", "isConflictCopyCanvas("].join(" "),
      ["export function", "sourceCanvasIdFromSummary("].join(" "),
      ["export function", "userCreatedCanvasId("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/canvasBrowserViewModel.ts",
      ]),
    );
    expect(new Set(importSpecifiers(viewModelPath))).toEqual(
      new Set(["../domain/canvasIdentity", "../domain/canvasStorage"]),
    );
    expect(viewModelSource).not.toContain("react");
    expect(viewModelSource).not.toContain("zustand");
    expect(viewModelSource).not.toContain("window.");
    expect(viewModelSource).not.toContain("document.");
    expect(viewModelSource).not.toContain("localStorage");
    expect(viewModelSource).not.toContain("@/features/canvas/composition");
    expect(viewModelSource).not.toContain("@/shared/api/");
    expect(importSpecifiers(viewPath)).toContain(
      "./canvasBrowserViewModel",
    );
    expect(importSpecifiers(tabPath)).not.toContain(
      "./canvasBrowserViewModel",
    );
    for (const legacyDeclaration of declarations) {
      expect(tabSource).not.toContain(legacyDeclaration);
      expect(viewSource).not.toContain(legacyDeclaration);
    }
    expect(testSource).toContain(
      'from "@/features/freezone/presentation/canvasBrowserViewModel"',
    );
  });

  it("keeps canvas browser orchestration in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasBrowserController.ts",
    );
    const tabPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CanvasesTab.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasBrowserController.test.tsx",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const tabSource = readFileSync(tabPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasBrowserController(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasBrowserController.ts",
    ]);
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "react-i18next",
        "@/features/canvas/composition",
        "@/lib/url-params",
        "@/modules/identity_access/public",
        "@/shared/api/errors",
        "../domain/canvasIdentity",
        "../presentation/canvasBrowserViewModel",
      ]),
    );
    expect(controllerSource).toContain("useFreezoneCanvases(project)");
    expect(controllerSource).toContain("createBlankFreezoneCanvas(project");
    expect(controllerSource).toContain("deleteFreezoneCanvas(project");
    expect(controllerSource).toContain("writeUrl({");
    expect(controllerSource).not.toContain("zustand");
    expect(controllerSource).not.toContain("@/features/canvas/canvasStore");
    expect(controllerSource).not.toContain("@/features/freezone/infrastructure/");
    expect(importSpecifiers(tabPath)).toContain(
      "../hooks/useCanvasBrowserController",
    );
    for (const legacyOwner of [
      "useFreezoneCanvases",
      "createBlankFreezoneCanvas",
      "deleteFreezoneCanvas",
      "useAuthStore",
      "writeUrl",
      "ApiError",
      "BackendStatusError",
      "findDuplicateCanvasName",
      "userCreatedCanvasId",
    ]) {
      expect(tabSource).not.toContain(legacyOwner);
    }
    expect(testSource).toContain(
      'from "./useCanvasBrowserController"',
    );
  });

  it("keeps the complete canvas-browser layout in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CanvasBrowserView.tsx",
    );
    const tabPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CanvasesTab.tsx",
    );
    const legacyTabPath = resolve(
      SRC_ROOT,
      "features/freezone/CanvasesTab.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CanvasBrowserView.test.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const tabSource = readFileSync(tabPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export interface", "CanvasBrowserViewProps"].join(" "),
      ["export function", "CanvasBrowserView("].join(" "),
      ["function", "CanvasSectionTitle("].join(" "),
      ["function", "CollapsibleCanvasSection("].join(" "),
      ["function", "CanvasListItem("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(resolve(SRC_ROOT, "features/freezone"))
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/CanvasBrowserView.tsx",
      ]),
    );
    expect(new Set(importSpecifiers(viewPath))).toEqual(
      new Set([
        "react",
        "lucide-react",
        "react-i18next",
        "./canvasBrowserViewModel",
      ]),
    );
    expect(viewSource).not.toContain("useCanvasBrowserController");
    expect(viewSource).not.toContain("@/features/canvas/composition");
    expect(viewSource).not.toContain("@/modules/identity_access/public");
    expect(viewSource).not.toContain("@/shared/api/");
    expect(existsSync(legacyTabPath)).toBe(false);
    expect(importSpecifiers(tabPath)).toContain(
      "../hooks/useCanvasBrowserController",
    );
    expect(importSpecifiers(tabPath)).toContain(
      "./CanvasBrowserView",
    );
    expect(tabSource).toContain("<CanvasBrowserView");
    for (const legacyOwner of [
      "useEffect",
      "useState",
      "useTranslation",
      "CanvasSectionTitle",
      "CollapsibleCanvasSection",
      "CanvasListItem",
      "lucide-react",
    ]) {
      expect(tabSource).not.toContain(legacyOwner);
    }
    expect(testSource).toContain('from "./CanvasBrowserView"');
  });

  it("keeps the complete asset-library layout in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanelView.tsx",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.tsx",
    );
    const legacyPanelPath = resolve(
      SRC_ROOT,
      "features/freezone/AssetLibraryPanel.tsx",
    );
    const panelTestPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.test.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanelView.test.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const panelTestSource = readFileSync(panelTestPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export interface", "AssetLibraryPanelViewProps"].join(" "),
      ["export function", "AssetLibraryPanelView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(resolve(SRC_ROOT, "features/freezone"))
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/AssetLibraryPanelView.tsx",
      ]),
    );
    expect(existsSync(legacyPanelPath)).toBe(false);
    expect(panelTestSource).toContain('from "./AssetLibraryPanel"');
    expect(new Set(importSpecifiers(viewPath))).toEqual(
      new Set([
        "react",
        "lucide-react",
        "@/features/canvas/domain/assetDropInfo",
        "./CanvasesTab",
        "../domain/beatContext",
        "../domain/assetLibraryModel",
        "./AssetLibraryAssetCard",
        "./AssetLibraryBeatPanels",
        "./assetLibraryViewModel",
      ]),
    );
    expect(viewSource).not.toContain("zustand");
    expect(viewSource).not.toContain("useAssetDropStore");
    expect(viewSource).not.toContain("@/features/canvas/canvasStore");
    expect(viewSource).not.toContain("@/features/freezone/composition");
    expect(viewSource).not.toContain("@/features/freezone/hooks/");
    expect(viewSource).not.toContain("@/features/freezone/application/");
    expect(viewSource).not.toContain("@/shared/api/");
    expect(importSpecifiers(panelPath)).toContain(
      "./AssetLibraryPanelView",
    );
    expect(panelSource).toContain("<AssetLibraryPanelView");
    expect(panelSource).toContain("onAddAsset={addAssetToCanvas}");
    for (const movedPresentationOwner of [
      "useState",
      "useMemo",
      "<aside",
      "ChevronLeft",
      "ChevronRight",
      "CanvasesTab",
      "BeatContextPanel",
      "AssetLibraryAssetCard",
      "buildAssetLibraryTabs",
      "filterAssetLibraryAssets",
      "主线资产",
      "搜索素材...",
    ]) {
      expect(panelSource).not.toContain(movedPresentationOwner);
    }
    expect(testSource).toContain('from "./AssetLibraryPanelView"');
  });

  it("keeps asset library Beat presentation in one component module", () => {
    const presentationPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryBeatPanels.tsx",
    );
    const panelViewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanelView.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryBeatPanels.test.tsx",
    );
    const presentationSource = readFileSync(presentationPath, "utf8");
    const panelViewSource = readFileSync(panelViewPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["function", "MiniThumb("].join(" "),
      ["function", "BeatSectionHeader("].join(" "),
      ["function", "BeatRow("].join(" "),
      ["function", "EpisodeSection("].join(" "),
      ["function", "DefaultCanvasBeatPanel("].join(" "),
      ["function", "PresetBeatPanel("].join(" "),
      ["export function", "BeatContextPanel("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(resolve(SRC_ROOT, "features/freezone"))
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/AssetLibraryBeatPanels.tsx",
      ]),
    );
    expect(new Set(importSpecifiers(presentationPath))).toEqual(
      new Set([
        "react",
        "lucide-react",
        "@/features/canvas/application/imageData",
        "@/features/canvas/domain/assetDrag",
        "../application/assetLibraryCanvasInsertion",
        "../domain/beatContext",
        "../domain/assetLibraryModel",
        "./assetLibraryViewModel",
      ]),
    );
    expect(presentationSource).not.toContain("zustand");
    expect(presentationSource).not.toContain("@/features/canvas/canvasStore");
    expect(presentationSource).not.toContain("@/features/canvas/composition");
    expect(presentationSource).not.toContain("@/features/freezone/composition");
    expect(presentationSource).not.toContain("@/shared/api/");
    expect(presentationSource).not.toContain("addAssetToCanvas");
    expect(presentationSource).toContain("onAddAsset(asset, index)");
    expect(importSpecifiers(panelViewPath)).toContain(
      "./AssetLibraryBeatPanels",
    );
    expect(panelViewSource).toContain("onAddAsset={onAddAsset}");
    for (const legacyDeclaration of declarations) {
      expect(panelViewSource).not.toContain(legacyDeclaration);
    }
    expect(testSource).toContain('from "./AssetLibraryBeatPanels"');
  });

  it("keeps ordinary asset-library card presentation in one component module", () => {
    const presentationPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryAssetCard.tsx",
    );
    const panelViewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanelView.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryAssetCard.test.tsx",
    );
    const presentationSource = readFileSync(presentationPath, "utf8");
    const panelViewSource = readFileSync(panelViewPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export function", "AssetLibraryAssetCard("].join(" "),
      ["function", "createAssetDragImage("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(resolve(SRC_ROOT, "features/freezone"))
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/freezone/presentation/AssetLibraryAssetCard.tsx",
      ]),
    );
    expect(new Set(importSpecifiers(presentationPath))).toEqual(
      new Set([
        "react",
        "lucide-react",
        "@/features/canvas/application/imageData",
        "@/features/canvas/domain/assetDrag",
        "../application/assetLibraryCanvasInsertion",
        "../domain/assetLibraryModel",
        "../domain/pushTarget",
        "./assetLibraryViewModel",
      ]),
    );
    expect(presentationSource).not.toContain("zustand");
    expect(presentationSource).not.toContain("useAssetDropStore");
    expect(presentationSource).not.toContain("@/features/canvas/canvasStore");
    expect(presentationSource).not.toContain("@/features/canvas/composition");
    expect(presentationSource).not.toContain("@/features/freezone/composition");
    expect(presentationSource).not.toContain("@/shared/api/");
    expect(importSpecifiers(panelViewPath)).toContain(
      "./AssetLibraryAssetCard",
    );
    expect(panelViewSource).toContain("<AssetLibraryAssetCard");
    for (const legacyOwner of [
      ["function", "AssetCard("].join(" "),
      ["function", "createAssetDragImage("].join(" "),
      "data-drag-thumb",
      "CANVAS_ASSET_DRAG_MIME",
      "assetToDragPayload",
      "assetToPushTarget",
      "assetDropMediaType",
      "withImageCacheBust",
    ]) {
      expect(panelViewSource).not.toContain(legacyOwner);
    }
    expect(testSource).toContain('from "./AssetLibraryAssetCard"');
  });

  it("keeps asset library replacement orchestration in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useAssetLibraryReplacementController.ts",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.tsx",
    );
    const panelViewPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanelView.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useAssetLibraryReplacementController.test.tsx",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const panelViewSource = readFileSync(panelViewPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declaration = [
      "export function",
      "useAssetLibraryReplacementController(",
    ].join(" ");
    const declarationOwners = sourceFiles(
      resolve(SRC_ROOT, "features/freezone"),
    )
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useAssetLibraryReplacementController.ts",
    ]);
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/assetDropStore",
        "@/features/freezone/domain/assetCommit",
        "../composition",
        "../domain/assetLibraryModel",
        "../domain/pushTarget",
      ]),
    );
    expect(controllerSource).toContain(
      "useAssetDropStore.getState().pendingReplace",
    );
    expect(controllerSource).toContain(
      "commitDirectorRenderFromCanvasSource(project, target, {",
    );
    expect(controllerSource).toContain(
      "promoteToAsset(project, replacement.sourceUrl, target, {",
    );
    expect(importSpecifiers(panelPath)).toContain(
      "../hooks/useAssetLibraryReplacementController",
    );
    expect(panelSource).toContain("replacement={replacementController}");
    expect(panelViewSource).toContain(
      "replacement.confirmReplacement(asset)",
    );
    for (const legacyDependency of [
      "AssetReplaceContext",
      "useAssetDropStore",
      "commitDirectorRenderFromCanvasSource",
      "promoteToAsset",
      "replaceBusyId",
      "handleConfirmReplace",
      "handleCancelReplace",
    ]) {
      expect(panelSource).not.toContain(legacyDependency);
      expect(panelViewSource).not.toContain(legacyDependency);
    }
    expect(testSource).toContain(
      'from "./useAssetLibraryReplacementController"',
    );
  });

  it("keeps asset library canvas insertion behind one application use case", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/assetLibraryCanvasInsertion.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/assetLibraryCanvasInsertionComposition.ts",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryPanel.tsx",
    );
    const beatPresentationPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryBeatPanels.tsx",
    );
    const assetCardPresentationPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/AssetLibraryAssetCard.tsx",
    );
    const testPath = resolve(
      SRC_ROOT,
      "features/freezone/application/assetLibraryCanvasInsertion.test.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const testSource = readFileSync(testPath, "utf8");
    const declarations = [
      ["export function", "assetToDragPayload("].join(" "),
      ["export function", "viewportCenteredPosition("].join(" "),
      ["export async function", "insertAssetLibraryAsset("].join(" "),
      ["export function", "addAssetToCanvas("].join(" "),
    ];
    const expectedOwners = [
      "features/freezone/application/assetLibraryCanvasInsertion.ts",
      "features/freezone/application/assetLibraryCanvasInsertion.ts",
      "features/freezone/application/assetLibraryCanvasInsertion.ts",
      "features/freezone/assetLibraryCanvasInsertionComposition.ts",
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(declarationOwners).toEqual(
      expectedOwners.map((owner) => [owner]),
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/domain/assetDrag",
        "@/features/viewer-kit/three-d/directorManifest",
        "../domain/assetLibraryModel",
      ]),
    );
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "@/features/canvas/canvasStore",
        "@/features/canvas/composition",
        "./application/assetLibraryCanvasInsertion",
        "./domain/assetLibraryModel",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("zustand");
    expect(applicationSource).not.toContain("window.");
    expect(applicationSource).not.toContain("document.");
    expect(applicationSource).not.toContain("localStorage");
    expect(applicationSource).not.toContain("canvasStore");
    expect(applicationSource).not.toContain("@/features/canvas/composition");
    expect(compositionSource).toContain("insertAssetLibraryAsset({");
    expect(importSpecifiers(beatPresentationPath)).toContain(
      "../application/assetLibraryCanvasInsertion",
    );
    expect(importSpecifiers(assetCardPresentationPath)).toContain(
      "../application/assetLibraryCanvasInsertion",
    );
    expect(importSpecifiers(panelPath)).not.toContain(
      "../application/assetLibraryCanvasInsertion",
    );
    expect(importSpecifiers(panelPath)).toContain(
      "../assetLibraryCanvasInsertionComposition",
    );
    expect(importSpecifiers(panelPath)).not.toContain(
      "@/features/canvas/canvasStore",
    );
    expect(importSpecifiers(panelPath)).not.toContain(
      "@/features/canvas/composition",
    );
    expect(panelSource).not.toContain("spawnAssetNode(");
    expect(panelSource).not.toContain("viewportCenteredPosition(");
    expect(testSource).toContain('from "./assetLibraryCanvasInsertion"');
  });

  it("keeps canvas hydration reconciliation in Freezone application", () => {
    const hydrationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasSyncHydration.ts",
    );
    const lifecyclePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
    );
    const hydrationSource = readFileSync(hydrationPath, "utf8");
    const lifecycleSource = readFileSync(lifecyclePath, "utf8");
    const forbiddenImports = importSpecifiers(hydrationPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/features/freezone/infrastructure/") ||
        specifier === "@/features/freezone/composition" ||
        specifier.startsWith("@/shared/api/"),
    );
    const declarations = [
      ["export function", "canvasContentSignature("].join(" "),
      ["export function", "decideHydrateDraft("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(forbiddenImports).toEqual([]);
    expect(new Set(importSpecifiers(hydrationPath))).toEqual(
      new Set([
        "@/features/canvas/domain/canvasNodes",
        "./canvasDraft",
      ]),
    );
    expect(hydrationSource).not.toContain("window.");
    expect(hydrationSource).not.toContain("document.");
    expect(hydrationSource).not.toContain("localStorage");
    expect(declarationOwners).toEqual([
      ["features/freezone/application/canvasSyncHydration.ts"],
      ["features/freezone/application/canvasSyncHydration.ts"],
    ]);
    expect(importSpecifiers(lifecyclePath)).toContain(
      "../application/canvasSyncHydration",
    );
    expect(lifecycleSource).not.toContain("const nodeSignatureCache");
    expect(lifecycleSource).not.toContain("function decideHydrateDraft(");
  });

  it("keeps canvas hydrate flight coordination in Freezone application", () => {
    const coordinatorPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasHydrateFlights.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasHydrationComposition.ts",
    );
    const lifecyclePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
    );
    const coordinatorSource = readFileSync(coordinatorPath, "utf8");
    const lifecycleSource = readFileSync(lifecyclePath, "utf8");
    const declaration = [
      "export function",
      "createCanvasHydrateFlightCoordinator(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(coordinatorPath)).toEqual([
      "@/features/freezone/domain/canvasStorage",
    ]);
    expect(coordinatorSource).not.toContain("window.");
    expect(coordinatorSource).not.toContain("document.");
    expect(coordinatorSource).not.toContain("localStorage");
    expect(declarationOwners).toEqual([
      "features/freezone/application/canvasHydrateFlights.ts",
    ]);
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "@/features/canvas/canvasStore",
        "@/features/canvas/composition",
        "./application/canvasHydrateFlights",
      ]),
    );
    expect(importSpecifiers(lifecyclePath)).toContain(
      "../canvasHydrationComposition",
    );
    expect(lifecycleSource).not.toContain("const hydrateFlights");
    expect(lifecycleSource).not.toContain("function acquireHydrateFlight(");
    expect(lifecycleSource).not.toContain("getFreezoneCanvas");
  });

  it("keeps preset metadata parsing in Freezone application", () => {
    const parserPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasPreset.ts",
    );
    const refreshPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasPresetRefresh.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasPresetRefreshController.ts",
    );
    const beatNodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useBeatContextNodeController.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const parserSource = readFileSync(parserPath, "utf8");
    const refreshSource = readFileSync(refreshPath, "utf8");
    const hookSource = readFileSync(hookPath, "utf8");
    const beatNodeSource = readFileSync(beatNodePath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const declaration = ["function", "presetRequestFromMetadata("].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(parserPath)).toEqual([
      "@/features/freezone/domain/canvasStorage",
    ]);
    expect(parserSource).not.toContain("window.");
    expect(parserSource).not.toContain("document.");
    expect(declarationOwners).toEqual([
      "features/freezone/application/canvasPreset.ts",
    ]);
    expect(importSpecifiers(refreshPath)).toContain("./canvasPreset");
    expect(importSpecifiers(hookPath)).toContain(
      "./useCanvasPresetRefreshController",
    );
    expect(importSpecifiers(controllerPath)).toContain(
      "../canvasPresetRefreshComposition",
    );
    expect(importSpecifiers(beatNodePath)).toContain("@/features/freezone/public");
    expect(refreshSource).not.toContain(declaration);
    expect(hookSource).not.toContain(declaration);
    expect(beatNodeSource).not.toContain(declaration);
    expect(publicSource).toContain("presetRequestFromMetadata");
  });

  it("keeps browser canvas sync persistence behind an application port", () => {
    const storagePath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasSyncStorage.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/browserCanvasSyncStorageGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasSyncComposition.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
    );
    const draftStoragePath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/browserCanvasDraftStorageGateway.ts",
    );
    const feedbackPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/FreezoneCanvasFeedback.tsx",
    );
    const storageSource = readFileSync(storagePath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const hookSource = readFileSync(hookPath, "utf8");
    const draftStorageSource = readFileSync(draftStoragePath, "utf8");
    const forbiddenStorageImports = importSpecifiers(storagePath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/features/freezone/infrastructure/") ||
        specifier === "@/features/freezone/composition" ||
        specifier.startsWith("@/shared/api/"),
    );
    const storageBypasses = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier.startsWith("../infrastructure/") ||
        specifier.startsWith("@/features/freezone/infrastructure/") ||
        specifier === "@/lib/localStorageQuota",
    );
    const gatewayDeclaration = [
      "export interface",
      "CanvasSyncStorageGateway",
    ].join(" ");
    const gatewayOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(gatewayDeclaration))
      .map(relativeSource)
      .sort();
    const viewportDeclaration = [
      "export function",
      "isCanvasSyncViewport(",
    ].join(" ");
    const viewportOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(viewportDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenStorageImports).toEqual([]);
    expect(storageSource).not.toContain("window.");
    expect(storageSource).not.toContain("document.");
    expect(storageSource).not.toContain("localStorage");
    expect(gatewayOwners).toEqual([
      "features/freezone/application/canvasSyncStorage.ts",
    ]);
    expect(viewportOwners).toEqual([
      "features/freezone/application/canvasSyncStorage.ts",
    ]);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/lib/localStorageQuota",
        "../application/canvasSyncStorage",
      ]),
    );
    expect(storageSource).toContain(
      'CANVAS_VIEWPORT_PREFIX = "freezone:canvas-viewport:"',
    );
    expect(storageSource).toContain(
      'CANVAS_HISTORY_PREFIX = "freezone:canvas-history:"',
    );
    expect(storageSource).toContain(
      'CANVAS_CONFLICT_PREFIX = "freezone:conflict:"',
    );
    expect(adapterSource).toContain("canvasViewportStorageKey(project, canvasId)");
    expect(adapterSource).toContain("canvasHistoryStorageKey(project, canvasId)");
    expect(adapterSource).toContain("canvasConflictStorageKey(canvasId)");
    expect(adapterSource).toContain("isCanvasSyncViewport(parsed)");
    expect(importSpecifiers(compositionPath)).toEqual([
      "./infrastructure/browserCanvasSyncStorageGateway",
    ]);
    expect(storageBypasses).toEqual([]);
    expect(hookSource).not.toContain("localStorage.");
    expect(hookSource).toContain("isCanvasSyncViewport(remote.viewport)");
    expect(importSpecifiers(hookPath)).toContain("../canvasSyncComposition");
    expect(importSpecifiers(hookPath)).toContain(
      "../application/canvasSyncStorage",
    );
    expect(importSpecifiers(draftStoragePath)).toContain(
      "../application/canvasSyncStorage",
    );
    expect(draftStorageSource).not.toContain(
      'const CANVAS_HISTORY_PREFIX = "freezone:canvas-history:"',
    );
    expect(draftStorageSource).not.toContain(
      'const CANVAS_CONFLICT_PREFIX = "freezone:conflict:"',
    );
    expect(draftStorageSource).not.toContain(
      'const CANVAS_VIEWPORT_PREFIX = "freezone:canvas-viewport:"',
    );
    expect(importSpecifiers(feedbackPath)).toContain(
      "../application/canvasSyncStorage",
    );
  });

  it("separates canvas history and viewport persistence effects", () => {
    const persistencePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasLocalPersistence.ts",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const persistenceSource = readFileSync(persistencePath, "utf8");
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const historyDeclaration = [
      "export function",
      "useCanvasHistoryPersistence(",
    ].join(" ");
    const viewportDeclaration = [
      "export function",
      "useCanvasViewportPersistence(",
    ].join(" ");
    const owners = (declaration: string) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort();

    expect(new Set(importSpecifiers(persistencePath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/canvasStore",
        "@/features/canvas/domain/viewportBookmarks",
        "../application/canvasSyncHydration",
        "../application/canvasSyncStorage",
        "../canvasSyncComposition",
      ]),
    );
    expect(persistenceSource).not.toContain("localStorage");
    expect(persistenceSource).not.toContain(
      "../infrastructure/browserCanvasSyncStorageGateway",
    );
    expect(owners(historyDeclaration)).toEqual([
      "features/freezone/hooks/useCanvasLocalPersistence.ts",
    ]);
    expect(owners(viewportDeclaration)).toEqual([
      "features/freezone/hooks/useCanvasLocalPersistence.ts",
    ]);
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasLocalPersistence",
    );
    expect(syncHookSource).not.toContain(
      "canvasSyncStorageGateway.writeHistory",
    );
    expect(syncHookSource).not.toContain(
      "canvasSyncStorageGateway.writeViewport",
    );
    expect(persistenceSource).toContain("window.setTimeout(writeNow, 400)");
    expect(persistenceSource).toContain("}, 300)");
    expect(persistenceSource).toContain(
      'window.addEventListener("beforeunload", handleUnload)',
    );
    expect(
      syncHookSource.indexOf("useCanvasHistoryPersistence({"),
    ).toBeLessThan(syncHookSource.indexOf("useCanvasSaveController({"));
    expect(
      syncHookSource.indexOf("useCanvasViewportPersistence({"),
    ).toBeGreaterThan(syncHookSource.indexOf("useCanvasSaveController({"));
  });

  it("keeps canvas draft persistence lifecycle in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasDraftPersistenceController.ts",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasDraftPersistenceController(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/canvasStore",
        "../application/canvasDraft",
        "../canvasDraftComposition",
        "../domain/shotMetadata",
        "../shotMetadataComposition",
      ]),
    );
    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasDraftPersistenceController.ts",
    ]);
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasDraftPersistenceController",
    );
    expect(controllerSource).toContain("const DRAFT_DEBOUNCE_MS = 300");
    expect(controllerSource).toContain("canvasDraftStorageGateway.writeDraft(");
    expect(controllerSource).toContain("canvasDraftStorageGateway.readDraft(");
    expect(controllerSource).toContain("canvasDraftStorageGateway.clearDraft(");
    expect(syncHookSource).not.toContain("const draftTimerRef");
    expect(syncHookSource).not.toContain("const writeDraftNow");
    expect(syncHookSource).not.toContain("const scheduleDraftWrite");
    expect(syncHookSource).not.toContain("lastPersistedDraftSignatureRef");
    expect(syncHookSource).not.toContain("canvasDraftStorageGateway.");
  });

  it("keeps canvas save lifecycle in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSaveController.ts",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasSaveController(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/canvasStore",
        "@/features/freezone/domain/canvasStorage",
        "../application/canvasSyncHydration",
        "../application/canvasSyncStorage",
        "../canvasSaveComposition",
        "../canvasUnloadSaveComposition",
        "../domain/shotMetadata",
        "../shotMetadataComposition",
        "./useCanvasDraftPersistenceController",
      ]),
    );
    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasSaveController.ts",
    ]);
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasSaveController",
    );
    expect(controllerSource).toContain("const SAVE_DEBOUNCE_MS = 800");
    expect(controllerSource).toContain("const inFlightRef = useRef<");
    expect(controllerSource).toContain(
      "const pendingClientSaveIdRef = useRef<",
    );
    expect(controllerSource).toContain("useCanvasStore.subscribe(");
    expect(controllerSource).toContain("scheduleCanvasSave({");
    expect(controllerSource).toContain("saveCanvasBeforeUnload({");
    expect(syncHookSource).not.toContain("debounceTimerRef");
    expect(syncHookSource).not.toContain("inFlightRef");
    expect(syncHookSource).not.toContain("pendingClientSaveIdRef");
    expect(syncHookSource).not.toContain("scheduleCanvasSave({");
    expect(syncHookSource).not.toContain("saveCanvasBeforeUnload({");
  });

  it("keeps canvas runtime state in application and cross-context access public", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasSyncRuntime.ts",
    );
    const statePath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasRuntimeState.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const canvasConsumerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useBeatContextNodeController.ts",
    );
    const stateSource = readFileSync(statePath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const canvasConsumerImports = importSpecifiers(canvasConsumerPath);

    expect(existsSync(legacyPath)).toBe(false);
    expect(new Set(importSpecifiers(statePath))).toEqual(
      new Set([
        "@/features/canvas/domain/canvasNodes",
        "../domain/canvasStorage",
      ]),
    );
    expect(stateSource).not.toContain("react");
    expect(stateSource).not.toContain("window.");
    expect(stateSource).not.toContain("document.");
    expect(publicSource).toContain("applyRemoteFreezoneCanvas");
    expect(publicSource).toContain("flushFreezoneCanvasRuntime");
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/application/canvasRuntimeState",
    );
    expect(canvasConsumerImports).toContain("@/features/freezone/public");
    expect(canvasConsumerImports).not.toContain(
      "@/features/freezone/canvasSyncRuntime",
    );
    expect(canvasConsumerImports).not.toContain(
      "@/features/freezone/application/canvasRuntimeState",
    );
  });

  it("keeps external canvas runtime projection bridging in one hook", () => {
    const bridgePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasRuntimeBridge.ts",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const bridgeSource = readFileSync(bridgePath, "utf8");
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasRuntimeBridge(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(bridgePath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/canvasStore",
        "@/features/freezone/domain/canvasStorage",
        "../application/canvasSyncCore",
        "../application/canvasSyncHydration",
        "../application/canvasSyncStorage",
        "../application/canvasProjectionGraph",
        "../application/canvasMetadataState",
        "../application/canvasRuntimeState",
        "../domain/canvasProjectionMetadata",
        "../domain/shotMetadata",
        "../shotMetadataComposition",
        "./useCanvasDraftPersistenceController",
        "./useCanvasSaveController",
      ]),
    );
    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasRuntimeBridge.ts",
    ]);
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasRuntimeBridge",
    );
    expect(bridgeSource).toContain("registerFreezoneCanvasRuntime(");
    expect(bridgeSource).toContain("mergeProjectedCanvasWithLocalCanvas(");
    expect(bridgeSource).toContain("removeProjectionFromLocalCanvas(");
    expect(bridgeSource).toContain("const saveProjectionEditNow = () =>");
    expect(syncHookSource).toContain(
      "readSaveController: () => saveController",
    );
    expect(syncHookSource).not.toContain("registerFreezoneCanvasRuntime(");
    expect(syncHookSource).not.toContain(
      "mergeProjectedCanvasWithLocalCanvas(",
    );
    expect(syncHookSource).not.toContain("removeProjectionFromLocalCanvas(");
    expect(syncHookSource).not.toContain("saveProjectionEditNow");
    expect(
      syncHookSource.indexOf("useCanvasRuntimeBridge({"),
    ).toBeLessThan(syncHookSource.indexOf("useCanvasHydrationLifecycle({"));
  });

  it("keeps canvas hydration lifecycle in one presentation hook", () => {
    const lifecyclePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
    );
    const syncHookPath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasSync.ts",
    );
    const lifecycleSource = readFileSync(lifecyclePath, "utf8");
    const syncHookSource = readFileSync(syncHookPath, "utf8");
    const declaration = [
      "export function",
      "useCanvasHydrationLifecycle(",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(lifecyclePath))).toEqual(
      new Set([
        "react",
        "@xyflow/react",
        "@/features/canvas/canvasStore",
        "@/features/freezone/domain/canvasStorage",
        "../application/canvasDraft",
        "../application/canvasSyncCore",
        "../application/canvasSyncHydration",
        "../application/canvasSyncStorage",
        "../canvasConflictRecoveryComposition",
        "../canvasDraftComposition",
        "../canvasHydrationComposition",
        "../application/canvasMetadataState",
        "../canvasSyncComposition",
        "../application/canvasRuntimeState",
        "../domain/shotMetadata",
        "../shotMetadataComposition",
        "./useCanvasDraftPersistenceController",
        "./useCanvasSaveController",
      ]),
    );
    expect(declarationOwners).toEqual([
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
    ]);
    expect(importSpecifiers(syncHookPath)).toContain(
      "./useCanvasHydrationLifecycle",
    );
    expect(lifecycleSource).toContain(
      "canvasHydrateFlightCoordinator.acquire(",
    );
    expect(lifecycleSource).toContain("decideHydrateDraft(");
    expect(lifecycleSource).toContain("canvasSyncStorageGateway.readHistory(");
    expect(lifecycleSource).toContain("canvasSyncStorageGateway.readViewport(");
    expect(lifecycleSource).toContain("canvasConflictRecovery.capture({");
    expect(syncHookSource).toContain(
      "readSaveController: () => saveController",
    );
    expect(syncHookSource).not.toContain(
      "canvasHydrateFlightCoordinator.acquire(",
    );
    expect(syncHookSource).not.toContain("decideHydrateDraft(");
    expect(syncHookSource).not.toContain("canvasSyncStorageGateway.readHistory(");
    expect(syncHookSource).not.toContain("requestAnimationFrame(");
    expect(
      syncHookSource.indexOf("useCanvasRuntimeBridge({"),
    ).toBeLessThan(syncHookSource.indexOf("useCanvasHydrationLifecycle({"));
    expect(
      syncHookSource.indexOf("useCanvasHydrationLifecycle({"),
    ).toBeLessThan(syncHookSource.indexOf("useCanvasHistoryPersistence({"));
  });

  it("keeps browser canvas drafts behind one application port", () => {
    const legacyPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasDraftStorage.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/canvasDraft.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/browserCanvasDraftStorageGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/freezone/canvasDraftComposition.ts",
    );
    const lifecyclePath = resolve(
      SRC_ROOT,
      "features/freezone/hooks/useCanvasHydrationLifecycle.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const lifecycleSource = readFileSync(lifecyclePath, "utf8");
    const forbiddenApplicationImports = importSpecifiers(applicationPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/features/freezone/infrastructure/") ||
        specifier === "@/features/freezone/composition" ||
        specifier.startsWith("@/shared/api/"),
    );
    const gatewayDeclaration = [
      "export interface",
      "CanvasDraftStorageGateway",
    ].join(" ");
    const gatewayOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(gatewayDeclaration))
      .map(relativeSource)
      .sort();
    const signatureDeclaration = [
      "export function",
      "canvasDraftSignature(",
    ].join(" ");
    const signatureOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(signatureDeclaration))
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyPath)).toBe(false);
    expect(forbiddenApplicationImports).toEqual([]);
    expect(applicationSource).not.toContain("window.");
    expect(applicationSource).not.toContain("document.");
    expect(applicationSource).not.toContain("localStorage");
    expect(gatewayOwners).toEqual([
      "features/freezone/application/canvasDraft.ts",
    ]);
    expect(signatureOwners).toEqual([
      "features/freezone/application/canvasDraft.ts",
    ]);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/lib/localStorageQuota",
        "../application/canvasDraft",
        "../application/canvasSyncStorage",
      ]),
    );
    expect(adapterSource).toContain("createStoredCanvasDraft(");
    expect(adapterSource).toContain("parseStoredCanvasDraft(");
    expect(adapterSource).not.toContain("pruneOldCanvasDrafts");
    expect(importSpecifiers(compositionPath)).toEqual([
      "./infrastructure/browserCanvasDraftStorageGateway",
    ]);
    expect(compositionSource).toContain(
      "export function scheduleCanvasDraftPruneOnce()",
    );
    expect(compositionSource).toContain("window.requestIdleCallback(run");
    expect(importSpecifiers(lifecyclePath)).toContain(
      "../application/canvasDraft",
    );
    expect(importSpecifiers(lifecyclePath)).toContain(
      "../canvasDraftComposition",
    );
    expect(importSpecifiers(lifecyclePath)).not.toContain(
      "../infrastructure/browserCanvasDraftStorageGateway",
    );
    expect(lifecycleSource).toContain("scheduleCanvasDraftPruneOnce();");
    expect(lifecycleSource).not.toContain("requestIdleCallback");
    expect(lifecycleSource).not.toContain("prunePending");
    expect(importSpecifiers(publicPath)).toContain(
      "@/features/freezone/canvasDraftComposition",
    );
  });

  it("keeps Canvas asynchronous node task concurrency in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasAsyncNodeTasks.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const recoveryControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasGenerationRecoveryController.ts",
    );
    const recoveryController = readFileSync(recoveryControllerPath, "utf8");
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const forbiddenRecoveryControllerImports = importSpecifiers(
      recoveryControllerPath,
    ).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/infrastructure/"),
    );
    const hookDeclaration = [
      "export function",
      "useCanvasAsyncNodeTasks(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();
    const recoveryControllerDeclaration = [
      "export function",
      "useCanvasGenerationRecoveryController(",
    ].join(" ");
    const recoveryControllerOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(recoveryControllerDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(forbiddenRecoveryControllerImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasAsyncNodeTasks.ts",
    ]);
    expect(recoveryControllerOwners).toEqual([
      "features/canvas/hooks/useCanvasGenerationRecoveryController.ts",
    ]);
    expect(hookModel).toContain("activeNodeIdsRef");
    expect(hookModel).toContain("runNode(nodeId).finally");
    expect(recoveryController).toContain("./useCanvasAsyncNodeTasks");
    expect(recoveryController.match(/useCanvasAsyncNodeTasks\(\{/g)).toHaveLength(2);
    expect(canvasView).toContain("./hooks/useCanvasProjectSurfaceController");
    expect(canvasView).not.toContain(
      "./hooks/useCanvasGenerationRecoveryController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasAsyncNodeTasks");
    expect(canvasView).not.toContain("pendingExportImageNodeIds");
    expect(canvasView).not.toContain("pendingGenerationResumeNodeIds");
    expect(canvasView).not.toContain("useCanvasGenerationResume");
    expect(canvasView).not.toContain("activeGenerationPollNodeIdsRef");
    expect(canvasView).not.toContain("activeTaskResumeNodeIdsRef");
    expect(canvasView).not.toContain("pendingResumeNodeKey");
  });

  it("keeps export-image job polling in one application use case", () => {
    const useCasePath = resolve(
      SRC_ROOT,
      "features/canvas/application/pollExportImageGeneration.ts",
    );
    const useCaseModel = readFileSync(useCasePath, "utf8");
    const composition = readFileSync(
      resolve(SRC_ROOT, "features/canvas/composition.ts"),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const recoveryController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasGenerationRecoveryController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(useCasePath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/commands/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export async function",
      "pollExportImageGeneration(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/pollExportImageGeneration.ts",
    ]);
    expect(useCaseModel).toContain("EXPORT_IMAGE_GENERATION_POLL_INTERVAL_MS = 1400");
    expect(useCaseModel).toContain("buildGenerationErrorReport({");
    expect(useCaseModel).toContain("embedStoryboardImageMetadata(");
    expect(composition).toContain("pollExportImageGenerationUseCase(");
    expect(recoveryController).toContain("pollExportImageGeneration({");
    expect(canvasView).not.toContain("pollExportImageGeneration({");
    expect(canvasView).not.toContain("getGenerateImageJob(");
    expect(canvasView).not.toContain("GENERATION_JOB_POLL_INTERVAL_MS");
    expect(canvasView).not.toContain("buildGenerationErrorReport");
    expect(canvasView).not.toContain("embedStoryboardImageMetadata");
  });

  it("keeps Canvas marquee gestures in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasMarqueeSelection.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const hookDeclaration = [
      "export function",
      "useCanvasMarqueeSelection(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(hookDeclaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasMarqueeSelection.ts",
    ]);
    expect(hookModel).toContain("MARQUEE_SELECTION_MIN_DISTANCE_PX = 6");
    expect(hookModel).toContain("collectCanvasNodeIdsInRect");
    expect(hookModel).toContain("useCanvasSpacePan");
    expect(canvasView).toContain("./hooks/useCanvasSelectionSurfaceController");
    expect(canvasView).not.toContain("./hooks/useCanvasMarqueeSelection");
    expect(canvasView).not.toContain("marqueeSelectionRef");
    expect(canvasView).not.toContain("swallowMarqueeClickRef");
    expect(canvasView).not.toContain("MARQUEE_SELECTION_MIN_DISTANCE");
    expect(canvasView).not.toContain("collectCanvasNodeIdsInRect");
  });

  it("keeps Canvas node position reducers out of the Zustand store", () => {
    const positionsPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasNodePositions.ts",
    );
    const positionsModel = readFileSync(positionsPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(positionsPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/"),
    );
    const singleDeclaration = [
      "export function",
      "updateCanvasNodePosition(",
    ].join(" ");
    const batchDeclaration = [
      "export function",
      "setCanvasNodePositions(",
    ].join(" ");
    const ruleOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes(singleDeclaration) || source.includes(batchDeclaration);
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(ruleOwners).toEqual([
      "features/canvas/domain/canvasNodePositions.ts",
    ]);
    expect(positionsModel).toContain(singleDeclaration);
    expect(positionsModel).toContain(batchDeclaration);
    expect(nodeMutationSlice).toContain(
      "../domain/canvasNodePositions",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasNodePositions",
    );
    expect(canvasStore).not.toContain("const nextX = Math.round(next.x)");
    expect(canvasStore).not.toContain("node.position.x === position.x");
  });

  it("keeps Canvas edge hydration rules in the domain model", () => {
    const normalizationPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasEdgeNormalization.ts",
    );
    const normalizationModel = readFileSync(normalizationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const graphMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGraphMutationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(normalizationPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/"),
    );
    const legacyRuleNames = [
      "normalizeHandleId",
      "defaultSkillSourceHandle",
      "isNoReferenceEdge",
      "dedupeReferenceInputEdges",
      "normalizeEdgesWithNodes",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(normalizationModel).toContain(
      "export function normalizeEdgesWithNodes(",
    );
    expect(normalizationModel).toContain("export function normalizeHandleId(");
    expect(graphMutationSlice).toContain("../domain/canvasEdgeNormalization");
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasEdgeNormalization",
    );
    for (const ruleName of legacyRuleNames) {
      expect(canvasStore).not.toContain(`function ${ruleName}(`);
    }
  });

  it("keeps Canvas graph hydration in the application layer", () => {
    const hydrationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeHydration.ts",
    );
    const normalizationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasDataNormalization.ts",
    );
    const storyboardModelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardNodeModel.ts",
    );
    const hydrationModel = readFileSync(hydrationPath, "utf8");
    const normalizationModel = readFileSync(normalizationPath, "utf8");
    const storyboardModel = readFileSync(storyboardModelPath, "utf8");
    const documentLifecycleSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasDocumentLifecycleSlice.ts",
      ),
      "utf8",
    );
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const forbiddenImports = [hydrationPath, normalizationPath].flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "zustand" ||
            specifier.startsWith("@/stores/") ||
            specifier.startsWith("@/features/canvas/infrastructure/") ||
            specifier === "@/features/canvas/composition",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const legacyRuleNames = [
      "isNoReferenceNode",
      "nodeHydratePriority",
      "dedupeNodesById",
      "detachMissingParents",
      "sortParentNodesBeforeChildren",
      "normalizeCanvasNodes",
      "normalizeCanvasData",
      "createDefaultStoryboardExportOptions",
    ];
    const normalizationDeclaration = [
      "export function",
      "normalizeCanvasData(",
    ].join(" ");
    const normalizationOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(normalizationDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(normalizationOwners).toEqual([
      "features/canvas/application/canvasDataNormalization.ts",
    ]);
    expect(hydrationModel).toContain("export function normalizeCanvasNodes(");
    expect(normalizationModel).toContain(normalizationDeclaration);
    expect(normalizationModel).toContain(
      "normalizeCanvasNodes(scoped.nodes, nodeDefaultDataGateway)",
    );
    expect(normalizationModel).toContain(
      "normalizeEdgesWithNodes(scoped.edges, nodes)",
    );
    expect(storyboardModel).toContain(
      "export function createDefaultStoryboardExportOptions(",
    );
    expect(hydrationModel).toContain("from './storyboardNodeModel'");
    expect(hydrationModel).not.toContain(
      "export function createDefaultStoryboardExportOptions(",
    );
    expect(documentLifecycleSlice).toContain(
      "../application/canvasDataNormalization",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasDataNormalization",
    );
    for (const ruleName of legacyRuleNames) {
      expect(canvasStore).not.toContain(`function ${ruleName}(`);
    }
  });

  it("keeps Canvas group graph rules out of the Zustand store", () => {
    const deletionPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/groupSelectionDelete.ts",
    );
    const storyboardPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/storyboardGroup.ts",
    );
    const removalPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasGroupRemoval.ts",
    );
    const deletionModel = readFileSync(deletionPath, "utf8");
    const storyboardModel = readFileSync(storyboardPath, "utf8");
    const removalModel = readFileSync(removalPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeDeletionSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeDeletionSlice.ts",
      ),
      "utf8",
    );
    const groupLifecycleSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGroupLifecycleSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = [
      deletionPath,
      storyboardPath,
      removalPath,
    ].flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "zustand" || specifier.startsWith("@/stores/"),
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const deletionDeclaration = [
      "export function",
      "deleteCanvasNodes(",
    ].join(" ");
    const deletionOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(deletionDeclaration),
      )
      .map(relativeSource)
      .sort();
    const removalDeclaration = [
      "export function",
      "ungroupCanvasNode(",
    ].join(" ");
    const removalOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(removalDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(deletionOwners).toEqual([
      "features/canvas/domain/groupSelectionDelete.ts",
    ]);
    expect(removalOwners).toEqual([
      "features/canvas/domain/canvasGroupRemoval.ts",
    ]);
    expect(deletionModel).toContain(
      "export function collectNodeIdsWithDescendants(",
    );
    expect(deletionModel).toContain(deletionDeclaration);
    expect(storyboardModel).toContain(
      "export function restoreStoryboardEdges(",
    );
    expect(removalModel).toContain(removalDeclaration);
    expect(nodeDeletionSlice).toContain(
      "../domain/groupSelectionDelete",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/groupSelectionDelete",
    );
    expect(groupLifecycleSlice).toContain(
      "../domain/canvasGroupRemoval",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasGroupRemoval",
    );
    expect(canvasStore).not.toContain(
      "function collectNodeIdsWithDescendants(",
    );
    expect(canvasStore).not.toContain("collectNodeIdsWithDescendants(");
    expect(canvasStore).not.toContain("isPresetManagedNode(");
    expect(canvasStore).not.toContain("const deleteSet =");
    expect(canvasStore).not.toContain("function restoreStoryboardEdges(");
    expect(canvasStore).not.toContain("const childIds = new Set(children.map(");
    expect(canvasStore).not.toContain("edge.source !== groupNodeId");
  });

  it("keeps Canvas group creation outside the Zustand store", () => {
    const groupingPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasGrouping.ts",
    );
    const creationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasGroupCreation.ts",
    );
    const autoGroupingPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasAutoGrouping.ts",
    );
    const storyboardCreationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasStoryboardGroupCreation.ts",
    );
    const groupingModel = readFileSync(groupingPath, "utf8");
    const creationModel = readFileSync(creationPath, "utf8");
    const autoGroupingModel = readFileSync(autoGroupingPath, "utf8");
    const storyboardCreationModel = readFileSync(storyboardCreationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const groupLifecycleSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGroupLifecycleSlice.ts",
      ),
      "utf8",
    );
    const storyboardGroupSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasStoryboardGroupSlice.ts",
      ),
      "utf8",
    );
    const applicationPaths = new Set([creationPath, storyboardCreationPath]);
    const forbiddenImports = [
      groupingPath,
      creationPath,
      autoGroupingPath,
      storyboardCreationPath,
    ].flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "react" ||
            specifier.startsWith("react/") ||
            specifier === "@xyflow/react" ||
            specifier.startsWith("@xyflow/react/") ||
            specifier === "zustand" ||
            specifier.startsWith("zustand/") ||
            specifier.startsWith("@/stores/") ||
            (!applicationPaths.has(path) &&
              (specifier.startsWith("@/features/canvas/application/") ||
                /^(?:\.\.\/)+application(?:\/|$)/.test(specifier))) ||
            specifier.startsWith("@/features/canvas/infrastructure/") ||
            specifier === "@/features/canvas/composition" ||
            specifier === "@/features/canvas/nodeFactoryComposition",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const groupingDeclaration = [
      "export function",
      "resolveCanvasGroupMembers(",
    ].join(" ");
    const creationDeclaration = [
      "export function",
      "createCanvasNodeGroup(",
    ].join(" ");
    const autoGroupingDeclaration = [
      "export function",
      "planCanvasAutoGroupSpawn(",
    ].join(" ");
    const storyboardCreationDeclaration = [
      "export function",
      "createCanvasStoryboardGroup(",
    ].join(" ");
    const assemblyDeclaration = [
      "export function",
      "assembleCanvasGroupNodes(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes(groupingDeclaration) ||
          source.includes(creationDeclaration) ||
          source.includes(autoGroupingDeclaration) ||
          source.includes(storyboardCreationDeclaration) ||
          source.includes(assemblyDeclaration)
        );
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasGroupCreation.ts",
      "features/canvas/application/canvasStoryboardGroupCreation.ts",
      "features/canvas/domain/canvasAutoGrouping.ts",
      "features/canvas/domain/canvasGrouping.ts",
    ]);
    expect(groupingModel).toContain(groupingDeclaration);
    expect(groupingModel).toContain(assemblyDeclaration);
    expect(creationModel).toContain(creationDeclaration);
    expect(autoGroupingModel).toContain(autoGroupingDeclaration);
    expect(storyboardCreationModel).toContain(storyboardCreationDeclaration);
    expect(creationModel).toContain("nodeFactory: NodeFactory");
    expect(creationModel).toContain("resolveCanvasGroupMembers(nodes, nodeIds)");
    expect(storyboardCreationModel).toContain("nodeFactory: NodeFactory");
    expect(storyboardCreationModel).toContain(
      "assembleCanvasGroupNodes(nodes, groupNode, updatedMembers)",
    );
    expect(groupLifecycleSlice).toContain(
      "../application/canvasGroupCreation",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasGroupCreation",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasGrouping",
    );
    expect(groupLifecycleSlice).toContain(
      "../domain/canvasAutoGrouping",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasAutoGrouping",
    );
    expect(storyboardGroupSlice).toContain(
      "../application/canvasStoryboardGroupCreation",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasStoryboardGroupCreation",
    );
    expect(canvasStore).not.toContain("const selectedSet = new Set(existingIds)");
    expect(canvasStore).not.toContain("const absoluteBounds = members.reduce(");
    expect(canvasStore).not.toContain("const SIDE_PADDING = 20 + extraPadding");
    expect(canvasStore).not.toContain("groupDisplayName = opts?.label");
    expect(canvasStore).not.toContain("let enclosing: CanvasNode | null");
    expect(canvasStore).not.toContain("spawnedNodeIds.map(");
    expect(canvasStore).not.toContain("spawnedSet.has(node.id)");
    expect(canvasStore).not.toContain("const ordered = [...members].sort(");
    expect(canvasStore).not.toContain("__sbOrigSource: edge.source");
  });

  it("keeps Canvas storyboard group updates in the domain model", () => {
    const configPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasStoryboardGroupConfig.ts",
    );
    const membersPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasStoryboardGroupMembers.ts",
    );
    const conversionPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasStoryboardGroupConversion.ts",
    );
    const configModel = readFileSync(configPath, "utf8");
    const membersModel = readFileSync(membersPath, "utf8");
    const conversionModel = readFileSync(conversionPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const storyboardGroupSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasStoryboardGroupSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = [configPath, membersPath, conversionPath].flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "react" ||
            specifier.startsWith("react/") ||
            specifier === "@xyflow/react" ||
            specifier.startsWith("@xyflow/react/") ||
            specifier === "zustand" ||
            specifier.startsWith("zustand/") ||
            specifier.startsWith("@/stores/") ||
            specifier.startsWith("@/features/canvas/application/") ||
            /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
            specifier.startsWith("@/features/canvas/infrastructure/") ||
            specifier === "@/features/canvas/composition",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const configDeclaration = [
      "export function",
      "configureCanvasStoryboardGroup(",
    ].join(" ");
    const reorderDeclaration = [
      "export function",
      "reorderCanvasStoryboardGroupMember(",
    ].join(" ");
    const conversionDeclaration = [
      "export function",
      "convertCanvasStoryboardGroupToPlain(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes(configDeclaration) ||
          source.includes(reorderDeclaration) ||
          source.includes(conversionDeclaration)
        );
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/domain/canvasStoryboardGroupConfig.ts",
      "features/canvas/domain/canvasStoryboardGroupConversion.ts",
      "features/canvas/domain/canvasStoryboardGroupMembers.ts",
    ]);
    expect(configModel).toContain(configDeclaration);
    expect(membersModel).toContain(reorderDeclaration);
    expect(conversionModel).toContain(conversionDeclaration);
    expect(storyboardGroupSlice).toContain(
      "../domain/canvasStoryboardGroupConfig",
    );
    expect(storyboardGroupSlice).toContain(
      "../domain/canvasStoryboardGroupMembers",
    );
    expect(storyboardGroupSlice).toContain(
      "../domain/canvasStoryboardGroupConversion",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasStoryboardGroupConfig",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasStoryboardGroupMembers",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasStoryboardGroupConversion",
    );
    expect(canvasStore).not.toContain("const nextAspect = config.aspectKey");
    expect(canvasStore).not.toContain("const childCount = state.nodes.reduce(");
    expect(canvasStore).not.toContain("storyboardShowIndex: nextShowIndex");
    expect(canvasStore).not.toContain("const reordered = [...members]");
    expect(canvasStore).not.toContain("fromIndex >= members.length");
    expect(canvasStore).not.toContain("storyboardGroup: _storyboardGroup");
    expect(canvasStore).not.toContain(
      "const groupWidth = Math.max(220, Math.round(maxX + SIDE_PAD))",
    );
    expect(canvasStore).not.toContain(
      "node.parentId === groupNodeId && node.hidden",
    );
  });

  it("keeps Canvas storyboard member addition outside the Zustand store", () => {
    const additionPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasStoryboardGroupMemberAddition.ts",
    );
    const membersPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasStoryboardGroupMembers.ts",
    );
    const creationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasStoryboardGroupCreation.ts",
    );
    const additionModel = readFileSync(additionPath, "utf8");
    const membersModel = readFileSync(membersPath, "utf8");
    const creationModel = readFileSync(creationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const storyboardGroupSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasStoryboardGroupSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(additionPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const additionDeclaration = [
      "export function",
      "addCanvasStoryboardGroupMembers(",
    ].join(" ");
    const layoutDeclaration = [
      "export function",
      "layoutCanvasStoryboardGroupMembers(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes(additionDeclaration) || source.includes(layoutDeclaration);
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasStoryboardGroupMemberAddition.ts",
      "features/canvas/domain/canvasStoryboardGroupMembers.ts",
    ]);
    expect(additionModel).toContain(additionDeclaration);
    expect(additionModel).toContain("nodeFactory: NodeFactory");
    expect(membersModel).toContain(layoutDeclaration);
    expect(creationModel).toContain("layoutCanvasStoryboardGroupMembers(ordered)");
    expect(additionModel).toContain("layoutCanvasStoryboardGroupMembers(existing,");
    expect(storyboardGroupSlice).toContain(
      "../application/canvasStoryboardGroupMemberAddition",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasStoryboardGroupMemberAddition",
    );
    expect(canvasStore).not.toContain("const valid = images.filter(");
    expect(canvasStore).not.toContain("const allMembers = [...existing, ...newNodes]");
    expect(canvasStore).not.toContain("displayName: image.displayName ?? '分镜'");
  });

  it("keeps Canvas group layout in the domain model", () => {
    const fitPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasGroupFit.ts",
    );
    const arrangementPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasGroupArrangement.ts",
    );
    const fitModel = readFileSync(fitPath, "utf8");
    const arrangementModel = readFileSync(arrangementPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const groupLifecycleSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGroupLifecycleSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = [fitPath, arrangementPath].flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "react" ||
            specifier.startsWith("react/") ||
            specifier === "@xyflow/react" ||
            specifier.startsWith("@xyflow/react/") ||
            specifier === "zustand" ||
            specifier.startsWith("zustand/") ||
            specifier.startsWith("@/stores/") ||
            specifier.startsWith("@/features/canvas/application/") ||
            /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
            specifier.startsWith("@/features/canvas/infrastructure/") ||
            specifier === "@/features/canvas/composition",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const fitDeclaration = [
      "export function",
      "fitCanvasGroupToChildren(",
    ].join(" ");
    const arrangementDeclaration = [
      "export function",
      "arrangeCanvasGroupChildren(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes(fitDeclaration) || source.includes(arrangementDeclaration);
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/domain/canvasGroupArrangement.ts",
      "features/canvas/domain/canvasGroupFit.ts",
    ]);
    expect(fitModel).toContain(fitDeclaration);
    expect(arrangementModel).toContain(arrangementDeclaration);
    expect(groupLifecycleSlice).toContain(
      "../domain/canvasGroupFit",
    );
    expect(groupLifecycleSlice).toContain(
      "../domain/canvasGroupArrangement",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasGroupFit",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasGroupArrangement",
    );
    expect(canvasStore).not.toContain("const groupStyle = group.style");
    expect(canvasStore).not.toContain(
      "const shiftX = Math.max(0, Math.round(SIDE_PAD - minX))",
    );
    expect(canvasStore).not.toContain(
      "const childSet = new Set(children.map((child) => child.id))",
    );
    expect(canvasStore).not.toContain("const targets = new Map<string");
    expect(canvasStore).not.toContain("Math.ceil(Math.sqrt(ordered.length))");
    expect(canvasStore).not.toContain("cursorX += item.size.width + GAP");
  });

  it("keeps Canvas storyboard node model out of the Zustand store", () => {
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardNodeModel.ts",
    );
    const derivedCreationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasDerivedNodeCreation.ts",
    );
    const nodeModel = readFileSync(modelPath, "utf8");
    const derivedCreationModel = readFileSync(derivedCreationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(modelPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );

    expect(forbiddenImports).toEqual([]);
    expect(nodeModel).toContain(
      "export function resolveStoryboardSplitNodeDimensions(",
    );
    expect(nodeModel).toContain(
      "export function resolveDerivedAspectRatio(",
    );
    expect(derivedCreationModel).toContain(
      "from './storyboardNodeModel'",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/storyboardNodeModel",
    );
    expect(existsSync(resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardNodeLayout.ts",
    ))).toBe(false);
    expect(canvasStore).not.toContain("function parseAspectRatioValue(");
    expect(canvasStore).not.toContain(
      "function resolveStoryboardSplitNodeDimensions(",
    );
    expect(canvasStore).not.toContain("function resolveDerivedAspectRatio(");
  });

  it("keeps Canvas storyboard frame rules out of the Zustand store", () => {
    const framesPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/storyboardFrames.ts",
    );
    const framesModel = readFileSync(framesPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(framesPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/"),
    );
    const updateDeclaration = [
      "export function",
      "updateStoryboardFrameInGraph(",
    ].join(" ");
    const reorderDeclaration = [
      "export function",
      "reorderStoryboardFrameInGraph(",
    ].join(" ");
    const ruleOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes(updateDeclaration) || source.includes(reorderDeclaration);
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(ruleOwners).toEqual([
      "features/canvas/domain/storyboardFrames.ts",
    ]);
    expect(framesModel).toContain(updateDeclaration);
    expect(framesModel).toContain(reorderDeclaration);
    expect(nodeMutationSlice).toContain("../domain/storyboardFrames");
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/storyboardFrames",
    );
    expect(canvasStore).not.toContain("const patchEntries = Object.entries(data)");
    expect(canvasStore).not.toContain("const fromIndex = frames.findIndex");
    expect(canvasStore).not.toContain("frames.splice(toIndex, 0, movedFrame)");
  });

  it("keeps Canvas viewport and selection rules outside the Zustand store", () => {
    const selectionPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasSelection.ts",
    );
    const viewportPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/viewportBookmarks.ts",
    );
    const nodeEffectsPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeChangeEffects.ts",
    );
    const historyNavigationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasHistoryNavigation.ts",
    );
    const selectionModel = readFileSync(selectionPath, "utf8");
    const viewportModel = readFileSync(viewportPath, "utf8");
    const viewportSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasViewportSlice.ts",
      ),
      "utf8",
    );
    const nodeEffectsModel = readFileSync(nodeEffectsPath, "utf8");
    const historyNavigationModel = readFileSync(historyNavigationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const marqueeView = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasMarqueeSelection.ts",
      ),
      "utf8",
    );
    const lifecycleView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useCanvasLifecycle.ts"),
      "utf8",
    );
    const forbiddenImports = [selectionPath, viewportPath].flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "react" ||
            specifier.startsWith("react/") ||
            specifier === "@xyflow/react" ||
            specifier.startsWith("@xyflow/react/") ||
            specifier === "zustand" ||
            specifier.startsWith("@/stores/") ||
            specifier.startsWith("@/features/canvas/application/") ||
            specifier.startsWith("@/features/canvas/infrastructure/"),
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const originViewportDeclaration = [
      "export function",
      "resolveCanvasOriginViewport(",
    ].join(" ");
    const originViewportOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(originViewportDeclaration),
      )
      .map(relativeSource)
      .sort();
    const rectSelectionDeclaration = [
      "export function",
      "collectCanvasNodeIdsInRect(",
    ].join(" ");
    const rectSelectionOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(rectSelectionDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(originViewportOwners).toEqual([
      "features/canvas/domain/viewportBookmarks.ts",
    ]);
    expect(rectSelectionOwners).toEqual([
      "features/canvas/domain/canvasSelection.ts",
    ]);
    expect(selectionModel).toContain(rectSelectionDeclaration);
    expect(selectionModel).toContain("export function resolveSelectedNodeId(");
    expect(selectionModel).toContain("export function resolveActiveToolDialog(");
    expect(viewportModel).toContain("export function replaceViewportBookmark(");
    expect(viewportModel).toContain(originViewportDeclaration);
    expect(nodeEffectsModel).toContain(
      "from '../domain/canvasSelection'",
    );
    expect(historyNavigationModel).toContain(
      "from '../domain/canvasSelection'",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasSelection",
    );
    expect(viewportSlice).toContain(
      "replaceViewportBookmark(current, index, bookmark)",
    );
    expect(canvasStore).not.toContain("replaceViewportBookmark(");
    expect(lifecycleView).toContain("../domain/viewportBookmarks");
    expect(canvasView).not.toContain("domain/viewportBookmarks");
    expect(marqueeView).toContain("../domain/canvasSelection");
    expect(canvasView).not.toContain(
      "from '@/features/canvas/domain/canvasSelection'",
    );
    expect(canvasView).not.toContain("const ancestorsOfHits");
    expect(canvasView).not.toContain("function resolveCenteredViewport(");
    expect(canvasView).not.toContain("const DEFAULT_VIEWPORT");
    expect(canvasStore).not.toContain("function resolveSelectedNodeId(");
    expect(canvasStore).not.toContain("function resolveActiveToolDialog(");
    expect(canvasStore.match(/create<CanvasState>/g)).toHaveLength(1);
  });

  it("keeps Canvas image node layout rules out of the Zustand store", () => {
    const layoutPath = resolve(
      SRC_ROOT,
      "features/canvas/application/imageNodeLayout.ts",
    );
    const changeEffectsPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeChangeEffects.ts",
    );
    const layoutModel = readFileSync(layoutPath, "utf8");
    const changeEffectsModel = readFileSync(changeEffectsPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const forbiddenLayoutImports = importSpecifiers(layoutPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/"),
    );
    const ruleNames = [
      "isImageAutoResizableType",
      "withManualSizeLock",
      "resolveAutoImageNodeDimensions",
      "resolveGeneratedImageNodeDimensions",
      "maybeApplyImageAutoResize",
    ];

    expect(forbiddenLayoutImports).toEqual([]);
    expect(changeEffectsModel).toContain(
      "from './imageNodeLayout'",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/imageNodeLayout",
    );
    for (const ruleName of ruleNames) {
      expect(layoutModel).toContain(`export function ${ruleName}(`);
      expect(canvasStore).not.toContain(`function ${ruleName}(`);
    }
  });

  it("keeps Canvas node creation in the application layer", () => {
    const creationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeCreation.ts",
    );
    const creationModel = readFileSync(creationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(creationPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const creationDeclaration = [
      "export function",
      "createCanvasNode(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(creationDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasNodeCreation.ts",
    ]);
    expect(creationModel).toContain(creationDeclaration);
    expect(creationModel).toContain("nodeFactory: NodeFactory");
    expect(creationModel).toContain("maybeApplyImageAutoResize(");
    expect(nodeMutationSlice).toContain(
      "../application/canvasNodeCreation",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasNodeCreation",
    );
    expect(canvasStore).toContain("nodeFactory: canvasNodeFactory");
    expect(nodeMutationSlice).toContain("dependencies.nodeFactory");
    expect(canvasStore).not.toContain("const createdNode =");
    expect(canvasStore).not.toContain(
      "createdNode.type === CANVAS_NODE_TYPES.skill",
    );
  });

  it("keeps Canvas node-menu selection rules in the application layer", () => {
    const selectionPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeMenuSelection.ts",
    );
    const selectionModel = readFileSync(selectionPath, "utf8");
    const menuController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasNodeMenuSelectionController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(selectionPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declarations = [
      "planCanvasNodeMenuSelection(",
      "createCanvasSkillNodeData(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return declarations.some((declaration) => source.includes(declaration));
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasNodeMenuSelection.ts",
    ]);
    for (const declaration of declarations) {
      expect(selectionModel).toContain(declaration);
    }
    expect(selectionModel).toContain("SKILL_SCHEMA_VERSION");
    expect(menuController).toContain("../application/canvasNodeMenuSelection");
    expect(menuController).toContain("planCanvasNodeMenuSelection({");
    expect(menuController).toContain("createCanvasSkillNodeData(skill)");
    expect(canvasView).not.toContain(
      "@/features/canvas/application/canvasNodeMenuSelection",
    );
    expect(canvasView).not.toContain("const isPlainAddNodeMenu");
    expect(canvasView).not.toContain("generationMode: 'image_reference'");
    expect(canvasView).not.toContain("initialData = { imageOnly: true }");
    expect(canvasView).not.toContain("skill_schema_version:");
  });

  it("keeps Canvas derived node creation in the application layer", () => {
    const creationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasDerivedNodeCreation.ts",
    );
    const creationModel = readFileSync(creationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const derivedNodeCreationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(creationPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declarations = [
      "createCanvasDerivedUploadNode(",
      "createCanvasDerivedExportNode(",
      "createCanvasStoryboardSplitNode(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return declarations.some((declaration) => source.includes(declaration));
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasDerivedNodeCreation.ts",
    ]);
    for (const declaration of declarations) {
      expect(creationModel).toContain(declaration);
    }
    expect(creationModel).toContain("nodeFactory: NodeFactory");
    expect(creationModel).toContain("findAvailableNodePosition({");
    expect(derivedNodeCreationSlice).toContain(
      "../application/canvasDerivedNodeCreation",
    );
    expect(canvasStore).toContain(
      "@/features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasDerivedNodeCreation",
    );
    expect(canvasStore).not.toContain("const autoSize =");
    expect(canvasStore).not.toContain("const exportNodeData:");
    expect(canvasStore).not.toContain("const resolvedFrameAspectRatio =");
  });

  it("keeps Canvas node data updates out of the Zustand store", () => {
    const nodeDataPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeData.ts",
    );
    const nodeDataModel = readFileSync(nodeDataPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const clipboardDuplicationPlanner = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/application/canvasClipboardDuplication.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(nodeDataPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const updateDeclaration = [
      "export function",
      "updateCanvasNodeData(",
    ].join(" ");
    const cloneDeclaration = [
      "export function",
      "cloneCanvasNodeData<",
    ].join(" ");
    const ruleOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes(updateDeclaration) || source.includes(cloneDeclaration);
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(ruleOwners).toEqual([
      "features/canvas/application/canvasNodeData.ts",
    ]);
    expect(nodeDataModel).toContain(updateDeclaration);
    expect(nodeDataModel).toContain(cloneDeclaration);
    expect(nodeDataModel).toContain("maybeApplyImageAutoResize(");
    expect(nodeMutationSlice).toContain("../application/canvasNodeData");
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasNodeData",
    );
    expect(canvasStore).not.toContain("const hasDataChange = Object.entries(data)");
    expect(canvasStore).not.toContain("const mergedData = {\n          ...node.data");
    expect(clipboardDuplicationPlanner).toContain("./canvasNodeData");
    expect(canvasView).not.toContain(
      "@/features/canvas/application/canvasNodeData",
    );
    expect(canvasView).not.toContain("function cloneNodeData<");
    expect(canvasView).not.toContain("structuredClone(value)");
  });

  it("keeps Canvas node type conversion out of the Zustand store", () => {
    const conversionPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeConversion.ts",
    );
    const conversionModel = readFileSync(conversionPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(conversionPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const conversionDeclaration = [
      "export function",
      "convertCanvasNodeType(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(conversionDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasNodeConversion.ts",
    ]);
    expect(conversionModel).toContain(conversionDeclaration);
    expect(conversionModel).toContain("createCanvasNodeDefaultData(");
    expect(nodeMutationSlice).toContain(
      "../application/canvasNodeConversion",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasNodeConversion",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/nodeCatalog",
    );
    expect(canvasStore).not.toContain("definition.createDefaultData()");
    expect(canvasStore).not.toContain("target.type === newType");
  });

  it("keeps Canvas node duplication out of the Zustand store", () => {
    const duplicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeDuplication.ts",
    );
    const duplicationModel = readFileSync(duplicationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const derivedNodeCreationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(duplicationPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const singleDeclaration = [
      "export function",
      "duplicateCanvasNodeAsSibling(",
    ].join(" ");
    const batchDeclaration = [
      "export function",
      "duplicateCanvasNodesAsSiblings(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes(singleDeclaration) || source.includes(batchDeclaration);
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasNodeDuplication.ts",
    ]);
    expect(duplicationModel).toContain(singleDeclaration);
    expect(duplicationModel).toContain(batchDeclaration);
    expect(duplicationModel).toContain("nodeFactory: NodeFactory");
    expect(derivedNodeCreationSlice).toContain(
      "../application/canvasNodeDuplication",
    );
    expect(derivedNodeCreationSlice).toContain("dependencies.nodeFactory,");
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasNodeDuplication",
    );
    expect(canvasStore).not.toContain("const clonedEdges:");
    expect(canvasStore).not.toContain("const idMap = new Map<string, string>()");
    expect(canvasStore).not.toContain(" - 副本`");
  });

  it("keeps Canvas pano capture creation out of the Zustand store", () => {
    const capturePath = resolve(
      SRC_ROOT,
      "features/canvas/application/panoCaptureNodes.ts",
    );
    const captureModel = readFileSync(capturePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const derivedNodeCreationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(capturePath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const creationDeclaration = [
      "export function",
      "createPanoCaptureNodes(",
    ].join(" ");
    const captureContractDeclaration = [
      "export interface",
      "CanvasPanoCapture",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(creationDeclaration),
      )
      .map(relativeSource)
      .sort();
    const contractOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(captureContractDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/panoCaptureNodes.ts",
    ]);
    expect(contractOwners).toEqual([
      "features/canvas/application/panoCaptureNodes.ts",
    ]);
    expect(captureModel).toContain(creationDeclaration);
    expect(captureModel).toContain("nodeFactory: NodeFactory");
    expect(derivedNodeCreationSlice).toContain(
      "../application/panoCaptureNodes",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/panoCaptureNodes",
    );
    expect(canvasStore).not.toContain("const onlyDisplayUrl =");
    expect(canvasStore).not.toContain("const gcd =");
    expect(canvasStore).not.toContain("全景截图组 (");
  });

  it("keeps Canvas node size updates out of the Zustand store", () => {
    const nodeSizePath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeSize.ts",
    );
    const nodeSizeModel = readFileSync(nodeSizePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(nodeSizePath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const updateDeclaration = [
      "export function",
      "updateCanvasNodeSize(",
    ].join(" ");
    const contractDeclaration = [
      "export interface",
      "CanvasNodeSizeUpdateOptions",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(updateDeclaration),
      )
      .map(relativeSource)
      .sort();
    const contractOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(contractDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasNodeSize.ts",
    ]);
    expect(contractOwners).toEqual([
      "features/canvas/application/canvasNodeSize.ts",
    ]);
    expect(nodeSizeModel).toContain(updateDeclaration);
    expect(nodeMutationSlice).toContain("../application/canvasNodeSize");
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasNodeSize",
    );
    expect(canvasStore).not.toContain("const manualSizePatch =");
    expect(canvasStore).not.toContain("const currentWidth =");
    expect(canvasStore).not.toContain("Math.max(1, Math.round(size.width))");
  });

  it("keeps Canvas connection eligibility in the domain model", () => {
    const connectionPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasConnection.ts",
    );
    const edgeCreationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasEdgeCreation.ts",
    );
    const connectionModel = readFileSync(connectionPath, "utf8");
    const edgeCreationModel = readFileSync(edgeCreationPath, "utf8");
    const interactionModel = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/ui/canvasConnectionInteraction.ts",
      ),
      "utf8",
    );
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(connectionPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition",
    );
    const validationDeclaration = [
      "export function",
      "validateCanvasConnection(",
    ].join(" ");
    const menuDeclaration = [
      "export function",
      "resolveAllowedNodeTypes(",
    ].join(" ");
    const typeEligibilityDeclaration = [
      "export function",
      "canNodeTypeBeManualConnectionSource(",
    ].join(" ");
    const nodeEligibilityDeclaration = [
      "export function",
      "canNodeBeManualConnectionSource(",
    ].join(" ");
    const endpointEligibilityDeclaration = [
      "export function",
      "canConnectCanvasNodesManually(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes(validationDeclaration) ||
          source.includes(menuDeclaration) ||
          source.includes(typeEligibilityDeclaration) ||
          source.includes(nodeEligibilityDeclaration) ||
          source.includes(endpointEligibilityDeclaration)
        );
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/domain/canvasConnection.ts",
    ]);
    expect(connectionModel).toContain(validationDeclaration);
    expect(connectionModel).toContain(menuDeclaration);
    expect(connectionModel).toContain(typeEligibilityDeclaration);
    expect(connectionModel).toContain(nodeEligibilityDeclaration);
    expect(connectionModel).toContain(endpointEligibilityDeclaration);
    expect(edgeCreationModel).toContain(
      "from '../domain/canvasConnection'",
    );
    expect(interactionModel).toContain("../domain/canvasConnection");
    expect(canvasView).not.toContain(
      "@/features/canvas/domain/canvasConnection",
    );
    expect(canvasView).not.toContain("function resolveAllowedNodeTypes(");
    expect(canvasView).not.toContain(
      "function canNodeTypeBeManualConnectionSource(",
    );
    expect(canvasView).not.toContain("function canNodeBeManualConnectionSource(");
    expect(canvasView).not.toContain("function canConnectCanvasNodesManually(");
    expect(canvasView).not.toContain("THREE_D_WORLD_MANUAL_SOURCE_TYPES");
    expect(canvasView).not.toContain("PANO_360_DOWNSTREAM_IMAGE_TYPES");
    expect(canvasView).not.toContain("isUpstreamConnectionAllowed(");
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasConnection",
    );
    expect(canvasStore).not.toContain("nodeHasSourceHandle(");
    expect(canvasStore).not.toContain("nodeHasTargetHandle(");
    expect(canvasStore).not.toContain("isUpstreamConnectionAllowed(");
    expect(canvasStore).not.toContain(
      "targetNode?.type === CANVAS_NODE_TYPES.threeDWorld",
    );
  });

  it("keeps Canvas batch-connection planning in the domain model", () => {
    const planningPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasBatchConnection.ts",
    );
    const planningModel = readFileSync(planningPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const multiSelectionConnectButton = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/ui/MultiSelectionConnectButton.tsx",
      ),
      "utf8",
    );
    const batchConnectionController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasBatchConnectionController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(planningPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      "resolveCanvasBatchConnectContext(",
      "planCanvasBatchConnectTarget(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return declarations.some((declaration) => source.includes(declaration));
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/domain/canvasBatchConnection.ts",
    ]);
    for (const declaration of declarations) {
      expect(planningModel).toContain(declaration);
    }
    expect(planningModel).toContain("canConnectCanvasNodesManually(");
    expect(planningModel).toContain("getDownstreamSpawnTypes(");
    expect(planningModel).toContain("getNodeSize(");
    expect(batchConnectionController).toContain(
      "../domain/canvasBatchConnection",
    );
    expect(batchConnectionController).toContain(
      "resolveCanvasBatchConnectContext(nodes)",
    );
    expect(batchConnectionController).toContain(
      "planCanvasBatchConnectTarget(",
    );
    expect(canvasView).not.toContain(
      "@/features/canvas/domain/canvasBatchConnection",
    );
    expect(canvasView).not.toContain("getDownstreamSpawnTypes(");
    expect(canvasView).not.toContain("nodeHasSourceHandle(");
    expect(canvasView).not.toContain("nodeHasTargetHandle(");
    expect(canvasView).not.toContain("const sourceIdSet = new Set(drag.sourceIds)");
    expect(canvasView).not.toContain("let minY = Infinity");
    expect(multiSelectionConnectButton).toContain(
      "@/features/canvas/domain/canvasBatchConnection",
    );
    expect(multiSelectionConnectButton).toContain(
      "resolveCanvasBatchConnectContext(nodes)",
    );
    expect(multiSelectionConnectButton).not.toContain("getDownstreamSpawnTypes");
    expect(multiSelectionConnectButton).not.toContain("nodeHasSourceHandle");
    expect(multiSelectionConnectButton).not.toContain("new Set(selectedSourceIds)");
  });

  it("keeps Canvas batch-connection orchestration in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasBatchConnectionController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const gestureController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasConnectionGestureController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasBatchConnectionController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasBatchConnectionController.ts",
    ]);
    expect(hookModel).toContain("resolveCanvasBatchConnectContext(nodes)");
    expect(hookModel).toContain("planCanvasBatchConnectTarget(");
    expect(gestureController).toContain("./useCanvasBatchConnectionController");
    expect(canvasView).toContain(
      "./hooks/useCanvasConnectionGestureSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasConnectionGestureController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasBatchConnectionController",
    );
    expect(canvasView).not.toContain("batchConnectDragRef");
    expect(canvasView).not.toContain("BATCH_CONNECT_SPAWN_GAP");
    expect(canvasView).not.toContain("BATCH_CONNECT_SPAWN_VERTICAL_OFFSET");
    expect(canvasView).not.toContain("openBatchSpawnMenu");
    expect(canvasView).not.toContain(
      "const handleBatchConnectOpenMenu = useCallback",
    );
    expect(canvasView).not.toContain(
      "const handleBatchConnectDragStart = useCallback",
    );
    expect(canvasView).not.toContain(
      "const handleBatchConnectDragMove = useCallback",
    );
    expect(canvasView).not.toContain(
      "const handleBatchConnectDragEnd = useCallback",
    );
    expect(canvasView).not.toContain("resolveCanvasBatchConnectContext(");
    expect(canvasView).not.toContain("planCanvasBatchConnectTarget(");
  });

  it("keeps Canvas edge creation in the application layer", () => {
    const creationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasEdgeCreation.ts",
    );
    const creationModel = readFileSync(creationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const graphMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGraphMutationSlice.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(creationPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declarations = [
      "prepareCanvasReactFlowConnection(",
      "createCanvasProgrammaticEdge(",
      "createCanvasDataEdge(",
      "planCanvasGraphConnection(",
      "planCanvasSpawnConnections(",
      "planSingleBeatContextBinding(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return declarations.some((declaration) => source.includes(declaration));
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasEdgeCreation.ts",
    ]);
    for (const declaration of declarations) {
      expect(creationModel).toContain(declaration);
    }
    expect(creationModel).toContain("validateCanvasConnection(");
    expect(creationModel).toContain("applySkillRoleBindingConnection({");
    expect(creationModel).toContain("validatePropagatingEdgeCandidate(");
    expect(creationModel).toContain("validateCandidateBindingRoleCandidate(");
    expect(graphMutationSlice).toContain(
      "../application/canvasEdgeCreation",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/application/canvasEdgeCreation",
    );
    expect(canvasStore).not.toContain("const edgeId = `e-${source}-${target}`");
    expect(canvasStore).not.toContain("const newEdge: CanvasEdge =");
    expect(canvasStore).not.toContain("validatePropagatingEdgeCandidate(");
    expect(canvasStore).not.toContain("validateCandidateBindingRoleCandidate(");
    expect(canvasStore).not.toContain("normalizeHandleId(connection.sourceHandle)");
  });

  it("keeps Canvas connection orchestration in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasConnectionController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasConnectionController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasConnectionController.ts",
    ]);
    expect(hookModel).toContain("planCanvasGraphConnection({");
    expect(hookModel).toContain("planCanvasSpawnConnections({");
    expect(hookModel).toContain("planSingleBeatContextBinding(");
    expect(hookModel).toContain("validateCanvasConnection(");
    expect(canvasView).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasView).not.toContain("./hooks/useCanvasConnectionController");
    expect(canvasView).not.toContain("const connectSkillRoleBinding");
    expect(canvasView).not.toContain("applySkillRoleBindingConnection({");
    expect(canvasView).not.toContain("planSingleBeatContextBinding(");
    expect(canvasView).not.toContain("planCanvasSpawnConnections(");
    expect(canvasView).not.toContain(
      "for (const sourceId of pendingBatchConnectIds)",
    );
    expect(canvasView).not.toContain(
      "pendingConnectStart.handleType === 'source'",
    );
    expect(canvasView).not.toContain("validateCanvasConnection(");
    expect(canvasView).not.toContain(
      "rejected role binding before skill registry loaded",
    );
  });

  it("keeps Canvas React Flow connection gestures in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasReactFlowConnectionController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const gestureController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasConnectionGestureController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasReactFlowConnectionController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasReactFlowConnectionController.ts",
    ]);
    expect(hookModel).toContain("resolveCanvasConnectionStart({");
    expect(hookModel).toContain("resolveCanvasConnectionEnd({");
    expect(gestureController).toContain(
      "./useCanvasReactFlowConnectionController",
    );
    expect(canvasView).toContain(
      "./hooks/useCanvasConnectionGestureSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasConnectionGestureController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasReactFlowConnectionController",
    );
    expect(canvasView).not.toContain(
      "const handleConnectStart = useCallback",
    );
    expect(canvasView).not.toContain(
      "const handleConnectEnd = useCallback",
    );
    expect(canvasView).not.toContain("resolveCanvasConnectionStart(");
    expect(canvasView).not.toContain("resolveCanvasConnectionEnd(");
    expect(canvasView).not.toContain("FinalConnectionState");
    expect(canvasView).not.toContain("OnConnectStartParams");
  });

  it("keeps Canvas plus-connection gesture state in one presentation controller", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasPlusConnectionController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const gestureControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasConnectionGestureController.ts",
    );
    const gestureController = readFileSync(gestureControllerPath, "utf8");
    const forbiddenImports = importSpecifiers(hookPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasPlusConnectionController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const gestureForbiddenImports = importSpecifiers(
      gestureControllerPath,
    ).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const gestureDeclaration = [
      "export function",
      "useCanvasConnectionGestureController(",
    ].join(" ");
    const gestureOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(gestureDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(gestureForbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasPlusConnectionController.ts",
    ]);
    expect(gestureOwners).toEqual([
      "features/canvas/hooks/useCanvasConnectionGestureController.ts",
    ]);
    expect(hookModel).toContain("resolveCanvasPlusConnectionStart({");
    expect(hookModel).toContain("resolveCanvasPlusConnectionEnd({");
    expect(hookModel).toContain("resolveManualDropTargetElement({");
    expect(hookModel).toContain("canvas-node-drop-target");
    expect(gestureController).toContain("./useCanvasPlusConnectionController");
    expect(gestureController).toContain(
      "./useCanvasReactFlowConnectionController",
    );
    expect(gestureController).toContain("./useCanvasBatchConnectionController");
    expect(gestureController).toContain(
      "screenToFlowPosition(request.clientPosition)",
    );
    expect(gestureController).toContain("suppressNextPaneClick()");
    expect(canvasView).toContain(
      "./hooks/useCanvasConnectionGestureSurfaceController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasConnectionGestureController",
    );
    expect(canvasView).not.toContain(
      "./hooks/useCanvasPlusConnectionController",
    );
    expect(canvasView).not.toContain("const plusConnectStartRef");
    expect(canvasView).not.toContain("const dropTargetElRef");
    expect(canvasView).not.toContain("setIsPlusConnectDragging");
    expect(canvasView).not.toContain("const handlePlusOpenMenu = useCallback");
    expect(canvasView).not.toContain(
      "const handlePlusConnectDragStart = useCallback",
    );
    expect(canvasView).not.toContain(
      "const handlePlusConnectDragMove = useCallback",
    );
    expect(canvasView).not.toContain(
      "const handlePlusConnectDragEnd = useCallback",
    );
    expect(canvasView).not.toContain("canvas-node-drop-target");
    expect(canvasView).not.toContain("resolveManualDropTargetElement(");
    expect(canvasView).not.toContain("resolveConnectEndHandleId(");
    expect(canvasView).not.toContain("resolveAllowedNodeTypes(");
    expect(canvasView).not.toContain("canConnectCanvasNodesManually(");
  });

  it("keeps Canvas edge deletion in the domain model", () => {
    const deletionPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasEdgeDeletion.ts",
    );
    const deletionModel = readFileSync(deletionPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const graphMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGraphMutationSlice.ts",
      ),
      "utf8",
    );
    const graphChangeController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasGraphChangeController.ts",
      ),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(deletionPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition",
    );
    const deletionDeclaration = [
      "export function",
      "deleteCanvasEdge(",
    ].join(" ");
    const eligibilityDeclaration = [
      "export function",
      "canDeleteCanvasEdge(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(deletionDeclaration),
      )
      .map(relativeSource)
      .sort();
    const eligibilityOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(eligibilityDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/domain/canvasEdgeDeletion.ts",
    ]);
    expect(eligibilityOwners).toEqual([
      "features/canvas/domain/canvasEdgeDeletion.ts",
    ]);
    expect(deletionModel).toContain(deletionDeclaration);
    expect(deletionModel).toContain(eligibilityDeclaration);
    expect(deletionModel).toContain("canDeleteCanvasEdge(edge)");
    expect(graphMutationSlice).toContain(
      "../domain/canvasEdgeDeletion",
    );
    expect(canvasStore).not.toContain(
      "@/features/canvas/domain/canvasEdgeDeletion",
    );
    expect(canvasStore).not.toContain("isPresetManagedEdge(");
    expect(canvasStore).not.toContain(
      "state.edges.filter((edge) => edge.id !== edgeId)",
    );
    expect(graphChangeController).toContain("canDeleteCanvasEdge(edge)");
    expect(graphChangeController).toContain("deleteEdge(edge.id)");
    expect(graphChangeController).not.toContain("isPresetManagedEdge(");
    expect(canvasView).not.toContain("isPresetManagedEdge(");
  });

  it("keeps shared code independent from application and business layers", () => {
    const forbiddenPrefixes = [
      "@/app/",
      "@/api/",
      "@/components/",
      "@/features/",
      "@/hooks/",
      "@/lib/",
      "@/modules/",
      "@/routes/",
      "@/stores/",
      "@/task-center/",
    ];
    const failures = sourceFiles(resolve(SRC_ROOT, "shared")).flatMap((path) =>
      importSpecifiers(path)
        .filter((specifier) =>
          forbiddenPrefixes.some((prefix) => specifier.startsWith(prefix)),
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    expect(failures).toEqual([]);
  });

  it("keeps mention textarea domain, interaction, and view ownership separate", () => {
    const legacyComponentPath = resolve(
      SRC_ROOT,
      "components/episode/beat-workbench/mention-textarea.tsx",
    );
    const componentSource = readFileSync(
      resolve(SRC_ROOT, "features/mention-textarea/MentionTextarea.tsx"),
      "utf8",
    );
    const controllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "features/mention-textarea/application/use-mention-textarea-controller.ts",
      ),
      "utf8",
    );
    const domainSource = readFileSync(
      resolve(
        SRC_ROOT,
        "features/mention-textarea/domain/mention-text.ts",
      ),
      "utf8",
    );
    const publicSource = readFileSync(
      resolve(SRC_ROOT, "features/mention-textarea/public.ts"),
      "utf8",
    );
    const viewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "features/mention-textarea/presentation/MentionTextareaView.tsx",
      ),
      "utf8",
    );
    const legacyImports = sourceFiles(SRC_ROOT)
      .flatMap((path) => importSpecifiers(path))
      .filter(
        (specifier) =>
          specifier ===
          "@/components/episode/beat-workbench/mention-textarea",
      );
    const externalInternalImports = sourceFiles(SRC_ROOT)
      .filter(
        (path) =>
          !relativeSource(path).startsWith("features/mention-textarea/"),
      )
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier.startsWith("@/features/mention-textarea/") &&
              specifier !== "@/features/mention-textarea/public",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      );

    expect(existsSync(legacyComponentPath)).toBe(false);
    expect(legacyImports).toEqual([]);
    expect(externalInternalImports).toEqual([]);
    expect(componentSource).toContain("useMentionTextareaController");
    expect(componentSource).toContain("<MentionTextareaView");
    expect(componentSource).not.toContain("useState");
    expect(controllerSource).toContain("normalizeMentionSeparatorSpaces");
    expect(controllerSource).toContain("findMentionTokenAtSelection");
    expect(controllerSource).not.toContain("createPortal");
    expect(controllerSource).not.toContain("className=");
    expect(domainSource).toContain("export function buildMentionSegments");
    expect(domainSource).toContain(
      "export function findMentionTokenAtSelection",
    );
    expect(domainSource).toContain("export function insertMentionText");
    expect(domainSource).toContain("export function replaceMentionText");
    expect(domainSource).not.toContain('from "react"');
    expect(domainSource).not.toContain("document.");
    expect(domainSource).not.toContain("window.");
    expect(viewSource).toContain("createPortal");
    expect(viewSource).toContain("<textarea");
    expect(viewSource).not.toContain("useState");
    expect(viewSource).not.toContain("detectMentionQuery");
    expect(viewSource).not.toContain("normalizeMentionSeparatorSpaces");
    expect(publicSource).toContain("export { MentionTextarea }");
    expect(publicSource).toContain("findMentionTokenAtSelection,");
  });

  it("keeps a single shared HTTP transport implementation", () => {
    const legacyImplementations = [
      "api/client.ts",
      "lib/api.ts",
      "lib/api-errors.ts",
      "lib/api-path.ts",
    ].filter((path) => existsSync(resolve(SRC_ROOT, path)));
    const transportFactories = sourceFiles(SRC_ROOT)
      .filter((path) => !relativeSource(path).startsWith("__tests__/"))
      .filter((path) => readFileSync(path, "utf8").includes("ky.create("))
      .map(relativeSource);

    expect(legacyImplementations).toEqual([]);
    expect(transportFactories).toEqual(["shared/api/transport.ts"]);
  });

  it("keeps Model Usage callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/model_usage");
    const modelGatewayAdapterPath = resolve(
      moduleRoot,
      "infrastructure/http-model-gateway-gateway.ts",
    );
    const modelGatewayEndpoints = [
      "api/v1/model-gateway/config",
      "api/v1/model-gateway/official/config",
      "api/v1/model-gateway/official/enable",
      "api/v1/model-gateway/custom/newapi/init",
      "api/v1/model-gateway/custom/newapi/provider-channels",
      "api/v1/model-gateway/custom/newapi/provider-channel/sync",
      "api/v1/model-gateway/custom/newapi/channels",
      "api/v1/model-gateway/custom/newapi/media-models",
      "api/v1/model-gateway/custom/newapi/embedding-model",
      "api/v1/model-gateway/media-relay/config",
      "api/v1/model-gateway/custom/newapi/channels/batch",
    ];
    const externalSources = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(moduleRoot))
      .filter((path) => !relativeSource(path).startsWith("__tests__/"));
    const internalImportFailures = externalSources.flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/modules/model_usage/") &&
            specifier !== "@/modules/model_usage/public",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const endpointOwners = externalSources
      .filter((path) =>
        readFileSync(path, "utf8").includes("api/v1/generation-credit-cost"),
      )
      .map(relativeSource);
    const modelGatewayEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !relativeSource(path).startsWith("__tests__/"))
      .filter((path) =>
        readFileSync(path, "utf8").includes("api/v1/model-gateway/"),
      )
      .map(relativeSource);
    const legacyModelGatewayImports = sourceFiles(SRC_ROOT)
      .flatMap((path) => importSpecifiers(path))
      .filter((specifier) => specifier === "@/lib/queries/model-gateway");
    const modelGatewayAdapterSource = readFileSync(
      modelGatewayAdapterPath,
      "utf8",
    );

    expect(
      existsSync(resolve(SRC_ROOT, "lib/queries/generation-credit-cost.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "lib/queries/model-gateway.ts")),
    ).toBe(false);
    expect(internalImportFailures).toEqual([]);
    expect(endpointOwners).toEqual([]);
    expect(legacyModelGatewayImports).toEqual([]);
    expect(modelGatewayEndpointOwners).toEqual([
      "modules/model_usage/infrastructure/http-model-gateway-gateway.ts",
    ]);
    expect(
      modelGatewayAdapterSource.match(/api\/v1\/model-gateway\//g),
    ).toHaveLength(modelGatewayEndpoints.length);
    for (const endpoint of modelGatewayEndpoints) {
      expect(modelGatewayAdapterSource).toContain(`"${endpoint}"`);
    }
    for (const caller of [
      "components/layout/header.tsx",
      "components/settings/settings-dialog.tsx",
    ]) {
      expect(importSpecifiers(resolve(SRC_ROOT, caller))).toContain(
        "@/modules/model_usage/public",
      );
    }
    expect(
      readFileSync(
        resolve(
          moduleRoot,
          "infrastructure/http-generation-credit-gateway.ts",
        ),
        "utf8",
      ),
    ).toContain("api/v1/generation-credit-cost");
  });

  it("keeps Platform Release callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/platform_release");
    const externalSources = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(moduleRoot))
      .filter((path) => !relativeSource(path).startsWith("__tests__/"));
    const internalImportFailures = externalSources.flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/modules/platform_release/") &&
            specifier !== "@/modules/platform_release/public",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const endpointOwners = externalSources
      .filter((path) =>
        readFileSync(path, "utf8").includes("api/v1/release-notifications"),
      )
      .map(relativeSource);
    const storageOwners = externalSources
      .filter((path) =>
        readFileSync(path, "utf8").includes("ai-anime:release-seen:"),
      )
      .map(relativeSource);
    const versionManifestOwners = externalSources
      .filter((path) => readFileSync(path, "utf8").includes("/version.json"))
      .map(relativeSource);
    const chunkRecoveryOwners = externalSources
      .filter((path) =>
        readFileSync(path, "utf8").includes("vite:preloadError"),
      )
      .map(relativeSource);
    const removedRuntimeUpdateFiles = [
      "lib/app-update-available.ts",
      "lib/chunk-load-recovery.ts",
      "lib/version-update-watch.ts",
      "components/app-update-available.tsx",
      "components/app-update-required.tsx",
      "features/version-update/VersionUpdateDialog.tsx",
      "features/version-update/version-update-events.ts",
    ].filter((path) => existsSync(resolve(SRC_ROOT, path)));

    expect(existsSync(resolve(SRC_ROOT, "lib/queries/release-notifications.ts"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/release-notification-state.ts"))).toBe(false);
    expect(removedRuntimeUpdateFiles).toEqual([]);
    expect(internalImportFailures).toEqual([]);
    expect(endpointOwners).toEqual([]);
    expect(storageOwners).toEqual([]);
    expect(versionManifestOwners).toEqual([]);
    expect(chunkRecoveryOwners).toEqual([]);
    expect(
      readFileSync(
        resolve(
          moduleRoot,
          "infrastructure/http-release-notification-gateway.ts",
        ),
        "utf8",
      ),
    ).toContain("api/v1/release-notifications");
    expect(
      readFileSync(
        resolve(
          moduleRoot,
          "infrastructure/browser-release-notification-storage.ts",
        ),
        "utf8",
      ),
    ).toContain("ai-anime:release-seen:");
    expect(
      readFileSync(
        resolve(
          moduleRoot,
          "infrastructure/browser-version-update-watch.ts",
        ),
        "utf8",
      ),
    ).toContain("/version.json");
    expect(
      readFileSync(
        resolve(
          moduleRoot,
          "infrastructure/browser-chunk-load-recovery.ts",
        ),
        "utf8",
      ),
    ).toContain("vite:preloadError");
  });

  it("keeps Story Intake callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/story_intake");
    const externalSources = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(moduleRoot))
      .filter((path) => !relativeSource(path).startsWith("__tests__/"));
    const internalImportFailures = externalSources.flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/modules/story_intake/") &&
            specifier !== "@/modules/story_intake/public",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const directEndpointFailures = externalSources
      .filter((path) =>
        readFileSync(path, "utf8")
          .split(/\r?\n/)
          .some((line) =>
            /api\/v1\/projects\/.*\/(?:ingest\/(?:upload|start|graph)|chapters)/.test(
              line,
            ),
          ),
      )
      .map(relativeSource);
    expect(existsSync(resolve(SRC_ROOT, "lib/queries/ingest.ts"))).toBe(false);
    expect(internalImportFailures).toEqual([]);
    expect(directEndpointFailures).toEqual([]);
  });

  it("keeps Identity & Access callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/identity_access");
    const externalSources = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(moduleRoot))
      .filter((path) => !relativeSource(path).startsWith("__tests__/"));
    const internalImportFailures = externalSources.flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/modules/identity_access/") &&
            specifier !== "@/modules/identity_access/public",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const directEndpointFailures = externalSources
      .filter((path) =>
        /["']\/api\/v1\/(?:auth\/(?:login|authorize|logout|me)|account\/avatar)/.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map(relativeSource);

    expect(existsSync(resolve(SRC_ROOT, "stores/auth-store.ts"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/auth-adapter.ts"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/auth-mode.ts"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/queries/auth.ts"))).toBe(false);
    expect(internalImportFailures).toEqual([]);
    expect(directEndpointFailures).toEqual([]);
  });

  it("keeps Project Workspace callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/project_workspace");
    const externalSources = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(moduleRoot))
      .filter((path) => !relativeSource(path).startsWith("__tests__/"));
    const internalImportFailures = externalSources.flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/modules/project_workspace/") &&
            specifier !== "@/modules/project_workspace/public",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const directLifecycleEndpointFailures = externalSources
      .filter((path) =>
        /api\/v1\/projects(?:\/summaries|\/[^/`$]+\/(?:archive|unarchive|delete|restore|purge|grants))/.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map(relativeSource);

    for (const legacyPath of [
      "lib/queries/projects.ts",
      "lib/project-route.ts",
      "lib/project-permissions.ts",
      "stores/project-nav-store.ts",
      "types/project.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, legacyPath))).toBe(false);
    }
    expect(internalImportFailures).toEqual([]);
    expect(directLifecycleEndpointFailures).toEqual([]);
  });

  it("keeps Narrative Planning callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/narrative_planning");
    const narrativePublicSource = readFileSync(
      resolve(moduleRoot, "public.ts"),
      "utf8",
    );
    const beatsPageViewSource = readFileSync(
      resolve(moduleRoot, "presentation/BeatsPageView.tsx"),
      "utf8",
    );
    const beatsPageControllerSource = readFileSync(
      resolve(moduleRoot, "application/use-beats-page-controller.ts"),
      "utf8",
    );
    const workbenchStateSource = readFileSync(
      resolve(moduleRoot, "application/episode-workbench-state.ts"),
      "utf8",
    );
    const beatSelectionSource = readFileSync(
      resolve(moduleRoot, "infrastructure/use-beat-selection.ts"),
      "utf8",
    );
    const viewToggleStateSource = readFileSync(
      resolve(moduleRoot, "infrastructure/use-beats-view-toggles.ts"),
      "utf8",
    );
    const compositionSource = readFileSync(
      resolve(moduleRoot, "composition.ts"),
      "utf8",
    );
    const viewTogglesSource = readFileSync(
      resolve(moduleRoot, "presentation/ViewToggles.tsx"),
      "utf8",
    );
    const sketchStudioControllerSource = readFileSync(
      resolve(moduleRoot, "application/use-sketch-studio-controller.ts"),
      "utf8",
    );
    const sketchStudioViewSource = readFileSync(
      resolve(moduleRoot, "presentation/SketchStudioActionsView.tsx"),
      "utf8",
    );
    const singleBeatPanelSource = sourceSection(
      resolve(moduleRoot, "action-panel-composition.ts"),
      "export interface SingleBeatPanelProps",
      "export interface ActionPanelProps",
    );
    const singleBeatPanelViewSource = readFileSync(
      resolve(moduleRoot, "presentation/SingleBeatPanelView.tsx"),
      "utf8",
    );
    const singleBeatPanelControllerSource = readFileSync(
      resolve(
        moduleRoot,
        "application/use-single-beat-panel-controller.ts",
      ),
      "utf8",
    );
    const actionPanelSource = sourceSection(
      resolve(moduleRoot, "action-panel-composition.ts"),
      "export interface ActionPanelProps",
    );
    const actionPanelControllerSource = readFileSync(
      resolve(moduleRoot, "application/use-action-panel-controller.ts"),
      "utf8",
    );
    const actionPanelViewSource = readFileSync(
      resolve(moduleRoot, "presentation/ActionPanelView.tsx"),
      "utf8",
    );
    const actionPanelStateSource = readFileSync(
      resolve(
        moduleRoot,
        "infrastructure/episode-workbench-section-state.ts",
      ),
      "utf8",
    );
    const beatCardGridCompositionPath = resolve(
      moduleRoot,
      "beat-card-grid-composition.ts",
    );
    const insertManualShotDialogSource = sourceSection(
      beatCardGridCompositionPath,
      "export interface InsertManualShotDialogProps",
      "function BeatCardAdapter",
    );
    const insertManualShotDialogControllerSource = readFileSync(
      resolve(
        moduleRoot,
        "application/use-insert-manual-shot-dialog-controller.ts",
      ),
      "utf8",
    );
    const insertManualShotDialogViewSource = readFileSync(
      resolve(moduleRoot, "presentation/InsertManualShotDialogView.tsx"),
      "utf8",
    );
    const beatCardGridSource = sourceSection(
      beatCardGridCompositionPath,
      "export interface BeatCardGridProps",
    );
    const beatCardSource = sourceSection(
      beatCardGridCompositionPath,
      "function BeatCardAdapter",
      "export interface BeatCardGridProps",
    );
    const beatCardControllerSource = readFileSync(
      resolve(
        moduleRoot,
        "application/create-beat-card-controller.ts",
      ),
      "utf8",
    );
    const beatCardViewSource = readFileSync(
      resolve(moduleRoot, "presentation/BeatCardView.tsx"),
      "utf8",
    );
    const beatCardGridControllerSource = readFileSync(
      resolve(
        moduleRoot,
        "application/use-beat-card-grid-controller.ts",
      ),
      "utf8",
    );
    const beatCardGridViewSource = readFileSync(
      resolve(moduleRoot, "presentation/BeatCardGridView.tsx"),
      "utf8",
    );
    const textPaneSource = sourceSection(
      resolve(moduleRoot, "text-pane-composition.ts"),
      "export interface TextPaneProps",
    );
    const textPaneViewSource = readFileSync(
      resolve(moduleRoot, "presentation/TextPaneView.tsx"),
      "utf8",
    );
    const textPaneControllerSource = readFileSync(
      resolve(moduleRoot, "application/use-text-pane-controller.ts"),
      "utf8",
    );
    const externalSources = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(moduleRoot))
      .filter((path) => !relativeSource(path).startsWith("__tests__/"));
    const internalImportFailures = externalSources.flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/modules/narrative_planning/") &&
            specifier !== "@/modules/narrative_planning/public",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const ownedEndpointPatterns = [
      /p`api\/v1\/projects\/\$\{[^}]+\}\/episodes`/,
      /p`api\/v1\/projects\/\$\{[^}]+\}\/episodes\/\$\{[^}]+\}`/,
      /p`api\/v1\/projects\/\$\{[^}]+\}\/episodes\/\$\{[^}]+\}\/beats`/,
      /p`api\/v1\/projects\/\$\{[^}]+\}\/episodes\/\$\{[^}]+\}\/script`/,
      /p`api\/v1\/projects\/\$\{[^}]+\}\/pipeline\/status`/,
    ];
    const directEndpointFailures = externalSources
      .filter((path) =>
        ownedEndpointPatterns.some((pattern) =>
          pattern.test(readFileSync(path, "utf8")),
        ),
      )
      .map(relativeSource);
    const applicationDataImportFailures = sourceFiles(
      resolve(moduleRoot, "application"),
    ).flatMap((path) =>
      importSpecifiers(path)
        .filter(isRawDataImport)
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const applicationViewImportFailures = sourceFiles(
      resolve(moduleRoot, "application"),
    ).flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/components/") ||
            specifier.startsWith(
              "@/modules/narrative_planning/presentation/",
            ),
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const presentationBoundaryFailures = sourceFiles(
      resolve(moduleRoot, "presentation"),
    ).flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            isRawDataImport(specifier) ||
            specifier === "@tanstack/react-router",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );

    for (const legacyPath of [
      "lib/episode-stats.ts",
      "lib/queries/episodes.ts",
      "lib/queries/scripts.ts",
      "components/episode/beat-workbench/sketch-studio-actions.tsx",
      "components/episode/beat-workbench/view-toggles.tsx",
      "components/episode/beat-workbench/text-pane.tsx",
      "components/episode/beat-workbench/action-panel.tsx",
      "components/episode/beat-workbench/single-beat-panel.tsx",
      "components/episode/beat-workbench/beat-card-grid.tsx",
      "components/episode/beat-workbench/beat-card.tsx",
      "components/episode/beat-workbench/insert-manual-shot-dialog.tsx",
      "hooks/use-selection.ts",
      "hooks/use-view-toggles.ts",
      "types/episode.ts",
      "types/script.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, legacyPath))).toBe(false);
    }
    expect(applicationDataImportFailures).toEqual([]);
    expect(applicationViewImportFailures).toEqual([]);
    expect(presentationBoundaryFailures).toEqual([]);
    expect(internalImportFailures).toEqual([]);
    expect(directEndpointFailures).toEqual([]);
    expect(beatsPageViewSource).toContain(
      "<SketchColorLegendView controller={sketchStudio} />",
    );
    expect(beatsPageViewSource).toContain(
      "checkedCount={checkedBeatNumbers.length}",
    );
    expect(workbenchStateSource).toContain("export type SelectionState");
    expect(workbenchStateSource).toContain("export type BeatsViewToggleId");
    expect(beatsPageControllerSource).toContain(
      "dependencies.useBeatSelection",
    );
    expect(beatsPageControllerSource).toContain(
      "dependencies.useViewToggles",
    );
    expect(beatsPageControllerSource).not.toContain(
      "@/stores/episode-workbench-store",
    );
    expect(beatSelectionSource).toContain("useEpisodeWorkbenchStore");
    expect(viewToggleStateSource).toContain("useEpisodeWorkbenchStore");
    expect(compositionSource).toContain("useBeatSelection,");
    expect(compositionSource).toContain(
      "useViewToggles: useBeatsViewToggles",
    );
    expect(viewTogglesSource).toContain("checkedCount: number");
    expect(viewTogglesSource).not.toContain("SelectionState");
    expect(viewTogglesSource).not.toContain("@/hooks/use-selection");
    expect(viewTogglesSource).not.toContain("@/hooks/use-view-toggles");
    expect(beatsPageViewSource).toContain("<SketchStudioActionsView");
    expect(sketchStudioControllerSource).toContain("queries.useScript");
    expect(sketchStudioControllerSource).toContain(
      "dependencies.useCharacters",
    );
    expect(sketchStudioViewSource).not.toContain("useScript(");
    expect(sketchStudioViewSource).not.toContain("useCharacters(");
    expect(sketchStudioViewSource).not.toContain("useEpisodeBeats(");
    expect(sketchStudioViewSource).not.toContain("useEpisodeDetail(");
    expect(singleBeatPanelSource).toContain(
      "createElement(SingleBeatPanelView",
    );
    expect(singleBeatPanelSource).toContain(
      "useSingleBeatPanelController({",
    );
    expect(singleBeatPanelSource).toContain(
      "renderSectionContent,",
    );
    expect(singleBeatPanelSource).not.toContain("className=");
    expect(singleBeatPanelSource).not.toContain("<Select");
    expect(singleBeatPanelSource).not.toContain("<motion.");
    expect(singleBeatPanelSource).not.toContain("useState(");
    expect(singleBeatPanelSource).not.toContain("useEscapeToClose(");
    expect(singleBeatPanelSource).not.toContain("useGridsByBeat(");
    expect(singleBeatPanelSource).not.toContain("useVideoBackends(");
    expect(singleBeatPanelSource).not.toContain("resolveImage(");
    expect(singleBeatPanelSource).not.toContain("useSaveState(");
    expect(singleBeatPanelViewSource).toContain("className=");
    expect(singleBeatPanelViewSource).toContain("<Select");
    expect(singleBeatPanelViewSource).toContain("<motion.div");
    expect(singleBeatPanelViewSource).toContain("useState<string");
    expect(singleBeatPanelViewSource).toContain("useEscapeToClose(");
    expect(singleBeatPanelViewSource).not.toContain("useGridsByBeat(");
    expect(singleBeatPanelViewSource).not.toContain("useVideoBackends(");
    expect(singleBeatPanelViewSource).not.toContain("resolveImage(");
    expect(singleBeatPanelViewSource).toContain(
      "controller: SingleBeatPanelController",
    );
    expect(singleBeatPanelControllerSource).toContain(
      "createUseSingleBeatPanelController",
    );
    expect(singleBeatPanelControllerSource).toContain(
      "queries.useGridsByBeat",
    );
    expect(singleBeatPanelControllerSource).toContain(
      "queries.useVideoBackends",
    );
    expect(singleBeatPanelControllerSource).toContain(
      "dependencies.useAssetWorkspaceNavigation",
    );
    expect(singleBeatPanelControllerSource).toContain(
      "dependencies.useSaveState",
    );
    expect(singleBeatPanelControllerSource).not.toContain("className=");
    expect(singleBeatPanelControllerSource).not.toContain("document.");
    expect(singleBeatPanelControllerSource).not.toContain("navigator.");
    expect(actionPanelSource).toContain("useActionPanelController({");
    expect(actionPanelSource).toContain("createElement(ActionPanelView");
    expect(actionPanelSource).not.toContain("useEffect(");
    expect(actionPanelSource).not.toContain("useMemo(");
    expect(actionPanelSource).not.toContain("useEpisodeWorkbenchStore(");
    expect(actionPanelSource).not.toContain("episodeWorkbenchScopeKey(");
    expect(actionPanelSource).not.toContain("<EpisodeEmptyState");
    expect(actionPanelControllerSource).toContain(
      "createUseActionPanelController",
    );
    expect(actionPanelControllerSource).toContain(
      "dependencies.useSectionState",
    );
    expect(actionPanelControllerSource).toContain("useEffect(");
    expect(actionPanelControllerSource).toContain("useCallback(");
    expect(actionPanelControllerSource).not.toContain("className=");
    expect(actionPanelViewSource).toContain("<EpisodeEmptyState");
    expect(actionPanelViewSource).not.toContain("useEpisodeWorkbenchStore(");
    expect(actionPanelStateSource).toContain("useEpisodeWorkbenchStore(");
    expect(actionPanelStateSource).toContain("episodeWorkbenchScopeKey(");
    expect(beatsPageViewSource).toContain(
      "@/modules/narrative_planning/action-panel-composition",
    );
    expect(narrativePublicSource).not.toContain("useActionPanelController");
    expect(narrativePublicSource).not.toContain(
      "useSingleBeatPanelController",
    );
    expect(narrativePublicSource).not.toContain("ActionPanelView");
    expect(narrativePublicSource).not.toContain("SingleBeatPanelView");
    expect(narrativePublicSource).not.toContain(
      "SingleBeatPanelControllerOptions",
    );
    expect(beatsPageViewSource).toContain(
      "@/modules/narrative_planning/beat-card-grid-composition",
    );
    expect(narrativePublicSource).not.toContain(
      "useBeatCardGridController",
    );
    expect(narrativePublicSource).not.toContain(
      "useInsertManualShotDialogController",
    );
    expect(narrativePublicSource).not.toContain("BeatCardGridView");
    expect(narrativePublicSource).not.toContain("BeatCardView");
    expect(narrativePublicSource).not.toContain(
      "InsertManualShotDialogView",
    );
    expect(narrativePublicSource).not.toContain(
      "BeatCardControllerOptions",
    );
    expect(narrativePublicSource).not.toContain(
      "InsertManualShotDialogControllerOptions",
    );
    expect(insertManualShotDialogSource).toContain(
      "useInsertManualShotDialogController({",
    );
    expect(insertManualShotDialogSource).toContain(
      "createElement(InsertManualShotDialogView",
    );
    expect(insertManualShotDialogSource).not.toContain("useState(");
    expect(insertManualShotDialogSource).not.toContain("useEpisodeBeats(");
    expect(insertManualShotDialogSource).not.toContain("useEpisodeDetail(");
    expect(insertManualShotDialogSource).not.toContain("useInsertManualShot(");
    expect(insertManualShotDialogSource).not.toContain("toast.");
    expect(insertManualShotDialogSource).not.toContain("className=");
    expect(insertManualShotDialogControllerSource).toContain(
      "createUseInsertManualShotDialogController",
    );
    expect(insertManualShotDialogControllerSource).toContain(
      "queries.useEpisodeBeats",
    );
    expect(insertManualShotDialogControllerSource).toContain(
      "queries.useEpisodeDetail",
    );
    expect(insertManualShotDialogControllerSource).toContain(
      "queries.useInsertManualShot",
    );
    expect(insertManualShotDialogControllerSource).toContain(
      "mentionsToProgramMarkers",
    );
    expect(insertManualShotDialogControllerSource).toContain(
      "sceneNameToRef",
    );
    expect(insertManualShotDialogControllerSource).not.toContain("className=");
    expect(insertManualShotDialogControllerSource).not.toContain("<Dialog");
    expect(insertManualShotDialogViewSource).toContain(
      "controller: InsertManualShotDialogController",
    );
    expect(insertManualShotDialogViewSource).toContain("<Dialog");
    expect(insertManualShotDialogViewSource).toContain("<MentionTextarea");
    expect(insertManualShotDialogViewSource).not.toContain(
      "useEpisodeBeats(",
    );
    expect(insertManualShotDialogViewSource).not.toContain(
      "useEpisodeDetail(",
    );
    expect(insertManualShotDialogViewSource).not.toContain(
      "useInsertManualShot(",
    );
    expect(insertManualShotDialogViewSource).not.toContain("toast.");
    expect(beatCardSource).toContain("createElement(BeatCardView");
    expect(beatCardSource).toContain("createBeatCardController(props)");
    expect(beatCardSource).not.toContain("className=");
    expect(beatCardSource).not.toContain("resolveImage(");
    expect(beatCardSource).not.toContain("resolveMediaUrl(");
    expect(beatCardSource).not.toContain("useTranslation(");
    expect(beatCardControllerSource).toContain(
      "createBeatCardController",
    );
    expect(beatCardControllerSource).toContain("resolveImage(");
    expect(beatCardControllerSource).toContain("mainMediaKind");
    expect(beatCardControllerSource).not.toContain("className=");
    expect(beatCardControllerSource).not.toContain("useTranslation(");
    expect(beatCardViewSource).toContain(
      "controller: BeatCardController",
    );
    expect(beatCardViewSource).toContain("function ImageSlot");
    expect(beatCardViewSource).toContain("className=");
    expect(beatCardViewSource).not.toContain("resolveImage(");
    expect(beatCardGridSource).toContain("useBeatCardGridController({");
    expect(beatCardGridSource).toContain(
      "createElement(BeatCardGridView",
    );
    expect(beatCardGridSource).toContain("createElement(BeatCard");
    expect(beatCardGridSource).toContain(
      "createElement(InsertManualShotDialog",
    );
    expect(beatCardGridSource).not.toContain("useState(");
    expect(beatCardGridSource).not.toContain("useEffect(");
    expect(beatCardGridSource).not.toContain("useGridsByBeat(");
    expect(beatCardGridSource).not.toContain("useDeleteManualShot(");
    expect(beatCardGridSource).not.toContain(
      "openPresetProjectionInMyCanvas",
    );
    expect(beatCardGridSource).not.toContain("useResponsiveColumns(");
    expect(beatCardGridSource).not.toContain("toast.");
    expect(beatCardGridSource).not.toContain("<AlertDialog");
    expect(beatCardGridControllerSource).toContain(
      "createUseBeatCardGridController",
    );
    expect(beatCardGridControllerSource).toContain(
      "queries.useGridsByBeat",
    );
    expect(beatCardGridControllerSource).toContain(
      "queries.useDeleteManualShot",
    );
    expect(beatCardGridControllerSource).toContain(
      "dependencies.openBeatFreezone",
    );
    expect(beatCardGridControllerSource).toContain("toast.");
    expect(beatCardGridControllerSource).not.toContain("className=");
    expect(beatCardGridControllerSource).not.toContain("querySelector");
    expect(beatCardGridControllerSource).not.toContain("scrollIntoView");
    expect(beatCardGridViewSource).toContain("useResponsiveColumns(");
    expect(beatCardGridViewSource).toContain("querySelector");
    expect(beatCardGridViewSource).toContain("scrollIntoView");
    expect(beatCardGridViewSource).toContain("<AlertDialog");
    expect(beatCardGridViewSource).toContain(
      "controller: BeatCardGridController",
    );
    expect(beatCardGridViewSource).not.toContain("useGridsByBeat(");
    expect(beatCardGridViewSource).not.toContain("useDeleteManualShot(");
    expect(beatCardGridViewSource).not.toContain("toast.");
    expect(textPaneSource).toContain("createElement(TextPaneView");
    expect(textPaneSource).toContain("useTextPaneController({");
    expect(textPaneSource).not.toContain("useState(");
    expect(textPaneSource).not.toContain("useEffect(");
    expect(textPaneSource).not.toContain("useUpdateBeat(");
    expect(textPaneSource).not.toContain("useEpisodeDetail(");
    expect(textPaneSource).not.toContain("useScenes(");
    expect(textPaneSource).not.toContain("useScenePlatePreview(");
    expect(textPaneSource).not.toContain("trackSave(");
    expect(textPaneSource).not.toContain("toast.");
    expect(textPaneSource).not.toContain("mentionsToProgramMarkers");
    expect(textPaneSource).not.toContain("sceneNameToRef");
    expect(textPaneSource).not.toContain("className=");
    expect(textPaneSource).not.toContain("<Select");
    expect(textPaneSource).not.toContain("<MentionTextarea");
    expect(textPaneSource).not.toContain("<ArrowUpRight");
    expect(textPaneSource).not.toContain("function Field");
    expect(textPaneSource).not.toContain("function IdentityBadgeGroup");
    expect(textPaneSource).not.toContain("function MetadataSection");
    expect(textPaneSource).not.toContain("timeOfDayLabel(");
    expect(textPaneViewSource).toContain("className=");
    expect(textPaneViewSource).toContain("<Select");
    expect(textPaneViewSource).toContain("<MentionTextarea");
    expect(textPaneViewSource).toContain("function IdentityBadgeGroup");
    expect(textPaneViewSource).toContain("function MetadataSection");
    expect(textPaneViewSource).toContain("timeOfDayLabel(");
    expect(textPaneViewSource).toContain(
      "controller: TextPaneController",
    );
    expect(textPaneViewSource).not.toContain("TextPaneViewModel");
    expect(textPaneViewSource).not.toContain("useUpdateBeat(");
    expect(textPaneViewSource).not.toContain("useEpisodeDetail(");
    expect(textPaneViewSource).not.toContain("useScenes(");
    expect(textPaneViewSource).not.toContain("useScenePlatePreview(");
    expect(textPaneViewSource).not.toContain("trackSave(");
    expect(textPaneViewSource).not.toContain("toast.");
    expect(textPaneViewSource).not.toContain("mentionsToProgramMarkers");
    expect(textPaneViewSource).not.toContain("extractIdentityMarkers");
    expect(textPaneControllerSource).toContain(
      "createUseTextPaneController",
    );
    expect(textPaneControllerSource).toContain("queries.useUpdateBeat");
    expect(textPaneControllerSource).toContain("queries.useEpisodeDetail");
    expect(textPaneControllerSource).toContain("queries.useScenes");
    expect(textPaneControllerSource).toContain(
      "queries.useScenePlatePreview",
    );
    expect(textPaneControllerSource).toContain(
      "dependencies.useAssetNavigation",
    );
    expect(textPaneControllerSource).toContain(
      "dependencies.beatTextScope",
    );
    expect(textPaneControllerSource).toContain("dependencies.trackSave");
    expect(textPaneControllerSource).toContain("useState(");
    expect(textPaneControllerSource).toContain("useEffect(");
    expect(textPaneControllerSource).toContain("mentionsToProgramMarkers");
    expect(narrativePublicSource).toContain(
      'export { TextPane } from "@/modules/narrative_planning/text-pane-composition";',
    );
    expect(narrativePublicSource).not.toContain("useTextPaneController");
    expect(narrativePublicSource).not.toContain("TextPaneView");
    expect(narrativePublicSource).not.toContain("TextPaneControllerOptions");
    expect(textPaneControllerSource).toContain("extractIdentityMarkers");
    expect(textPaneControllerSource).toContain("sceneNameToRef");
    expect(textPaneControllerSource).not.toContain("className=");
    expect(textPaneControllerSource).not.toContain("<Select");
    expect(textPaneControllerSource).not.toContain("<MentionTextarea");
  });

  it("keeps episode and Beat catalog reads behind the Narrative Planning application port", () => {
    const legacyApiPath = resolve(SRC_ROOT, "api/projects.ts");
    const applicationPath = resolve(
      SRC_ROOT,
      "modules/narrative_planning/application/catalog-queries.ts",
    );
    const gatewayPath = resolve(
      SRC_ROOT,
      "modules/narrative_planning/infrastructure/http-narrative-planning-gateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "modules/narrative_planning/composition.ts",
    );
    const publicPath = resolve(
      SRC_ROOT,
      "modules/narrative_planning/public.ts",
    );
    const compositionSource = readFileSync(compositionPath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const consumerPaths = [
      "features/freezone/hooks/useCommitDialogTargetController.ts",
      "features/freezone/presentation/CommitDialogView.tsx",
    ];
    const episodeListEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          ".get(p`api/v1/projects/${project}/episodes`,",
        ),
      )
      .map(relativeSource)
      .sort();
    const beatListEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          ".get(p`api/v1/projects/${project}/episodes/${episode}/beats`,",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "@/modules/narrative_planning/application/ports",
        "@/modules/narrative_planning/domain/types",
      ]),
    );
    expect(existsSync(legacyApiPath)).toBe(false);
    expect(episodeListEndpointOwners).toEqual([
      "modules/narrative_planning/infrastructure/http-narrative-planning-gateway.ts",
    ]);
    expect(beatListEndpointOwners).toEqual([
      "modules/narrative_planning/infrastructure/http-narrative-planning-gateway.ts",
    ]);
    for (const consumerPath of consumerPaths) {
      const imports = importSpecifiers(resolve(SRC_ROOT, consumerPath));
      expect(imports).toContain("@/modules/narrative_planning/public");
      expect(imports).not.toContain("@/api/projects");
    }
    expect(compositionSource).toContain("listEpisodesUseCase(");
    expect(compositionSource).toContain("listBeatsUseCase(");
    expect(publicSource).toContain("listEpisodes,");
    expect(publicSource).toContain("listBeats,");
    expect(readFileSync(gatewayPath, "utf8")).toContain(
      "async listEpisodes(project, signal)",
    );
    expect(readFileSync(gatewayPath, "utf8")).toContain(
      "async getBeats(project, episode, signal)",
    );
  });

  it("keeps Asset & World callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/asset_world");
    const externalSources = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(moduleRoot))
      .filter((path) => !relativeSource(path).startsWith("__tests__/"));
    const internalImportFailures = externalSources.flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/modules/asset_world/") &&
            specifier !== "@/modules/asset_world/public",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const directAssetEndpointFailures = externalSources
      .filter((path) =>
        /api\/v1\/(?:styles|projects\/.*\/(?:styles|characters|character-image-selection|character-image-usage|image-source-selection))/.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map(relativeSource);
    const applicationDataImportFailures = sourceFiles(
      resolve(moduleRoot, "application"),
    ).flatMap((path) =>
      importSpecifiers(path)
        .filter(isRawDataImport)
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const applicationViewImportFailures = sourceFiles(
      resolve(moduleRoot, "application"),
    ).flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier.startsWith("@/components/") ||
            specifier.startsWith("@/modules/asset_world/presentation/"),
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );
    const applicationBrowserRecordingFailures = sourceFiles(
      resolve(moduleRoot, "application"),
    )
      .filter((path) =>
        /\b(?:FileReader|MediaRecorder|navigator\.mediaDevices)\b/.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map(relativeSource);
    const presentationBoundaryFailures = sourceFiles(
      resolve(moduleRoot, "presentation"),
    ).flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            isRawDataImport(specifier) ||
            specifier === "@tanstack/react-router",
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );

    for (const legacyPath of [
      "api/assets.ts",
      "api/backgroundAnchor.ts",
      "lib/queries/character-image-selection.ts",
      "lib/queries/characters.ts",
      "lib/character-main-copy.ts",
      "components/assets/character-voice-panel.tsx",
      "components/assets/narrator-voice-panel.tsx",
      "components/assets/prop-asset-card.tsx",
      "components/assets/props-panel.tsx",
      "components/assets/scene-asset-card.tsx",
      "components/assets/scene-environment-prompt.tsx",
      "components/assets/scenes-panel.tsx",
      "lib/queries/asset-references.ts",
      "lib/queries/props.ts",
      "lib/queries/scenes.ts",
      "lib/queries/sketches.ts",
      "lib/queries/styles.ts",
      "lib/style-preview-url.ts",
      "types/character.ts",
      "types/prop.ts",
      "types/scene.ts",
      "types/style.ts",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, legacyPath))).toBe(false);
    }
    expect(applicationDataImportFailures).toEqual([]);
    expect(applicationViewImportFailures).toEqual([]);
    expect(applicationBrowserRecordingFailures).toEqual([]);
    expect(presentationBoundaryFailures).toEqual([]);
    expect(internalImportFailures).toEqual([]);
    expect(directAssetEndpointFailures).toEqual([]);
  });

  it("keeps Freezone identity asset creation behind the Asset & World application port", () => {
    const legacyApiPath = resolve(SRC_ROOT, "api/assets.ts");
    const domainPath = resolve(
      SRC_ROOT,
      "modules/asset_world/domain/identity-asset.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "modules/asset_world/application/identity-asset.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "modules/asset_world/infrastructure/http-identity-asset-gateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "modules/asset_world/composition.ts",
    );
    const publicPath = resolve(SRC_ROOT, "modules/asset_world/public.ts");
    const consumerPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/CreateIdentityDialog.tsx",
    );
    const compositionSource = readFileSync(compositionPath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const directLegacyConsumers = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) => importSpecifiers(path).includes("@/api/assets"))
      .map(relativeSource)
      .sort();
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "}/freezone/assets/identities`",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyApiPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(importSpecifiers(applicationPath)).toEqual([
      "@/modules/asset_world/domain/identity-asset",
    ]);
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/modules/asset_world/application/identity-asset",
        "@/modules/asset_world/domain/identity-asset",
        "@/shared/api/client",
      ]),
    );
    expect(directLegacyConsumers).toEqual([]);
    expect(endpointOwners).toEqual([
      "modules/asset_world/infrastructure/http-identity-asset-gateway.ts",
    ]);
    expect(importSpecifiers(consumerPath)).toContain(
      "@/modules/asset_world/public",
    );
    expect(importSpecifiers(consumerPath)).not.toContain("@/api/assets");
    expect(compositionSource).toContain("createIdentityAssetUseCase(");
    expect(compositionSource).toContain("httpIdentityAssetGateway");
    expect(publicSource).toContain("createIdentityAsset,");
  });

  it("keeps character catalog reads behind the Asset & World application port", () => {
    const legacyApiPath = resolve(SRC_ROOT, "api/projects.ts");
    const applicationPath = resolve(
      SRC_ROOT,
      "modules/asset_world/application/character-catalog.ts",
    );
    const gatewayPath = resolve(
      SRC_ROOT,
      "modules/asset_world/infrastructure/http-character-gateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "modules/asset_world/composition.ts",
    );
    const publicPath = resolve(SRC_ROOT, "modules/asset_world/public.ts");
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const consumerPaths = [
      "features/freezone/hooks/useCommitDialogTargetController.ts",
      "features/freezone/presentation/CommitDialogView.tsx",
      "features/freezone/presentation/CreateIdentityDialog.tsx",
    ];
    const characterListEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          ".get(p`api/v1/projects/${project}/characters`,",
        ),
      )
      .map(relativeSource)
      .sort();
    const identityListEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          ".get(p`api/v1/projects/${project}/characters/${name}/identities`,",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "@/modules/asset_world/application/ports",
        "@/modules/asset_world/domain/character",
      ]),
    );
    expect(existsSync(legacyApiPath)).toBe(false);
    expect(characterListEndpointOwners).toEqual([
      "modules/asset_world/infrastructure/http-character-gateway.ts",
    ]);
    expect(identityListEndpointOwners).toEqual([
      "modules/asset_world/infrastructure/http-character-gateway.ts",
    ]);
    for (const consumerPath of consumerPaths) {
      const imports = importSpecifiers(resolve(SRC_ROOT, consumerPath));
      expect(imports).toContain("@/modules/asset_world/public");
      expect(imports).not.toContain("@/api/projects");
    }
    expect(gatewaySource).toContain("async listCharacters(project, signal)");
    expect(gatewaySource).toContain("async listIdentities(project, name, signal)");
    expect(compositionSource).toContain("listCharactersUseCase(");
    expect(compositionSource).toContain("listCharacterIdentitiesUseCase(");
    expect(publicSource).toContain("listCharacters,");
    expect(publicSource).toContain("listCharacterIdentities,");
  });

  it("keeps the Styles route as an adapter", () => {
    const route = readFileSync(
      resolve(SRC_ROOT, "routes/_app/projects.$project/styles.tsx"),
      "utf8",
    );

    expect(route).toContain(
      'import { StylesPageContent } from "@/modules/asset_world/public";',
    );
    expect(route).toContain("Route.useParams()");
    expect(route).not.toContain("useStyles");
    expect(route).not.toContain("useStyleDetail");
    expect(route).not.toContain("useMutation");
    expect(route).not.toContain("useState");
  });

  it("keeps Production callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/production");
    const batchBarSource = sourceSection(
      resolve(SRC_ROOT, "modules/production/composition.ts"),
      "export interface BatchBarProps",
      "export interface NarratorVoicePanelProps",
    );
    const batchBarViewSource = readFileSync(
      resolve(SRC_ROOT, "modules/production/presentation/BatchBarView.tsx"),
      "utf8",
    );
    const batchBarControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-batch-bar-controller.ts",
      ),
      "utf8",
    );
    const batchPanelSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/batch-panel.tsx",
      ),
      "utf8",
    );
    const batchPanelViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/BatchPanelView.tsx",
      ),
      "utf8",
    );
    const batchPanelControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-batch-panel-controller.ts",
      ),
      "utf8",
    );
    const productionCompositionSource = readFileSync(
      resolve(SRC_ROOT, "modules/production/composition.ts"),
      "utf8",
    );
    const renderSectionCompositionSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/render-section-composition.ts",
      ),
      "utf8",
    );
    const gridGalleryCompositionSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/grid-gallery-composition.ts",
      ),
      "utf8",
    );
    const productionPublicSource = readFileSync(
      resolve(SRC_ROOT, "modules/production/public.ts"),
      "utf8",
    );
    const mediaStylesSource = readFileSync(
      resolve(SRC_ROOT, "modules/production/presentation/media-styles.ts"),
      "utf8",
    );
    const renderPlanDialogSource = sourceSection(
      resolve(SRC_ROOT, "modules/production/composition.ts"),
      "export interface RenderPlanDialogProps",
      "export function AudioPaneContent",
    );
    const renderPlanDialogControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-render-plan-dialog-controller.ts",
      ),
      "utf8",
    );
    const renderPlanDialogViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/RenderPlanDialogView.tsx",
      ),
      "utf8",
    );
    const sketchCropDialogSource = sourceSection(
      resolve(SRC_ROOT, "modules/production/sketch-section-composition.ts"),
      "function SketchCropDialog",
      "function SketchPoseEditorDialog",
    );
    const sketchCropDialogControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-sketch-crop-dialog-controller.ts",
      ),
      "utf8",
    );
    const sketchCropDialogViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/SketchCropDialogView.tsx",
      ),
      "utf8",
    );
    const sketchPoseEditorDialogSource = sourceSection(
      resolve(SRC_ROOT, "modules/production/sketch-section-composition.ts"),
      "function SketchPoseEditorDialog",
      "const useSketchSectionController",
    );
    const sketchPoseEditorDialogControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-sketch-pose-editor-dialog-controller.ts",
      ),
      "utf8",
    );
    const sketchPoseEditorDialogViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/SketchPoseEditorDialogView.tsx",
      ),
      "utf8",
    );
    const sketchRegenQueueDomainSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/domain/sketch-regen-queue.ts",
      ),
      "utf8",
    );
    const narrativePlanningCompositionSource = readFileSync(
      resolve(SRC_ROOT, "modules/narrative_planning/composition.ts"),
      "utf8",
    );
    const beatsPageViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/narrative_planning/presentation/BeatsPageView.tsx",
      ),
      "utf8",
    );
    const videoPaneSource = sourceSection(
      resolve(SRC_ROOT, "modules/production/video-pane-composition.ts"),
      "export interface VideoPaneProps",
    );
    const videoPaneViewSource = readFileSync(
      resolve(SRC_ROOT, "modules/production/presentation/VideoPaneView.tsx"),
      "utf8",
    );
    const videoPaneControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-video-pane-controller.ts",
      ),
      "utf8",
    );
    const sketchSectionSource = sourceSection(
      resolve(SRC_ROOT, "modules/production/sketch-section-composition.ts"),
      "export interface SketchSectionProps",
    );
    const sketchSectionCompositionSource = readFileSync(
      resolve(SRC_ROOT, "modules/production/sketch-section-composition.ts"),
      "utf8",
    );
    const sketchSectionViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/SketchSectionView.tsx",
      ),
      "utf8",
    );
    const sketchSectionControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-sketch-section-controller.ts",
      ),
      "utf8",
    );
    const renderSectionSource = sourceSection(
      resolve(SRC_ROOT, "modules/production/render-section-composition.ts"),
      "export interface RenderSectionProps",
    );
    const renderSectionViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/RenderSectionView.tsx",
      ),
      "utf8",
    );
    const renderSectionControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-render-section-controller.ts",
      ),
      "utf8",
    );
    const renderGridGallerySource = sourceSection(
      resolve(SRC_ROOT, "modules/production/grid-gallery-composition.ts"),
      "export interface RenderGridGalleryProps",
      "export interface SketchGridGalleryProps",
    );
    const renderGridGalleryViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/RenderGridGalleryView.tsx",
      ),
      "utf8",
    );
    const renderGridGalleryControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-render-grid-gallery-controller.ts",
      ),
      "utf8",
    );
    const renderGridGalleryDomainSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/domain/render-grid-gallery.ts",
      ),
      "utf8",
    );
    const sketchGridGallerySource = sourceSection(
      resolve(SRC_ROOT, "modules/production/grid-gallery-composition.ts"),
      "export interface SketchGridGalleryProps",
    );
    const sketchGridGalleryViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/SketchGridGalleryView.tsx",
      ),
      "utf8",
    );
    const sketchGridGalleryControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-sketch-grid-gallery-controller.ts",
      ),
      "utf8",
    );
    const sketchGridGalleryDomainSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/domain/sketch-grid-gallery.ts",
      ),
      "utf8",
    );
    const narratorVoicePanelSource = sourceSection(
      resolve(SRC_ROOT, "modules/production/composition.ts"),
      "export interface NarratorVoicePanelProps",
      "export interface RenderPlanDialogProps",
    );
    const narratorVoicePanelViewSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/presentation/NarratorVoicePanelView.tsx",
      ),
      "utf8",
    );
    const narratorVoicePanelControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/production/application/use-narrator-voice-panel-controller.ts",
      ),
      "utf8",
    );
    const browserVoiceRecorderSource = readFileSync(
      resolve(
        SRC_ROOT,
        "shared/voice-recording/browser-voice-recorder.ts",
      ),
      "utf8",
    );
    const mediaRecorderImplementations = sourceFiles(SRC_ROOT)
      .filter((path) => !relativeSource(path).startsWith("__tests__/"))
      .filter((path) =>
        readFileSync(path, "utf8").includes("new MediaRecorder("),
      )
      .map(relativeSource);
    const internalImportFailures = sourceFiles(SRC_ROOT)
      .filter((path) => !path.startsWith(moduleRoot))
      .filter((path) => !relativeSource(path).startsWith("__tests__/"))
      .flatMap((path) =>
        importSpecifiers(path)
          .filter(
            (specifier) =>
              specifier.startsWith("@/modules/production/") &&
              specifier !== "@/modules/production/public",
          )
          .map((specifier) => `${relativeSource(path)}: ${specifier}`),
      );
    const applicationDataImportFailures = sourceFiles(
      resolve(moduleRoot, "application"),
    ).flatMap((path) =>
      importSpecifiers(path)
        .filter(isRawDataImport)
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );

    expect(existsSync(resolve(SRC_ROOT, "lib/queries/video.ts"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/queries/audio.ts"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/queries/render-settings.ts"))).toBe(
      false,
    );
    expect(existsSync(resolve(SRC_ROOT, "lib/queries/sketch-settings.ts"))).toBe(
      false,
    );
    expect(
      existsSync(resolve(SRC_ROOT, "lib/queries/sketch-image-usage.ts")),
    ).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/queries/render-plan.ts"))).toBe(
      false,
    );
    expect(
      existsSync(resolve(SRC_ROOT, "lib/queries/sketch-regen-queue.ts")),
    ).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/regen-modes.ts"))).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "lib/queries/sketch-pose-editor.ts")),
    ).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/sketch-pose-editor-model.ts"))).toBe(
      false,
    );
    expect(existsSync(resolve(SRC_ROOT, "types/render-plan.ts"))).toBe(false);
    for (const legacyPath of [
      "components/episode/beat-workbench/sketch-section.tsx",
      "components/episode/beat-workbench/sketch-section-composition.ts",
      "components/episode/beat-workbench/sketch-crop-dialog.tsx",
      "components/episode/beat-workbench/sketch-pose-editor-dialog.tsx",
      "components/episode/beat-workbench/render-section.tsx",
      "components/episode/beat-workbench/render-grid-gallery.tsx",
      "components/episode/beat-workbench/sketch-grid-gallery.tsx",
      "components/episode/beat-workbench/video-pane.tsx",
    ]) {
      expect(existsSync(resolve(SRC_ROOT, legacyPath)), legacyPath).toBe(false);
    }
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "components/episode/beat-workbench/batch-bar.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "components/episode/beat-workbench/media-styles.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "components/episode/beat-workbench/narrator-voice-panel.tsx",
        ),
      ),
    ).toBe(false);
    expect(mediaStylesSource).toContain("MEDIA_PREVIEW_CLASS");
    expect(mediaStylesSource).toContain("VIDEO_PROMPT_TEXTAREA_CLASS");
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "components/episode/beat-workbench/render-settings-controls.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "components/episode/beat-workbench/sketch-settings-controls.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "components/episode/beat-workbench/toolbar-select-styles.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "components/episode/beat-workbench/audio-pane.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "components/episode/beat-workbench/seedance2-mentions.ts",
        ),
      ),
    ).toBe(false);
    expect(videoPaneSource).not.toContain(
      "function Seedance2AssetCropDialog",
    );
    expect(videoPaneSource).not.toContain(
      "function Seedance2AudioTrimDialog",
    );
    expect(videoPaneSource).not.toContain("function clampCropBox");
    expect(videoPaneSource).not.toContain("function BeatVideoPlayer");
    expect(videoPaneSource).not.toContain("function Seedance2SummaryPill");
    expect(videoPaneSource).not.toContain("function isErrorResponse");
    expect(videoPaneSource).not.toContain("function videoBackendDisplayLabel");
    expect(videoPaneSource).not.toContain("function getSeedance2MentionQuery");
    expect(videoPaneSource).not.toContain("useVideoPool(");
    expect(videoPaneSource).not.toContain("useVideoPoolSelect(");
    expect(videoPaneSource).not.toContain("formatRelativeTime");
    expect(videoPaneSource).not.toContain("MEDIA_THUMB_CLASS");
    expect(videoPaneSource).not.toContain("useUploadSeedance2Asset(");
    expect(videoPaneSource).not.toContain("useDeleteSeedance2Asset(");
    expect(videoPaneSource).not.toContain("useCropSeedance2Asset(");
    expect(videoPaneSource).not.toContain("useTrimSeedance2Asset(");
    expect(videoPaneSource).not.toContain("handleSeedance2AssetUpload");
    expect(videoPaneSource).not.toContain("handleCropSeedance2Asset");
    expect(videoPaneSource).not.toContain("handleTrimSeedance2Asset");
    expect(videoPaneSource).not.toContain("data-seedance2-reference-tile");
    expect(videoPaneSource).not.toContain("seedance2UploadInputRef");
    expect(videoPaneSource).not.toContain("seedance2CropTargetForAsset");
    expect(videoPaneSource).not.toContain("useGenerateBeatVideoPrompt(");
    expect(videoPaneSource).not.toContain("beatVideoPromptTask");
    expect(videoPaneSource).not.toContain("legacyVideoPrompt");
    expect(videoPaneSource).not.toContain("saveLegacyVideoPrompt");
    expect(videoPaneSource).not.toContain("useGenerateSeedance2Prompt(");
    expect(videoPaneSource).not.toContain("seedance2DraftRef");
    expect(videoPaneSource).not.toContain("setSeedance2Draft");
    expect(videoPaneSource).not.toContain("saveSeedance2Draft");
    expect(videoPaneSource).not.toContain("getSeedance2ConfigSaveKey");
    expect(videoPaneSource).not.toContain("SEEDANCE2_AUTOSAVE_DELAY_MS");
    expect(videoPaneSource).not.toContain("seedance2ReferenceSelectionRef");
    expect(videoPaneSource).not.toContain("prevSeedance2LabelIdentityRef");
    expect(videoPaneSource).not.toContain("mentionDismissedQuery");
    expect(videoPaneSource).not.toContain("insertSeedance2Reference");
    expect(videoPaneSource).not.toContain("buildSeedance2LabelIdentityMaps(");
    expect(videoPaneSource).not.toContain("getSeedance2MentionQuery(");
    expect(videoPaneSource).not.toContain("remapSeedance2Mentions(");
    expect(videoPaneSource).not.toContain("normalizeMentionSeparatorSpaces(");
    expect(videoPaneViewSource).toContain("<Seedance2ConfigView");
    expect(videoPaneSource).not.toContain("<MentionTextarea");
    expect(videoPaneSource).not.toContain("<Seedance2Field");
    expect(videoPaneSource).not.toContain("<Seedance2SummaryPill");
    expect(videoPaneSource).not.toContain("seedance2-prompt-panel");
    expect(videoPaneSource).not.toContain("returned_last_frame");
    expect(videoPaneSource).not.toContain("handleMentionKeyDown");
    expect(videoPaneSource).not.toContain("handleReferenceDragStart");
    expect(videoPaneSource).not.toContain("renderReferenceControls");
    expect(videoPaneSource).toContain("createElement(VideoPaneView");
    expect(videoPaneSource).not.toContain("<VideoPaneMediaView");
    expect(videoPaneSource).not.toContain("<LegacyVideoPromptView");
    expect(videoPaneSource).not.toContain("<VideoParamField");
    expect(videoPaneSource).not.toContain("<Seedance2ReferenceCropAssetsView");
    expect(videoPaneSource).not.toContain("<Seedance2AssetCropDialog");
    expect(videoPaneSource).not.toContain("<Seedance2AudioTrimDialog");
    expect(videoPaneSource).not.toContain("<BeatVideoGenerationConfirmDialog");
    expect(videoPaneSource).not.toContain("<Input");
    expect(videoPaneSource).not.toContain("<Select");
    expect(videoPaneSource).not.toContain("happyHorseConfigJson");
    expect(videoPaneSource).not.toContain("grokVideoConfigJson");
    expect(videoPaneSource).not.toContain("seedance2ConfigJson:");
    expect(videoPaneSource).not.toContain("useRegenerateBeatVideo(");
    expect(videoPaneSource).not.toContain("useTaskController(");
    expect(videoPaneSource).not.toContain("regenTask");
    expect(videoPaneSource).not.toContain("handleRegen");
    expect(videoPaneSource).not.toContain("<AlertDialog");
    expect(videoPaneSource).toContain("useUpdateBeat(");
    expect(videoPaneSource).toContain("useVideoPaneController({");
    expect(videoPaneSource).toContain("controller,");
    expect(videoPaneSource).not.toContain("useMemo(");
    expect(videoPaneSource).not.toContain("useState(");
    expect(videoPaneSource).not.toContain("useProjectAspectRatio(");
    expect(videoPaneSource).not.toContain("useVideoBackends(");
    expect(videoPaneSource).not.toContain("useSeedance2BeatStatus(");
    expect(videoPaneSource).not.toContain(
      "useLegacyVideoPromptController(",
    );
    expect(videoPaneSource).not.toContain(
      "useSeedance2ConfigController(",
    );
    expect(videoPaneSource).not.toContain(
      "useBeatVideoGenerationController(",
    );
    expect(videoPaneSource).not.toContain(
      "useVideoPaneMediaController(",
    );
    expect(videoPaneSource).not.toContain(
      "isSeedanceReferenceCropBackend(",
    );
    expect(videoPaneViewSource).toContain(
      "controller: VideoPaneController",
    );
    expect(videoPaneViewSource).toContain("useState(true)");
    expect(videoPaneControllerSource).toContain(
      "createUseVideoPaneController",
    );
    expect(videoPaneControllerSource).toContain(
      "queries.useVideoBackends",
    );
    expect(videoPaneControllerSource).toContain(
      "queries.useSeedance2BeatStatus",
    );
    expect(videoPaneControllerSource).toContain(
      "dependencies.useProjectAspectRatio",
    );
    expect(videoPaneControllerSource).toContain(
      "dependencies.useLegacyVideoPromptController",
    );
    expect(videoPaneControllerSource).toContain(
      "dependencies.useSeedance2ConfigController",
    );
    expect(videoPaneControllerSource).toContain(
      "dependencies.useBeatVideoGenerationController",
    );
    expect(videoPaneControllerSource).toContain(
      "dependencies.useVideoPaneMediaController",
    );
    expect(videoPaneControllerSource).toContain(
      "isSeedanceReferenceCropBackend(",
    );
    expect(videoPaneControllerSource).not.toContain("document.");
    expect(videoPaneControllerSource).not.toContain("navigator.");
    expect(productionCompositionSource).toContain(
      "createUseVideoPaneController",
    );
    expect(productionPublicSource).toContain(
      'export { VideoPane } from "@/modules/production/video-pane-composition";',
    );
    expect(productionPublicSource).not.toContain(
      "useVideoPaneController",
    );
    expect(productionPublicSource).not.toContain(
      'export { VideoPaneView }',
    );
    expect(productionPublicSource).not.toContain(
      "VideoPaneControllerOptions",
    );
    expect(sketchSectionSource).toContain(
      "createElement(SketchSectionView",
    );
    expect(sketchSectionSource).toContain("useSketchSectionController(");
    expect(sketchSectionSource).not.toContain("className=");
    expect(sketchSectionSource).not.toContain("<Button");
    expect(sketchSectionSource).not.toContain("<AlertDialog");
    expect(sketchSectionSource).not.toContain('type="file"');
    expect(sketchSectionSource).not.toContain("MEDIA_THUMB_CLASS");
    expect(sketchSectionSource).not.toContain("useTaskController(");
    expect(sketchSectionSource).not.toContain("usePoolSelect(");
    expect(sketchSectionSource).not.toContain("useRegenerateSketches(");
    expect(sketchSectionSource).not.toContain("useUploadBeatImage(");
    expect(sketchSectionSource).not.toContain("useBeatBackgroundAnchors(");
    expect(sketchSectionSource).not.toContain(
      "useBeatDirectorStageManifest(",
    );
    expect(sketchSectionSource).not.toContain(
      "useDirectorControlFrameStatus(",
    );
    expect(sketchSectionSource).not.toContain("useCharacters(");
    expect(sketchSectionSource).not.toContain("useEpisodeDetail(");
    expect(sketchSectionSource).not.toContain("useProjectAspectRatio(");
    expect(sketchSectionSource).not.toContain("useScript(");
    expect(sketchSectionSource).not.toContain("toast.");
    expect(sketchSectionCompositionSource).toContain(
      "createUseSketchSectionController(",
    );
    expect(sketchSectionCompositionSource).toContain(
      "useBeatBackgroundAnchors,",
    );
    expect(sketchSectionCompositionSource).toContain(
      "useBeatDirectorStageManifest,",
    );
    expect(sketchSectionCompositionSource).toContain("useCharacters,");
    expect(sketchSectionCompositionSource).toContain("useEpisodeDetail,");
    expect(sketchSectionCompositionSource).toContain(
      "useProjectAspectRatio,",
    );
    expect(sketchSectionCompositionSource).toContain("useScript,");
    expect(productionPublicSource).toContain(
      'export { SketchSection } from "@/modules/production/sketch-section-composition";',
    );
    expect(productionPublicSource).not.toContain(
      "createUseSketchSectionController",
    );
    expect(productionPublicSource).not.toContain("SketchSectionView");
    expect(productionPublicSource).not.toContain(
      "useSketchCropDialogController",
    );
    expect(productionPublicSource).not.toContain(
      "useSketchPoseEditorDialogController",
    );
    expect(productionCompositionSource).not.toContain(
      "createUseSketchSectionController",
    );
    expect(sketchSectionControllerSource).toContain(
      "createUseSketchSectionController",
    );
    expect(sketchSectionControllerSource).toContain(
      "queries.useBeatBackgroundAnchors",
    );
    expect(sketchSectionControllerSource).toContain(
      "queries.useBeatDirectorStageManifest",
    );
    expect(sketchSectionControllerSource).toContain(
      "queries.useCharacters",
    );
    expect(sketchSectionControllerSource).toContain(
      "queries.useEpisodeDetail",
    );
    expect(sketchSectionControllerSource).toContain("queries.useScript");
    expect(sketchSectionControllerSource).toContain(
      "dependencies.useProjectAspectRatio",
    );
    expect(sketchSectionControllerSource).toContain("useTaskController(");
    expect(sketchSectionControllerSource).toContain("promotePoolSketch");
    expect(sketchSectionControllerSource).toContain(
      "handleOpenBackgroundDialog",
    );
    expect(sketchSectionControllerSource).toContain("handleOpenFreezone");
    expect(sketchSectionViewSource).toContain(
      "controller: SketchSectionController",
    );
    expect(sketchSectionViewSource).not.toContain(
      "directorWorldPending: boolean",
    );
    expect(sketchSectionViewSource).toContain('type="file"');
    expect(sketchSectionViewSource).toContain("<AlertDialog");
    expect(sketchSectionViewSource).toContain("MEDIA_THUMB_CLASS");
    expect(renderSectionSource).toContain(
      "createElement(RenderSectionView",
    );
    expect(renderSectionSource).toContain("useRenderSectionController(");
    expect(renderSectionSource).not.toContain("className=");
    expect(renderSectionSource).not.toContain("<Button");
    expect(renderSectionSource).not.toContain("<AlertDialog");
    expect(renderSectionSource).not.toContain('type="file"');
    expect(renderSectionSource).not.toContain("MEDIA_THUMB_CLASS");
    expect(renderSectionSource).not.toContain("useState(");
    expect(renderSectionSource).not.toContain("useTaskController(");
    expect(renderSectionSource).not.toContain("usePoolSelect(");
    expect(renderSectionSource).not.toContain("useRegenerateRenderBeats(");
    expect(renderSectionSource).not.toContain("useUploadBeatImage(");
    expect(renderSectionSource).not.toContain("useBeatBackgroundAnchors(");
    expect(renderSectionSource).not.toContain(
      "useBeatDirectorStageManifest(",
    );
    expect(renderSectionSource).not.toContain(
      "useCropBeatBackgroundAnchor(",
    );
    expect(renderSectionSource).not.toContain("useScenePlatePreview(");
    expect(renderSectionSource).not.toContain(
      "useUpdateBeatBackgroundAnchor(",
    );
    expect(renderSectionSource).not.toContain(
      "useUploadBeatBackgroundAnchor(",
    );
    expect(renderSectionSource).not.toContain("useProjectAspectRatio(");
    expect(renderSectionSource).not.toContain("beat.scene_ref");
    expect(renderSectionSource).not.toContain("toast.");
    expect(renderSectionSource).not.toContain("formatRelativeTime");
    expect(renderSectionSource).not.toContain("useSeenPoolStore");
    expect(renderSectionViewSource).toContain('type="file"');
    expect(renderSectionViewSource).toContain("<AlertDialog");
    expect(renderSectionViewSource).toContain("MEDIA_THUMB_CLASS");
    expect(renderSectionViewSource).toContain(
      "controller: RenderSectionController",
    );
    expect(renderSectionViewSource).toContain(
      "function RenderBackgroundReferencePanel",
    );
    expect(renderSectionViewSource).toContain("clampCropBox(");
    expect(renderSectionViewSource).not.toContain("function clampCropBox");
    expect(renderSectionControllerSource).toContain(
      "createUseRenderSectionController",
    );
    expect(renderSectionControllerSource).toContain(
      "queries.useBeatBackgroundAnchors",
    );
    expect(renderSectionControllerSource).toContain(
      "queries.useBeatDirectorStageManifest",
    );
    expect(renderSectionControllerSource).toContain(
      "queries.useScenePlatePreview",
    );
    expect(renderSectionControllerSource).toContain(
      "queries.useDirectorControlFrameStatus",
    );
    expect(renderSectionControllerSource).toContain(
      "dependencies.useProjectAspectRatio",
    );
    expect(renderSectionControllerSource).toContain("useTaskController(");
    expect(renderSectionControllerSource).toContain("handleRegen");
    expect(renderSectionControllerSource).toContain(
      "handleChooseBackground",
    );
    expect(renderSectionControllerSource).toContain("handleOpenFreezone");
    expect(renderSectionControllerSource).not.toContain("@/features/");
    expect(renderSectionControllerSource).not.toContain("@/stores/");
    expect(renderSectionControllerSource).not.toContain("document.");
    expect(renderSectionCompositionSource).toContain(
      "createUseRenderSectionController",
    );
    expect(renderSectionCompositionSource).toContain(
      "useBeatDirectorStageManifest,",
    );
    expect(renderSectionCompositionSource).toContain(
      "useDirectorControlFrameStatus,",
    );
    expect(productionPublicSource).toContain(
      'export { RenderSection } from "@/modules/production/render-section-composition";',
    );
    expect(productionPublicSource).not.toContain(
      "useRenderSectionController",
    );
    expect(productionPublicSource).not.toContain(
      "createUseRenderSectionController",
    );
    expect(productionPublicSource).not.toContain("RenderSectionView");
    expect(productionCompositionSource).not.toContain(
      "@/modules/asset_world/public",
    );
    expect(productionCompositionSource).not.toContain("useQueryClient");
    expect(renderGridGallerySource).toContain(
      "RenderGridGalleryView,",
    );
    expect(renderGridGallerySource).toContain(
      "createElement(RenderGridCardView",
    );
    expect(renderGridGallerySource).not.toContain("className=");
    expect(renderGridGallerySource).not.toContain("<Button");
    expect(renderGridGallerySource).not.toContain("<Dialog");
    expect(renderGridGallerySource).not.toContain("<Textarea");
    expect(renderGridGallerySource).not.toContain('type="file"');
    expect(renderGridGallerySource).not.toContain("GRID_ACTION_BUTTON_CLASS");
    expect(renderGridGallerySource).not.toContain("gridAspectCss");
    expect(renderGridGallerySource).not.toContain("formatBeatRange");
    expect(renderGridGallerySource).not.toContain("buildRenderGridGroups");
    expect(renderGridGallerySource).not.toContain("useGrids(");
    expect(renderGridGallerySource).not.toContain("useRegenerateGrid(");
    expect(renderGridGallerySource).not.toContain("useTaskController(");
    expect(renderGridGallerySource).not.toContain("useState(");
    expect(renderGridGallerySource).not.toContain("toast.");
    expect(renderGridGallerySource).not.toContain("document.");
    expect(renderGridGallerySource).not.toContain("navigator.");
    expect(renderGridGalleryViewSource).toContain('type="file"');
    expect(renderGridGalleryViewSource).toContain("<Dialog");
    expect(renderGridGalleryViewSource).toContain("<Textarea");
    expect(renderGridGalleryViewSource).toContain("GRID_ACTION_BUTTON_CLASS");
    expect(renderGridGalleryViewSource).toContain("formatBeatRange");
    expect(renderGridGalleryViewSource).not.toContain("useGrids(");
    expect(renderGridGalleryViewSource).not.toContain("useRegenerateGrid(");
    expect(renderGridGalleryViewSource).not.toContain("toast.");
    expect(renderGridGalleryControllerSource).toContain(
      "createUseRenderGridGalleryController",
    );
    expect(renderGridGalleryControllerSource).toContain(
      "createUseRenderGridCardController",
    );
    expect(renderGridGalleryControllerSource).toContain(
      "buildRenderGridGroups(",
    );
    expect(renderGridGalleryControllerSource).toContain(
      "queries.useRebuildPoolIndex",
    );
    expect(renderGridGalleryControllerSource).toContain(
      "queries.useRegenerateGrid",
    );
    expect(renderGridGalleryControllerSource).toContain(
      "useTaskController(",
    );
    expect(renderGridGalleryControllerSource).not.toContain("document.");
    expect(renderGridGalleryControllerSource).not.toContain("navigator.");
    expect(renderGridGalleryDomainSource).toContain(
      "export function buildRenderGridGroups",
    );
    expect(sketchGridGallerySource).toContain(
      "SketchGridGalleryView,",
    );
    expect(sketchGridGallerySource).toContain(
      "createElement(SketchGridCardView",
    );
    expect(sketchGridGallerySource).not.toContain("className=");
    expect(sketchGridGallerySource).not.toContain("<Button");
    expect(sketchGridGallerySource).not.toContain("<Dialog");
    expect(sketchGridGallerySource).not.toContain("<Textarea");
    expect(sketchGridGallerySource).not.toContain('type="file"');
    expect(sketchGridGallerySource).not.toContain(
      "GRID_ACTION_BUTTON_CLASS",
    );
    expect(sketchGridGallerySource).not.toContain("gridAspectCss");
    expect(sketchGridGallerySource).not.toContain("formatBeatRange");
    expect(sketchGridGallerySource).not.toContain("buildSketchGridGroups");
    expect(sketchGridGallerySource).not.toContain("useGrids(");
    expect(sketchGridGallerySource).not.toContain("useGenerateSketches(");
    expect(sketchGridGallerySource).not.toContain("useSketchGridPreview(");
    expect(sketchGridGallerySource).not.toContain("useTaskController(");
    expect(sketchGridGallerySource).not.toContain("useState(");
    expect(sketchGridGallerySource).not.toContain("toast.");
    expect(sketchGridGallerySource).not.toContain("document.");
    expect(sketchGridGallerySource).not.toContain("navigator.");
    expect(sketchGridGalleryViewSource).toContain('type="file"');
    expect(sketchGridGalleryViewSource).toContain("<Dialog");
    expect(sketchGridGalleryViewSource).toContain("<Textarea");
    expect(sketchGridGalleryViewSource).toContain(
      "GRID_ACTION_BUTTON_CLASS",
    );
    expect(sketchGridGalleryViewSource).toContain("formatBeatRange");
    expect(sketchGridGalleryViewSource).not.toContain("useGrids(");
    expect(sketchGridGalleryViewSource).not.toContain(
      "useGenerateSketches(",
    );
    expect(sketchGridGalleryViewSource).not.toContain(
      "useTaskController(",
    );
    expect(sketchGridGalleryViewSource).not.toContain("toast.");
    expect(sketchGridGalleryControllerSource).toContain(
      "createUseSketchGridGalleryController",
    );
    expect(sketchGridGalleryControllerSource).toContain(
      "createUseSketchGridCardController",
    );
    expect(sketchGridGalleryControllerSource).toContain(
      "buildSketchGridGroups(",
    );
    expect(sketchGridGalleryControllerSource).toContain(
      "queries.useGenerateSketches",
    );
    expect(sketchGridGalleryControllerSource).toContain(
      "queries.useSketchGridPreview",
    );
    expect(sketchGridGalleryControllerSource).toContain(
      "useTaskController(",
    );
    expect(sketchGridGalleryControllerSource).not.toContain("document.");
    expect(sketchGridGalleryControllerSource).not.toContain("navigator.");
    expect(sketchGridGalleryDomainSource).toContain(
      "export function buildSketchGridGroups",
    );
    expect(gridGalleryCompositionSource).toContain(
      'from "@/modules/production/composition"',
    );
    expect(gridGalleryCompositionSource).toContain(
      "useProjectAspectRatio(project)",
    );
    expect(productionPublicSource).toContain(
      'from "@/modules/production/grid-gallery-composition";',
    );
    expect(productionPublicSource).not.toContain(
      "useRenderGridGalleryController",
    );
    expect(productionPublicSource).not.toContain(
      "useSketchGridGalleryController",
    );
    expect(productionPublicSource).not.toContain("RenderGridGalleryView");
    expect(productionPublicSource).not.toContain("SketchGridGalleryView");
    expect(productionPublicSource).not.toContain("RenderGridGroup");
    expect(productionPublicSource).not.toContain("SketchGridGroup");
    expect(batchBarControllerSource).toContain(
      "episodeAudioModelCallCount(",
    );
    expect(batchBarSource).not.toContain(
      "export function episodeAudioModelCallCount",
    );
    expect(batchBarSource).not.toContain("normalizeAudioTypeForCost");
    expect(batchBarSource).toContain("useBatchBarController({");
    expect(batchBarSource).toContain("createElement(BatchBarView");
    expect(batchBarSource).toContain("{ controller }");
    expect(batchBarSource).toContain("sketchAspectRatio,");
    expect(batchBarSource).toContain("onSketchAspectRatioChange,");
    expect(batchBarSource).not.toContain("RenderModelSelect");
    expect(batchBarSource).not.toContain("SketchModelSelect");
    expect(batchBarSource).not.toContain("SketchAspectCheckbox");
    expect(batchBarSource).not.toContain("className=");
    expect(batchBarSource).not.toContain("<Button");
    expect(batchBarSource).not.toContain("<AlertDialog");
    expect(batchBarSource).not.toContain("<Tooltip");
    expect(batchBarSource).not.toContain("<CreditCostInline");
    expect(batchBarSource).not.toContain("<CreditCostPill");
    expect(batchBarSource).not.toContain("useMemo(");
    expect(batchBarSource).not.toContain("useState(");
    expect(batchBarSource).not.toContain("useTaskController(");
    expect(batchBarSource).not.toContain("useGenerationCreditCost(");
    expect(batchBarSource).not.toContain("useAssignColors(");
    expect(batchBarSource).not.toContain("useDetectIdentities(");
    expect(batchBarSource).not.toContain("useGenerateAudio(");
    expect(batchBarSource).not.toContain("useGlobalOptimize(");
    expect(batchBarSource).not.toContain("useVideoBackends(");
    expect(batchBarSource).not.toContain("toast.");
    expect(batchBarViewSource).toContain("className=");
    expect(batchBarViewSource).toContain("<Button");
    expect(batchBarViewSource).toContain("<AlertDialog");
    expect(batchBarViewSource).toContain("<Tooltip");
    expect(batchBarViewSource).toContain("<CreditCostInline");
    expect(batchBarViewSource).toContain("<CreditCostPill");
    expect(batchBarViewSource).toContain("controller: BatchBarController");
    expect(batchBarViewSource).toContain("BatchBarModelSelect");
    expect(batchBarViewSource).toContain("SketchAspectSelect");
    expect(batchBarViewSource).toContain("episode.renderSettings.model");
    expect(batchBarViewSource).toContain("episode.sketchSettings.model");
    expect(batchBarViewSource).not.toContain("useAssignColors(");
    expect(batchBarViewSource).not.toContain("useDetectIdentities(");
    expect(batchBarViewSource).not.toContain("useGenerateAudio(");
    expect(batchBarViewSource).not.toContain("useGlobalOptimize(");
    expect(batchBarViewSource).not.toContain("useTaskController(");
    expect(batchBarViewSource).not.toContain("toast.");
    expect(batchBarControllerSource).toContain(
      "createUseBatchBarController",
    );
    expect(batchBarControllerSource).toContain("queries.useAssignColors");
    expect(batchBarControllerSource).toContain(
      "queries.useDetectIdentities",
    );
    expect(batchBarControllerSource).toContain("queries.useGenerateAudio");
    expect(batchBarControllerSource).toContain("queries.useGlobalOptimize");
    expect(batchBarControllerSource).toContain("queries.useRenderSettings");
    expect(batchBarControllerSource).toContain("queries.useSketchSettings");
    expect(batchBarControllerSource).toContain(
      "queries.useUpdateRenderSettings",
    );
    expect(batchBarControllerSource).toContain(
      "queries.useUpdateSketchSettings",
    );
    expect(batchBarControllerSource).toContain("queries.useVideoBackends");
    expect(batchBarControllerSource).toContain(
      "dependencies.useGenerationCreditCost",
    );
    expect(batchBarControllerSource).toContain("useTaskController(");
    expect(batchBarControllerSource).toContain(
      "TASK_TYPES.AUDIO_GENERATION_INDEXTTS2",
    );
    expect(batchBarControllerSource).toContain(
      "TASK_TYPES.GLOBAL_OPTIMIZE_VIDEO",
    );
    expect(batchBarControllerSource).not.toContain("document.");
    expect(batchBarControllerSource).not.toContain("navigator.");
    expect(productionCompositionSource).toContain(
      "createUseBatchBarController",
    );
    expect(batchPanelSource).toContain(
      'from "@/modules/production/public"',
    );
    expect(batchPanelSource).toContain("<BatchPanelView");
    expect(batchPanelSource).toContain("<RenderPlanDialog");
    expect(batchPanelSource).toContain("useBatchPanelController({");
    expect(batchPanelSource).toContain("useProjectAspectRatio(project)");
    expect(batchPanelSource).not.toContain("className=");
    expect(batchPanelSource).not.toContain("<Button");
    expect(batchPanelSource).not.toContain("<AlertDialog");
    expect(batchPanelSource).not.toContain("<CreditCostInline");
    expect(batchPanelSource).not.toContain("sketchPlanGridLabel");
    expect(batchPanelSource).not.toContain("useState(");
    expect(batchPanelSource).not.toContain("useEffect(");
    expect(batchPanelSource).not.toContain("useTasks(");
    expect(batchPanelSource).not.toContain("useRegenerateSketches(");
    expect(batchPanelSource).not.toContain("useGenerateAudio(");
    expect(batchPanelSource).not.toContain("TASK_TYPES");
    expect(batchPanelSource).not.toContain("toast.");
    expect(batchPanelSource).not.toContain("localStorage");
    expect(batchPanelSource).not.toContain("@/lib/regen-modes");
    expect(batchPanelSource).not.toContain(
      "export function createSketchRegenPlanItems",
    );
    expect(batchPanelSource).not.toContain(
      "export function getLockedSketchRegenItemIds",
    );
    expect(batchPanelSource).not.toContain("function sketchModeCellAspect");
    expect(batchPanelViewSource).toContain("className=");
    expect(batchPanelViewSource).toContain("<Button");
    expect(batchPanelViewSource).toContain("<AlertDialog");
    expect(batchPanelViewSource).toContain("<CreditCostInline");
    expect(batchPanelViewSource).toContain("sketchPlanGridLabel");
    expect(batchPanelViewSource).toContain(
      "controller: BatchPanelController",
    );
    expect(batchPanelViewSource).not.toContain("useTasks(");
    expect(batchPanelViewSource).not.toContain("useRegenerateSketches(");
    expect(batchPanelViewSource).not.toContain("useGenerateAudio(");
    expect(batchPanelViewSource).not.toContain("toast.");
    expect(batchPanelViewSource).not.toContain("localStorage");
    expect(batchPanelControllerSource).toContain(
      "createUseBatchPanelController",
    );
    expect(batchPanelControllerSource).toContain("queries.useGenerateAudio");
    expect(batchPanelControllerSource).toContain(
      "queries.useRegenerateSketches",
    );
    expect(batchPanelControllerSource).toContain("dependencies.useTasks");
    expect(batchPanelControllerSource).toContain(
      "useScopedTaskBatchInvalidation",
    );
    expect(batchPanelControllerSource).toContain("useTaskController(");
    expect(batchPanelControllerSource).toContain(
      "dependencies.removeStoredValue",
    );
    expect(batchPanelControllerSource).not.toContain("localStorage");
    expect(batchPanelControllerSource).not.toContain("document.");
    expect(batchPanelControllerSource).not.toContain("navigator.");
    expect(productionCompositionSource).toContain(
      "createUseBatchPanelController",
    );
    expect(productionCompositionSource).toContain("localStorage.removeItem");
    expect(renderPlanDialogSource).toContain(
      "createElement(RenderPlanDialogView",
    );
    expect(renderPlanDialogSource).toContain(
      "useRenderPlanDialogController(",
    );
    expect(renderPlanDialogSource).not.toContain("useEffect(");
    expect(renderPlanDialogSource).not.toContain("useMemo(");
    expect(renderPlanDialogSource).not.toContain("useState(");
    expect(renderPlanDialogSource).not.toContain("useRenderPlan(");
    expect(renderPlanDialogSource).not.toContain("useRenderExecute(");
    expect(renderPlanDialogSource).not.toContain("useRenderSettings(");
    expect(renderPlanDialogSource).not.toContain("useQueries(");
    expect(renderPlanDialogSource).not.toContain("toast.");
    expect(renderPlanDialogSource).not.toContain("@/shared/api/transport");
    expect(renderPlanDialogSource).not.toContain("generation-credit-cost");
    expect(renderPlanDialogSource).not.toContain("className=");
    expect(renderPlanDialogSource).not.toContain("<AlertDialog");
    expect(renderPlanDialogSource).not.toContain("<CreditCostInline");
    expect(renderPlanDialogSource).not.toContain("function PlanCard");
    expect(renderPlanDialogControllerSource).toContain(
      "createUseRenderPlanDialogController",
    );
    expect(renderPlanDialogControllerSource).toContain(
      "queries.useRenderPlan",
    );
    expect(renderPlanDialogControllerSource).toContain(
      "queries.useRenderExecute",
    );
    expect(renderPlanDialogControllerSource).toContain(
      "queries.useRenderSettings",
    );
    expect(renderPlanDialogControllerSource).toContain(
      "dependencies.useGenerationCreditCosts",
    );
    expect(renderPlanDialogControllerSource).toContain("toast.");
    expect(renderPlanDialogControllerSource).not.toContain("useQueries(");
    expect(renderPlanDialogControllerSource).not.toContain(
      "@/shared/api/transport",
    );
    expect(productionCompositionSource).toContain(
      "createUseRenderPlanDialogController",
    );
    expect(productionCompositionSource).toContain(
      "useGenerationCreditCosts",
    );
    expect(renderPlanDialogViewSource).toContain("className=");
    expect(renderPlanDialogViewSource).toContain("<AlertDialog");
    expect(renderPlanDialogViewSource).toContain("<CreditCostInline");
    expect(renderPlanDialogViewSource).toContain("function PlanCard");
    expect(renderPlanDialogViewSource).not.toContain("useRenderPlan(");
    expect(renderPlanDialogViewSource).not.toContain("useRenderExecute(");
    expect(renderPlanDialogViewSource).not.toContain("useQueries(");
    expect(renderPlanDialogViewSource).not.toContain("toast.");
    expect(renderPlanDialogViewSource).not.toContain("@/shared/api/transport");
    expect(sketchCropDialogSource).toContain(
      "createElement(SketchCropDialogView",
    );
    expect(sketchCropDialogSource).toContain(
      "useSketchCropDialogController(",
    );
    expect(sketchCropDialogSource).not.toContain("useSketchPoseEditor(");
    expect(sketchCropDialogSource).not.toContain("useCropSketch(");
    expect(sketchCropDialogSource).not.toContain("useState(");
    expect(sketchCropDialogSource).not.toContain("useEffect(");
    expect(sketchCropDialogSource).not.toContain("toast.");
    expect(sketchCropDialogSource).not.toContain("useProjectAspectRatio(");
    expect(sketchCropDialogSource).not.toContain("withImageCacheBust");
    expect(sketchCropDialogSource).not.toContain("resolveMediaUrl");
    expect(sketchCropDialogSource).not.toContain("className=");
    expect(sketchCropDialogSource).not.toContain("<Dialog");
    expect(sketchCropDialogSource).not.toContain("<Button");
    expect(sketchCropDialogSource).not.toContain("cropBoxPercentStyle");
    expect(sketchCropDialogControllerSource).toContain(
      "createUseSketchCropDialogController",
    );
    expect(sketchCropDialogControllerSource).toContain(
      "queries.useSketchPoseEditor",
    );
    expect(sketchCropDialogControllerSource).toContain(
      "queries.useCropSketch",
    );
    expect(sketchCropDialogControllerSource).toContain(
      "dependencies.useProjectAspectRatio",
    );
    expect(sketchCropDialogControllerSource).toContain(
      "dependencies.cacheBustImage",
    );
    expect(sketchCropDialogControllerSource).toContain(
      "dependencies.resolveMediaUrl",
    );
    expect(sketchCropDialogControllerSource).toContain("toast.");
    expect(sketchCropDialogControllerSource).not.toContain("HTMLElement");
    expect(sketchCropDialogControllerSource).not.toContain("HTMLImageElement");
    expect(sketchCropDialogControllerSource).not.toContain("document.");
    expect(sketchCropDialogControllerSource).not.toContain("window.");
    expect(productionCompositionSource).toContain(
      "createUseSketchCropDialogController",
    );
    expect(sketchCropDialogViewSource).toContain("className=");
    expect(sketchCropDialogViewSource).toContain("<Dialog");
    expect(sketchCropDialogViewSource).toContain("<Button");
    expect(sketchCropDialogViewSource).toContain("cropBoxPercentStyle(");
    expect(sketchCropDialogViewSource).not.toContain("useSketchPoseEditor(");
    expect(sketchCropDialogViewSource).not.toContain("useCropSketch(");
    expect(sketchCropDialogViewSource).not.toContain("useState(");
    expect(sketchCropDialogViewSource).toContain("useCallback(");
    expect(sketchCropDialogViewSource).not.toContain("toast.");
    expect(sketchPoseEditorDialogSource).toContain(
      "useSketchPoseEditorDialogController({",
    );
    expect(sketchPoseEditorDialogSource).toContain(
      "createElement(SketchPoseEditorDialogView",
    );
    expect(sketchPoseEditorDialogSource).not.toContain("useSketchPoseEditor(");
    expect(sketchPoseEditorDialogSource).not.toContain(
      "useSaveSketchPoseEditor(",
    );
    expect(sketchPoseEditorDialogSource).not.toContain("toast.");
    expect(sketchPoseEditorDialogSource).not.toContain("hitTestPoseJoint(");
    expect(sketchPoseEditorDialogSource).not.toContain("movePoseDrag(");
    expect(sketchPoseEditorDialogSource).not.toContain(
      "scalePosePresetJoints(",
    );
    expect(sketchPoseEditorDialogSource).not.toContain("useEffect(");
    expect(sketchPoseEditorDialogSource).not.toContain("useState(");
    expect(sketchPoseEditorDialogSource).not.toContain("className=");
    expect(sketchPoseEditorDialogSource).not.toContain("<Dialog");
    expect(sketchPoseEditorDialogSource).not.toContain("<Button");
    expect(sketchPoseEditorDialogSource).not.toContain("<canvas");
    expect(sketchPoseEditorDialogSource).not.toContain("PointerEvent");
    expect(sketchPoseEditorDialogSource).not.toContain("drawEditorCanvas");
    expect(sketchPoseEditorDialogControllerSource).toContain(
      "createUseSketchPoseEditorDialogController",
    );
    expect(sketchPoseEditorDialogControllerSource).toContain(
      "queries.useSketchPoseEditor",
    );
    expect(sketchPoseEditorDialogControllerSource).toContain(
      "queries.useSaveSketchPoseEditor",
    );
    expect(sketchPoseEditorDialogControllerSource).toContain("toast.");
    expect(sketchPoseEditorDialogControllerSource).not.toContain(
      "HTMLCanvasElement",
    );
    expect(sketchPoseEditorDialogControllerSource).not.toContain(
      "HTMLImageElement",
    );
    expect(sketchPoseEditorDialogControllerSource).not.toContain("PointerEvent");
    expect(sketchPoseEditorDialogControllerSource).not.toContain("document.");
    expect(sketchPoseEditorDialogControllerSource).not.toContain("window.");
    expect(sketchPoseEditorDialogViewSource).toContain("className=");
    expect(sketchPoseEditorDialogViewSource).toContain("<Dialog");
    expect(sketchPoseEditorDialogViewSource).toContain("<Button");
    expect(sketchPoseEditorDialogViewSource).toContain("<canvas");
    expect(sketchPoseEditorDialogViewSource).toContain("new ResizeObserver(");
    expect(sketchPoseEditorDialogViewSource).toContain("new Image(");
    expect(sketchPoseEditorDialogViewSource).toContain("canvasPoint(");
    expect(sketchPoseEditorDialogViewSource).toContain("drawEditorCanvas(");
    expect(sketchPoseEditorDialogViewSource).not.toContain(
      "useSketchPoseEditor(",
    );
    expect(sketchPoseEditorDialogViewSource).not.toContain(
      "useSaveSketchPoseEditor(",
    );
    expect(sketchPoseEditorDialogViewSource).not.toContain("toast.");
    expect(productionCompositionSource).toContain(
      "createUseSketchPoseEditorDialogController",
    );
    expect(productionPublicSource).not.toContain(
      "  useSketchPoseEditor,",
    );
    expect(productionPublicSource).not.toContain(
      "  useSaveSketchPoseEditor,",
    );
    expect(sketchRegenQueueDomainSource).toContain(
      "export function createSketchRegenPlanItems",
    );
    expect(sketchRegenQueueDomainSource).toContain(
      "export function getLockedSketchRegenItemIds",
    );
    expect(sketchRegenQueueDomainSource).not.toContain("TASK_TYPES");
    expect(sketchRegenQueueDomainSource).not.toContain(
      "task-controller-provider",
    );
    expect(narrativePlanningCompositionSource).not.toContain(
      "@/components/episode/beat-workbench/batch-panel",
    );
    expect(beatsPageViewSource).not.toContain(
      "@/components/episode/beat-workbench/batch-panel",
    );
    expect(narratorVoicePanelSource).toContain(
      "createElement(NarratorVoicePanelView",
    );
    expect(narratorVoicePanelSource).toContain(
      "useNarratorVoicePanelController({",
    );
    expect(narratorVoicePanelSource).not.toContain("className=");
    expect(narratorVoicePanelSource).not.toContain("<Button");
    expect(narratorVoicePanelSource).not.toContain("<Dialog");
    expect(narratorVoicePanelSource).not.toContain("<Input");
    expect(narratorVoicePanelSource).not.toContain("<Select");
    expect(narratorVoicePanelSource).not.toContain('type="file"');
    expect(narratorVoicePanelSource).not.toContain("MediaRecorder");
    expect(narratorVoicePanelSource).not.toContain("useState(");
    expect(narratorVoicePanelSource).not.toContain("toast.");
    expect(narratorVoicePanelSource).not.toContain("useNarratorVoiceStatus");
    expect(narratorVoicePanelViewSource).toContain('type="file"');
    expect(narratorVoicePanelViewSource).toContain("<Dialog");
    expect(narratorVoicePanelViewSource).toContain("<Select");
    expect(narratorVoicePanelViewSource).toContain(
      "controller: NarratorVoicePanelController",
    );
    expect(narratorVoicePanelViewSource).not.toContain(
      "useNarratorVoiceStatus",
    );
    expect(narratorVoicePanelControllerSource).toContain(
      "createUseNarratorVoicePanelController",
    );
    expect(narratorVoicePanelControllerSource).toContain(
      "queries.useNarratorVoiceStatus",
    );
    expect(narratorVoicePanelControllerSource).toContain(
      "dependencies.createVoiceRecorder()",
    );
    expect(narratorVoicePanelControllerSource).not.toContain(
      "new MediaRecorder(",
    );
    expect(narratorVoicePanelControllerSource).not.toContain(
      "navigator.mediaDevices",
    );
    expect(browserVoiceRecorderSource).toContain("new MediaRecorder(");
    expect(browserVoiceRecorderSource).toContain(
      "navigator.mediaDevices.getUserMedia",
    );
    expect(mediaRecorderImplementations).toEqual([
      "shared/voice-recording/browser-voice-recorder.ts",
    ]);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "modules/asset_world/application/voice-recorder.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          "modules/asset_world/infrastructure/browser-voice-recorder.ts",
        ),
      ),
    ).toBe(false);
    expect(applicationDataImportFailures).toEqual([]);
    expect(internalImportFailures).toEqual([]);
  });

  it("keeps the Characters route as an adapter", () => {
    const route = readFileSync(
      resolve(
        SRC_ROOT,
        "routes/_app/projects.$project/characters.lazy.tsx",
      ),
      "utf8",
    );

    expect(route).toContain(
      'import { CharactersPageContent } from "@/modules/asset_world/public";',
    );
    expect(route).toContain("Route.useParams()");
    expect(route).not.toContain("useCharacters");
    expect(route).not.toContain("useTaskController");
    expect(route).not.toContain("useGenerationCreditCost");
    expect(route).not.toContain("useState");
  });

  it("keeps the Episodes route as an adapter", () => {
    const route = readFileSync(
      resolve(SRC_ROOT, "routes/_app/projects.$project/episodes.tsx"),
      "utf8",
    );

    expect(route).toContain(
      'import { EpisodesPageContent } from "@/modules/narrative_planning/public";',
    );
    expect(route).toContain("Route.useParams()");
    expect(route).toContain("<Outlet />");
    expect(route).not.toContain("useQueryClient");
    expect(route).not.toContain("useEpisodes");
    expect(route).not.toContain("usePlanEpisodes");
    expect(route).not.toContain("useTaskController");
    expect(route).not.toContain("useGenerationCreditCost");
  });

  it("keeps the Script route as an adapter", () => {
    const route = readFileSync(
      resolve(
        SRC_ROOT,
        "routes/_app/projects.$project/episodes.$episode/script.lazy.tsx",
      ),
      "utf8",
    );

    expect(route).toContain(
      'import { ScriptPageContent } from "@/modules/narrative_planning/public";',
    );
    expect(route).toContain("Route.useParams()");
    expect(route).not.toContain("useQueryClient");
    expect(route).not.toContain("useEpisodeDetail");
    expect(route).not.toContain("useGenerateScript");
    expect(route).not.toContain("useTaskController");
    expect(route).not.toContain("useGenerationCreditCost");
  });

  it("keeps the Beats route as an adapter", () => {
    const route = readFileSync(
      resolve(
        SRC_ROOT,
        "routes/_app/projects.$project/episodes.$episode/beats.lazy.tsx",
      ),
      "utf8",
    );

    expect(route).toContain(
      'import { BeatsPageContent } from "@/modules/narrative_planning/public";',
    );
    expect(route).toContain("Route.useParams()");
    expect(route).toContain("useBeatsWorkbenchParam()");
    expect(route).not.toContain("useEpisodeBeats");
    expect(route).not.toContain("useGenerateScript");
    expect(route).not.toContain("useTaskController");
    expect(route).not.toContain("useGenerationCreditCost");
  });

  it("keeps canvas asset spawning independent from Zustand stores", () => {
    const assetDragPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/assetDrag.ts",
    );
    const assetDragSource = readFileSync(assetDragPath, "utf8");
    const forbiddenImports = importSpecifiers(assetDragPath).filter(
      (specifier) =>
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("../../../stores/"),
    );

    expect(forbiddenImports).toEqual([]);
    expect(assetDragSource).toContain(
      "export interface CanvasAssetNodeSpawnPort",
    );
    expect(assetDragSource).not.toContain("useCanvasStore");
  });

  it("keeps canvas asset hydration behind the composition root", () => {
    const hydrationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/assetDragHydration.ts",
    );
    const hydrationSource = readFileSync(hydrationPath, "utf8");
    const compositionSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/composition.ts"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hydrationPath).filter(
      (specifier) =>
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );

    expect(forbiddenImports).toEqual([]);
    expect(hydrationSource).toContain(
      "manifestGateway.getSceneDirectorStageManifest",
    );
    expect(compositionSource).toContain("hydrateAssetDragPayloadUseCase(");
    expect(
      existsSync(
        resolve(SRC_ROOT, "features/canvas/domain/assetDragHydrate.ts"),
      ),
    ).toBe(false);
  });

  it("keeps Canvas camera preset contracts owned by the domain", () => {
    const presetPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/cameraMovementPresets.ts",
    );
    const presetSource = readFileSync(presetPath, "utf8");
    const opsSource = readFileSync(resolve(SRC_ROOT, "api/ops.ts"), "utf8");
    const catalogGatewaySource = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/freezoneGenerationCatalogGateway.ts",
      ),
      "utf8",
    );
    const hookSource = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useFreezoneVideoCameraTemplates.ts",
      ),
      "utf8",
    );

    expect(
      importSpecifiers(presetPath).filter((specifier) =>
        specifier.startsWith("@/api/"),
      ),
    ).toEqual([]);
    expect(presetSource).toContain("export interface CameraMovementPreset");
    expect(catalogGatewaySource).toContain(
      'import type { CameraMovementPreset } from "../domain/cameraMovementPresets";',
    );
    expect(opsSource).not.toContain("CameraMovementPreset");
    expect(opsSource).not.toContain(
      "export interface FreezoneVideoCameraTemplate",
    );
    expect(hookSource).not.toContain("type FreezoneVideoCameraTemplate");
  });

  it("keeps Canvas generation catalogs behind an application-owned gateway", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generationCatalog.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneGenerationCatalogGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/catalogComposition.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const hookPaths = [
      "useFreezoneCameraOptions.ts",
      "useFreezoneImageModels.ts",
      "useFreezoneStyleTemplates.ts",
      "useFreezoneVideoCameraTemplates.ts",
      "useFreezoneVideoModels.ts",
    ].map((filename) =>
      resolve(SRC_ROOT, "features/canvas/hooks", filename),
    );
    const hookSources = hookPaths.map((path) => readFileSync(path, "utf8"));
    const stylePicker = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/StylePickerPopover.tsx"),
      "utf8",
    );
    const cameraPicker = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/CameraPickerPopover.tsx"),
      "utf8",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointFragments = [
      "projects/${encodeURIComponent(projectId)}/freezone/image/models`",
      "projects/${encodeURIComponent(projectId)}/freezone/video/models`",
      "projects/${encodeURIComponent(projectId)}/freezone/image/camera-options`",
      "projects/${encodeURIComponent(projectId)}/freezone/image/style-templates`",
      "projects/${encodeURIComponent(projectId)}/freezone/video/camera-templates`",
    ];
    const ownersByEndpoint = new Map(
      endpointFragments.map((fragment) => [fragment, [] as string[]]),
    );
    for (const path of sourceFiles(SRC_ROOT).filter(
      (sourcePath) => !sourcePath.includes(".test."),
    )) {
      const source = readFileSync(path, "utf8");
      for (const endpointFragment of endpointFragments) {
        if (source.includes(endpointFragment)) {
          ownersByEndpoint.get(endpointFragment)?.push(relativeSource(path));
        }
      }
    }

    expect(importSpecifiers(applicationPath)).toEqual([
      "../domain/cameraMovementPresets",
    ]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).toContain(
      "export interface CanvasGenerationCatalogGateway",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generationCatalog",
        "../domain/cameraMovementPresets",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneGenerationCatalogGateway: CanvasGenerationCatalogGateway",
    );
    expect(infrastructureSource).toContain(
      "cameraBodies: options.camera_bodies",
    );
    expect(infrastructureSource).toContain(
      "stylePrompt: template.style_prompt",
    );
    expect(importSpecifiers(compositionPath)).toEqual([
      "./infrastructure/freezoneGenerationCatalogGateway",
      "./infrastructure/freezoneSkillCatalogGateway",
    ]);
    expect(compositionSource).toContain(
      "freezoneGenerationCatalogGateway.listImageModels(projectId)",
    );
    expect(compositionSource).toContain(
      "freezoneGenerationCatalogGateway.listVideoCameraTemplates(projectId)",
    );
    expect(
      hookPaths.flatMap((path) =>
        importSpecifiers(path).filter((specifier) =>
          specifier.startsWith("@/api/"),
        ),
      ),
    ).toEqual([]);
    for (const source of hookSources) {
      expect(source).toContain("@/features/canvas/catalogComposition");
    }
    expect(stylePicker).toContain(
      "@/features/canvas/application/generationCatalog",
    );
    expect(stylePicker).not.toContain("@/api/ops");
    expect(stylePicker).not.toContain("style_prompt");
    expect(cameraPicker).toContain("options?.cameraBodies");
    expect(cameraPicker).toContain("options?.focalLengthsMm");
    expect(cameraPicker).not.toContain("camera_bodies");
    expect(cameraPicker).not.toContain("focal_lengths_mm");
    for (const endpointFragment of endpointFragments) {
      const owners = ownersByEndpoint.get(endpointFragment)?.sort() ?? [];
      expect(owners).toEqual([
        "features/canvas/infrastructure/freezoneGenerationCatalogGateway.ts",
      ]);
      expect(legacyOpsSource).not.toContain(endpointFragment);
    }
    for (const legacySymbol of [
      "FreezoneStyleTemplate",
      "listFreezoneStyleTemplates",
      "FreezoneCameraIdLabel",
      "FreezoneCameraOptions",
      "fetchFreezoneCameraOptions",
      "FreezoneImageModelInfo",
      "fetchFreezoneImageModels",
      "FreezoneVideoProvider",
      "FreezoneVideoModelInfo",
      "fetchFreezoneVideoModels",
      "fetchFreezoneVideoCameraTemplates",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
  });

  it("keeps Canvas audio voice catalogs behind an application-owned gateway", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/audioVoiceCatalog.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAudioVoiceCatalogGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/audioComposition.ts",
    );
    const audioControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAudioNodeController.ts",
    );
    const voiceModalEntryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VoiceSelectionModal.tsx",
    );
    const voiceModalModelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/voiceSelectionModel.ts",
    );
    const voiceModalModelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/voiceSelectionModel.test.ts",
    );
    const voiceModalControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVoiceSelectionModalController.ts",
    );
    const voiceModalControllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVoiceSelectionModalController.test.tsx",
    );
    const voiceModalViewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VoiceSelectionModalView.tsx",
    );
    const voiceModalViewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VoiceSelectionModalView.test.tsx",
    );
    const audioOperationsControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAudioOperationsPanelController.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const audioControllerSource = readFileSync(audioControllerPath, "utf8");
    const voiceModalEntrySource = readFileSync(voiceModalEntryPath, "utf8");
    const voiceModalModelSource = readFileSync(voiceModalModelPath, "utf8");
    const voiceModalModelTestSource = readFileSync(
      voiceModalModelTestPath,
      "utf8",
    );
    const voiceModalControllerSource = readFileSync(
      voiceModalControllerPath,
      "utf8",
    );
    const voiceModalControllerTestSource = readFileSync(
      voiceModalControllerTestPath,
      "utf8",
    );
    const voiceModalViewSource = readFileSync(voiceModalViewPath, "utf8");
    const voiceModalViewTestSource = readFileSync(
      voiceModalViewTestPath,
      "utf8",
    );
    const audioOperationsControllerSource = readFileSync(
      audioOperationsControllerPath,
      "utf8",
    );
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes("}/freezone/audio/references`") &&
          source.includes("}/freezone/audio/voices`")
        );
      })
      .map(relativeSource)
      .sort();
    const voiceModalDeclarations = [
      ["export function", "VoiceSelectionModal("].join(" "),
      ["export function", "voiceCloneFileValidationError("].join(" "),
      ["export function", "useVoiceSelectionModalController("].join(" "),
      ["export function", "VoiceSelectionModalView("].join(" "),
    ];
    const voiceModalDeclarationOwners = voiceModalDeclarations.map(
      (declaration) =>
        sourceFiles(SRC_ROOT)
          .filter((path) => readFileSync(path, "utf8").includes(declaration))
          .map(relativeSource)
          .sort(),
    );
    const voiceModalAsyncOwners = [
      voiceModalEntryPath,
      voiceModalModelPath,
      voiceModalControllerPath,
      voiceModalViewPath,
    ]
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes("loadCanvasAudioReferences(project)") ||
          source.includes("createCanvasAudioVoice(")
        );
      })
      .map(relativeSource)
      .sort();
    const voiceDescriptionDeclaration = [
      "export function",
      "describeAudioVoiceRef(",
    ].join(" ");
    const voiceDescriptionOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(voiceDescriptionDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual([
      "../domain/canvasNodes",
    ]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).toContain(
      "export interface CanvasAudioVoiceCatalogGateway",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set(["@/shared/api/client", "../application/audioVoiceCatalog"]),
    );
    expect(infrastructureSource).toContain(
      "freezoneAudioVoiceCatalogGateway: CanvasAudioVoiceCatalogGateway",
    );
    expect(infrastructureSource).toContain("characterName: item.character_name");
    expect(infrastructureSource).toContain("voiceId: item.voice_id");
    expect(infrastructureSource).toContain(
      "item.gender ?? item.sex",
    );
    expect(importSpecifiers(compositionPath)).toContain(
      "./infrastructure/freezoneAudioVoiceCatalogGateway",
    );
    expect(compositionSource).toContain(
      "freezoneAudioVoiceCatalogGateway.listReferences(projectId)",
    );
    expect(compositionSource).toContain(
      "freezoneAudioVoiceCatalogGateway.createVoice(projectId, file, name)",
    );
    expect(importSpecifiers(audioControllerPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(voiceModalControllerPath)).not.toContain(
      "@/api/ops",
    );
    expect(audioControllerSource).toContain(
      "loadCanvasAudioReferences(project)",
    );
    expect(voiceModalControllerSource).toContain(
      "loadCanvasAudioReferences(project)",
    );
    expect(voiceModalControllerSource).toContain("createCanvasAudioVoice(");
    expect(audioControllerSource).not.toContain("character_name");
    expect(audioControllerSource).not.toContain("voice_id");
    expect(voiceModalControllerSource).not.toContain("character_name");
    expect(voiceModalControllerSource).not.toContain("voice_id");
    expect(voiceModalControllerSource).not.toContain("function readGender(");
    expect(new Set(importSpecifiers(voiceModalEntryPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/application/voiceSelectionModel",
        "@/features/canvas/hooks/useVoiceSelectionModalController",
        "./VoiceSelectionModalView",
      ]),
    );
    expect(voiceModalEntrySource).toContain(
      "useVoiceSelectionModalController(props)",
    );
    expect(voiceModalEntrySource).toContain(
      "createElement(VoiceSelectionModalView, { controller })",
    );
    expect(voiceModalEntrySource).not.toContain("useState(");
    expect(voiceModalEntrySource).not.toContain("className=");
    expect(voiceModalModelSource).not.toContain("from 'react'");
    expect(voiceModalModelSource).not.toContain("window.");
    expect(voiceModalModelSource).not.toContain("document.");
    expect(voiceModalModelSource).not.toContain("className=");
    expect(voiceModalControllerSource).not.toContain("className=");
    expect(voiceModalControllerSource).not.toContain("lucide-react");
    expect(voiceModalControllerSource).not.toContain("createPortal(");
    expect(importSpecifiers(voiceModalViewPath)).not.toContain(
      "@/features/canvas/audioComposition",
    );
    expect(importSpecifiers(voiceModalViewPath)).not.toContain(
      "@/lib/url-params",
    );
    expect(voiceModalViewSource).not.toContain("useState(");
    expect(voiceModalViewSource).not.toContain("useEffect(");
    expect(voiceModalViewSource).not.toContain("useMemo(");
    expect(voiceModalViewSource).toContain("createPortal(");
    expect(voiceModalViewSource).toContain("<FolderOpen");
    expect(voiceModalDeclarationOwners).toEqual([
      ["features/canvas/nodes/VoiceSelectionModal.tsx"],
      ["features/canvas/application/voiceSelectionModel.ts"],
      ["features/canvas/hooks/useVoiceSelectionModalController.ts"],
      ["features/canvas/nodes/VoiceSelectionModalView.tsx"],
    ]);
    expect(voiceModalAsyncOwners).toEqual([
      "features/canvas/hooks/useVoiceSelectionModalController.ts",
    ]);
    expect(voiceDescriptionOwners).toEqual([
      "features/canvas/application/audioVoiceCatalog.ts",
    ]);
    expect(audioOperationsControllerSource).toContain(
      "describeAudioVoiceRef(voiceSettings.currentRef)",
    );
    expect(audioOperationsControllerSource).not.toContain(
      "function describeVoiceRef(",
    );
    expect(voiceModalModelTestSource).toContain(
      "from './voiceSelectionModel'",
    );
    expect(voiceModalControllerTestSource).toContain(
      "from './useVoiceSelectionModalController'",
    );
    expect(voiceModalViewTestSource).toContain(
      "from './VoiceSelectionModalView'",
    );
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneAudioVoiceCatalogGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneAudioReferenceItem",
      "FreezoneAudioReferencesResult",
      "fetchFreezoneAudioReferences",
      "FreezoneAudioVoiceItem",
      "CreateFreezoneAudioVoiceOptions",
      "createFreezoneAudioVoice",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/audio/references`");
    expect(legacyOpsSource).not.toContain("}/freezone/audio/voices`");
  });

  it("keeps Canvas audio generation orchestration in application", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasAudio.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAudioGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/audioComposition.ts",
    );
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/useAudioGeneration.ts",
    );
    const panelControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAudioOperationsPanelController.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const hookSource = readFileSync(hookPath, "utf8");
    const panelControllerSource = readFileSync(panelControllerPath, "utf8");
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes("}/freezone/audio/speech`") &&
          source.includes("}/freezone/audio/eleven-music`")
        );
      })
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["../domain/canvasNodes", "./ports"]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasAudio(",
    );
    expect(applicationSource).toContain(
      "dependencies.submissionGateway.submitMusic(",
    );
    expect(applicationSource).toContain(
      "dependencies.submissionGateway.submitSpeech(",
    );
    expect(applicationSource).toContain(
      "dependencies.onTaskSubmitted(task)",
    );
    expect(applicationSource).toContain(
      '"freezone_audio_eleven_music"',
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasAudio",
        "../application/ports",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneAudioGenerationGateway: CanvasAudioGenerationSubmissionGateway",
    );
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "./application/generateCanvasAudio",
        "./application/ports",
        "./infrastructure/freezoneAudioGenerationGateway",
        "./infrastructure/freezoneAudioVoiceCatalogGateway",
        "./infrastructure/freezoneGenerationTaskGateway",
      ]),
    );
    expect(compositionSource).toContain("generateCanvasAudioUseCase(params, {");
    expect(compositionSource).toContain(
      "submissionGateway: freezoneAudioGenerationGateway",
    );
    expect(compositionSource).toContain(
      "taskGateway: freezoneGenerationTaskGateway",
    );
    expect(importSpecifiers(hookPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(hookPath)).not.toContain("@/api/tasks");
    expect(hookSource).toContain("await generateCanvasAudio(");
    expect(hookSource).not.toContain("submitFreezoneAudioMusic");
    expect(hookSource).not.toContain("submitFreezoneAudioSpeech");
    expect(hookSource).not.toContain("fetchFreezoneJobResult");
    expect(hookSource).not.toContain("awaitTaskCompletion");
    expect(panelControllerSource).toContain(
      "@/features/canvas/application/generateCanvasAudio",
    );
    expect(panelControllerSource).not.toContain(
      "deriveAudioText, useAudioGeneration",
    );
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneAudioGenerationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneAudioVoiceRefScope",
      "FreezoneAudioVoiceRef",
      "FreezoneAudioSpeechPayload",
      "submitFreezoneAudioSpeech",
      "FreezoneAudioMusicPayload",
      "submitFreezoneAudioMusic",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/audio/speech`");
    expect(legacyOpsSource).not.toContain("}/freezone/audio/eleven-music`");
  });

  it("keeps Canvas audio operations split into model, controller, and view", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/AudioOperationsPanel.tsx",
    );
    const modelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/audioOperationsPanelModel.ts",
    );
    const modelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/audioOperationsPanelModel.test.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAudioOperationsPanelController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAudioOperationsPanelController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/AudioOperationsPanelView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/AudioOperationsPanelView.test.tsx",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const modelSource = readFileSync(modelPath, "utf8");
    const modelTestSource = readFileSync(modelTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const declarations = [
      ["export function", "AudioOperationsPanel("].join(" "),
      ["export function", "musicBillingSecondsFromMs("].join(" "),
      ["export function", "useAudioOperationsPanelController("].join(" "),
      ["export function", "AudioOperationsPanelView("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const operationCommandOwners = [
      entryPath,
      modelPath,
      controllerPath,
      viewPath,
    ]
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes("translateCanvasText({") ||
          source.includes("navigator.clipboard.writeText(") ||
          source.includes("updateNodeData(nodeId")
        );
      })
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/hooks/useAudioOperationsPanelController",
        "./AudioOperationsPanelView",
      ]),
    );
    expect(entrySource).toContain("useAudioOperationsPanelController(props)");
    expect(entrySource).toContain(
      "createElement(AudioOperationsPanelView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("className=");
    expect(new Set(importSpecifiers(modelPath))).toEqual(
      new Set([
        "@/features/canvas/application/ports",
        "@/features/canvas/domain/canvasNodes",
      ]),
    );
    expect(modelSource).not.toContain("from 'react'");
    expect(modelSource).not.toContain("window.");
    expect(modelSource).not.toContain("document.");
    expect(modelSource).not.toContain("navigator.");
    expect(modelSource).not.toContain("className=");
    expect(controllerSource).toContain("useAudioGeneration(nodeId, data)");
    expect(controllerSource).toContain("translateCanvasText({");
    expect(controllerSource).toContain("useGenerationCreditCost(");
    expect(controllerSource).toContain("navigator.clipboard.writeText(");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("lucide-react");
    expect(controllerSource).not.toContain("<VoiceSelectionModal");
    expect(importSpecifiers(viewPath)).not.toContain(
      "@/features/canvas/canvasStore",
    );
    expect(importSpecifiers(viewPath)).not.toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(viewPath)).not.toContain("@/lib/url-params");
    expect(importSpecifiers(viewPath)).not.toContain(
      "@/modules/model_usage/public",
    );
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useMemo(");
    expect(viewSource).not.toContain("useRef(");
    expect(viewSource).toContain("<OperationPanelShell");
    expect(viewSource).toContain("<VoiceSelectionModal");
    expect(declarationOwners).toEqual([
      ["features/canvas/nodes/AudioOperationsPanel.tsx"],
      ["features/canvas/application/audioOperationsPanelModel.ts"],
      ["features/canvas/hooks/useAudioOperationsPanelController.ts"],
      ["features/canvas/nodes/AudioOperationsPanelView.tsx"],
    ]);
    expect(operationCommandOwners).toEqual([
      "features/canvas/hooks/useAudioOperationsPanelController.ts",
    ]);
    expect(modelTestSource).toContain(
      "from './audioOperationsPanelModel'",
    );
    expect(controllerTestSource).toContain(
      "from './useAudioOperationsPanelController'",
    );
    expect(viewTestSource).toContain(
      "from './AudioOperationsPanelView'",
    );
  });

  it("keeps Canvas story-script generation orchestration in application", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasStoryScript.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneStoryScriptGenerationGateway.ts",
    );
    const portsPath = resolve(
      SRC_ROOT,
      "features/canvas/application/ports.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const scriptModelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/scriptNodeModel.ts",
    );
    const scriptControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useScriptNodeController.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const portsSource = readFileSync(portsPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const scriptModelSource = readFileSync(scriptModelPath, "utf8");
    const scriptControllerSource = readFileSync(scriptControllerPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/text/story-script`"),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["../domain/canvasNodes", "./ports"]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export function classifyCanvasStoryScriptReference(",
    );
    expect(applicationSource).toContain(
      "export function buildCanvasStoryScriptCommand(",
    );
    expect(applicationSource).toContain(
      "export async function generateCanvasStoryScript(",
    );
    expect(applicationSource).toContain(
      "dependencies.onTaskSubmitted(task)",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasStoryScript",
        "../application/ports",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneStoryScriptGenerationGateway: CanvasStoryScriptSubmissionGateway",
    );
    expect(portsSource).toContain("export interface CanvasStoryScriptRow");
    expect(compositionSource).toContain(
      "generateCanvasStoryScriptUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneStoryScriptGenerationGateway",
    );
    expect(importSpecifiers(scriptControllerPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(scriptControllerPath)).not.toContain("@/api/tasks");
    expect(scriptControllerSource).toContain(
      "buildCanvasStoryScriptCommand({",
    );
    expect(scriptModelSource).toContain(
      "classifyCanvasStoryScriptReference(node)",
    );
    expect(scriptControllerSource).toContain(
      "await generateCanvasStoryScript(",
    );
    expect(scriptControllerSource).not.toContain("submitFreezoneStoryScript");
    expect(scriptControllerSource).not.toContain("fetchFreezoneStoryScriptResult");
    expect(scriptControllerSource).not.toContain("awaitTaskCompletion");
    expect(scriptControllerSource).not.toContain("FreezoneStoryScriptResult");
    expect(scriptControllerSource).not.toContain("FreezoneStoryScriptRow");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneStoryScriptGenerationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneStoryScriptCharacterRef",
      "FreezoneStoryScriptPayload",
      "submitFreezoneStoryScript",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/text/story-script`");
  });

  it("keeps Canvas reverse-prompt generation orchestration in application", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasReversePrompt.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneReversePromptGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const textNodeControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useTextAnnotationNodeController.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const textNodeControllerSource = readFileSync(
      textNodeControllerPath,
      "utf8",
    );
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "}/freezone/image/reverse-prompt`",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual(["./ports"]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasReversePrompt(",
    );
    expect(applicationSource).toContain(
      "dependencies.submissionGateway.prepareSourceUrl(",
    );
    expect(applicationSource).toContain(
      "dependencies.onTaskSubmitted(task)",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasReversePrompt",
        "../application/ports",
        "./freezoneAssetGateway",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneReversePromptGenerationGateway: CanvasReversePromptSubmissionGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasReversePromptUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneReversePromptGenerationGateway",
    );
    expect(compositionSource).toContain(
      "freezoneGenerationTaskGateway.awaitCompletion(taskKey, projectId)",
    );
    expect(importSpecifiers(textNodeControllerPath)).not.toContain(
      "@/api/ops",
    );
    expect(importSpecifiers(textNodeControllerPath)).not.toContain(
      "@/api/tasks",
    );
    expect(textNodeControllerSource).toContain(
      "await generateCanvasReversePrompt(",
    );
    expect(textNodeControllerSource).toContain(
      "await awaitCanvasGenerationTaskCompletion(",
    );
    expect(textNodeControllerSource).not.toContain(
      "ensureBackendImageUrl",
    );
    expect(textNodeControllerSource).not.toContain(
      "submitFreezoneReversePrompt",
    );
    expect(textNodeControllerSource).not.toContain(
      "fetchFreezoneReversePromptResult",
    );
    expect(textNodeControllerSource).not.toContain("awaitTaskCompletion");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneReversePromptGenerationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneReversePromptPayload",
      "submitFreezoneReversePrompt",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain(
      "}/freezone/image/reverse-prompt`",
    );
  });

  it("keeps Skill execution and task waiting behind Canvas composition", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/skillExecution.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/skillExecution.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneSkillExecutionGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const nodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useSkillNodeController.ts",
    );
    const outputProjectionPath = resolve(
      SRC_ROOT,
      "features/canvas/application/skillOutputProjection.ts",
    );
    const legacyOutputModelPath = resolve(
      SRC_ROOT,
      "features/freezone/context/skillNodeOutputs.ts",
    );
    const legacyApiPath = resolve(SRC_ROOT, "api/skills.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const nodeSource = readFileSync(nodePath, "utf8");
    const imports = importSpecifiers(nodePath);
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "/freezone/skills/runs/${encodeURIComponent(runId)}/result",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyApiPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual(["./skillContract"]);
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["@/features/freezone/public"]),
    );
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "@/features/freezone/public",
        "../application/skillExecution",
      ]),
    );
    expect(domainSource).toContain("isSkillRunTerminalStatus(");
    expect(applicationSource).toContain("dependencies.gateway.getRunResult(");
    expect(applicationSource).not.toContain("window.");
    expect(adapterSource).toContain("encodeURIComponent(skillId)");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneSkillExecutionGateway.ts",
    ]);
    expect(imports).toContain("@/features/canvas/composition");
    expect(imports).not.toContain("@/api/skills");
    expect(imports).not.toContain("@/api/tasks");
    expect(
      nodeSource.match(/await awaitCanvasGenerationTaskCompletion\(/g),
    ).toHaveLength(2);
    expect(
      nodeSource.match(/await awaitCanvasSkillRunResult\(/g),
    ).toHaveLength(2);
    expect(nodeSource).toContain("await startCanvasSkillRun({");
    expect(nodeSource).not.toContain("function isFailureStatus(");
    expect(nodeSource).not.toContain("function awaitSkillRunResult(");
    expect(compositionSource).toContain(
      "startCanvasSkillRunUseCase(params, freezoneSkillExecutionGateway)",
    );
    expect(compositionSource).toContain(
      "awaitCanvasSkillRunResultUseCase(params, {",
    );
    expect(existsSync(legacyOutputModelPath)).toBe(false);
    expect(new Set(importSpecifiers(outputProjectionPath))).toEqual(
      new Set(["@/features/freezone/public", "../domain/canvasNodes"]),
    );
    expect(imports).toContain(
      "@/features/canvas/application/skillOutputProjection",
    );
    expect(imports).not.toContain(
      "@/features/freezone/context/skillNodeOutputs",
    );
    expect(nodeSource).not.toContain("awaitTaskCompletion");
  });

  it("keeps Beat scene-asset queries behind Canvas composition", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/sceneAssets.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/sceneAssets.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneSceneAssetsGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const nodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useSkillNodeController.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/freezone/public.ts");
    const legacyApiPath = resolve(SRC_ROOT, "api/sceneAssets.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const nodeSource = readFileSync(nodePath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "freezone/scene-assets-for-beat?",
        ),
      )
      .map(relativeSource)
      .sort();
    const removedEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "freezone/director-capture/sync-background",
        ),
      )
      .map(relativeSource)
      .sort();
    const contractDeclaration = [
      "export interface",
      "SceneAssetsForBeat {",
    ].join(" ");
    const contractOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(contractDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(legacyApiPath)).toBe(false);
    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(importSpecifiers(applicationPath)).toEqual([
      "@/features/freezone/public",
    ]);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "@/features/freezone/public",
        "../application/sceneAssets",
      ]),
    );
    expect(applicationSource).not.toContain("@/api/");
    expect(adapterSource).toContain("encodeURIComponent(projectId)");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneSceneAssetsGateway.ts",
    ]);
    expect(removedEndpointOwners).toEqual([]);
    expect(contractOwners).toEqual([
      "features/freezone/domain/sceneAssets.ts",
    ]);
    expect(publicSource).toContain(
      'from "@/features/freezone/domain/sceneAssets"',
    );
    expect(importSpecifiers(nodePath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(nodePath)).toContain(
      "@/features/freezone/public",
    );
    expect(importSpecifiers(nodePath)).not.toContain("@/api/sceneAssets");
    expect(
      nodeSource.match(/getCanvasSceneAssetsForBeat\(\{/g),
    ).toHaveLength(2);
    expect(compositionSource).toContain(
      "getCanvasSceneAssetsForBeatUseCase(\n    params,\n    freezoneSceneAssetsGateway,",
    );
  });

  it("reuses the Asset World Beat director manifest through Canvas composition", () => {
    const assetApplicationPath = resolve(
      SRC_ROOT,
      "modules/asset_world/application/load-beat-director-manifest.ts",
    );
    const assetGatewayPath = resolve(
      SRC_ROOT,
      "modules/asset_world/infrastructure/http-beat-viewer-gateway.ts",
    );
    const assetCompositionPath = resolve(
      SRC_ROOT,
      "modules/asset_world/composition.ts",
    );
    const assetPublicPath = resolve(
      SRC_ROOT,
      "modules/asset_world/public.ts",
    );
    const canvasApplicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/beatDirectorManifest.ts",
    );
    const canvasCompositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const legacyApiPath = resolve(SRC_ROOT, "api/viewerManifests.ts");
    const duplicateAdapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneBeatDirectorManifestGateway.ts",
    );
    const nodePaths = [
      "features/canvas/hooks/useImageGenNodeController.ts",
      "features/canvas/hooks/useSkillNodeController.ts",
      "features/canvas/hooks/useThreeDWorldNodeController.ts",
      "features/canvas/hooks/useUploadNodeController.ts",
    ].map((path) => resolve(SRC_ROOT, path));
    const assetApplicationSource = readFileSync(assetApplicationPath, "utf8");
    const assetGatewaySource = readFileSync(assetGatewayPath, "utf8");
    const assetCompositionSource = readFileSync(assetCompositionPath, "utf8");
    const assetPublicSource = readFileSync(assetPublicPath, "utf8");
    const canvasCompositionSource = readFileSync(canvasCompositionPath, "utf8");
    const endpointDeclaration = [
      "async getDirectorStageManifest(",
      "project, episode, beatNumber, signal",
    ].join("");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(endpointDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(existsSync(duplicateAdapterPath)).toBe(false);
    expect(existsSync(legacyApiPath)).toBe(false);
    expect(new Set(importSpecifiers(assetApplicationPath))).toEqual(
      new Set([
        "@/features/viewer-kit/three-d/directorManifest",
        "@/modules/asset_world/application/beat-viewer-gateway",
      ]),
    );
    expect(importSpecifiers(canvasApplicationPath)).toEqual([
      "@/features/viewer-kit/three-d/directorManifest",
    ]);
    expect(assetApplicationSource).toContain(
      "gateway.getDirectorStageManifest(",
    );
    expect(assetApplicationSource).toContain("if (!response.ok)");
    expect(assetGatewaySource).toContain('"director-stage/manifest"');
    expect(endpointOwners).toEqual([
      "modules/asset_world/infrastructure/http-beat-viewer-gateway.ts",
    ]);
    expect(assetCompositionSource).toContain(
      "loadBeatDirectorStageManifestUseCase(",
    );
    expect(assetPublicSource).toContain("loadBeatDirectorStageManifest,");
    expect(importSpecifiers(canvasCompositionPath)).toContain(
      "@/modules/asset_world/public",
    );
    expect(canvasCompositionSource).toContain(
      "const canvasBeatDirectorManifestGateway",
    );
    expect(canvasCompositionSource).toContain(
      "getCanvasBeatDirectorManifestUseCase(",
    );
    for (const nodePath of nodePaths) {
      const nodeSource = readFileSync(nodePath, "utf8");
      expect(nodeSource).toContain("getCanvasBeatDirectorManifest");
      expect(nodeSource).not.toContain("getBeatDirectorStageManifest");
    }
  });

  it("keeps the Canvas director palette query behind one gateway", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/directorStagePalette.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneDirectorStagePaletteGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const nodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useThreeDWorldNodeController.ts",
    );
    const legacyApiPath = resolve(SRC_ROOT, "api/viewerManifests.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const nodeSource = readFileSync(nodePath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("director-stage/palette"),
      )
      .map(relativeSource)
      .sort();
    const paletteDeclaration = [
      "export type DirectorStagePalette",
      " =",
    ].join("");
    const contractOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(paletteDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual([
      "@/features/viewer-kit/three-d/directorManifest",
    ]);
    expect(existsSync(legacyApiPath)).toBe(false);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/directorStagePalette",
      ]),
    );
    expect(applicationSource).toContain("gateway.getPalette(params.projectId)");
    expect(adapterSource).toContain("encodeURIComponent(projectId)");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneDirectorStagePaletteGateway.ts",
    ]);
    expect(contractOwners).toEqual([
      "features/canvas/application/directorStagePalette.ts",
    ]);
    expect(compositionSource).toContain(
      "getCanvasDirectorStagePaletteUseCase(",
    );
    expect(importSpecifiers(nodePath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(nodePath)).not.toContain(
      "@/api/viewerManifests",
    );
    expect(nodeSource).toContain(
      "getCanvasDirectorStagePalette({ projectId })",
    );
  });

  it("does not retain unused viewer manifest API exports", () => {
    const apiPath = resolve(SRC_ROOT, "api/viewerManifests.ts");
    const dialogTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/viewer-kit/three-d/ThreeDDirectorDialog.test.tsx",
    );
    const dialogTestSource = readFileSync(dialogTestPath, "utf8");
    const removedExports = [
      "getBeatPanoViewerManifest",
      "getScenePanoViewerManifest",
      "startDirectorControlToSketch",
    ];

    expect(existsSync(apiPath)).toBe(false);
    for (const exportName of removedExports) {
      expect(dialogTestSource).not.toContain(exportName);
    }
  });

  it("keeps scene director world persistence in Asset World", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "modules/asset_world/application/scene-director-world.ts",
    );
    const gatewayPath = resolve(
      SRC_ROOT,
      "modules/asset_world/application/scene-gateway.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "modules/asset_world/infrastructure/http-scene-gateway.ts",
    );
    const moduleCompositionPath = resolve(
      SRC_ROOT,
      "modules/asset_world/composition.ts",
    );
    const publicPath = resolve(SRC_ROOT, "modules/asset_world/public.ts");
    const canvasCompositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const sourceIdentityPath = resolve(
      SRC_ROOT,
      "modules/asset_world/domain/director-world-source.ts",
    );
    const sourceIdentityTestPath = resolve(
      SRC_ROOT,
      "modules/asset_world/domain/director-world-source.test.ts",
    );
    const canvasSourcesPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/directorWorldSources.ts",
    );
    const assetLibraryModelPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/assetLibraryModel.ts",
    );
    const freezoneDomainPath = resolve(
      SRC_ROOT,
      "features/freezone/domain/directorWorldCommit.ts",
    );
    const freezoneApplicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/sceneDirectorWorldCommit.ts",
    );
    const freezoneAdapterPath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/assetWorldSceneDirectorCommitGateway.ts",
    );
    const freezoneCompositionPath = resolve(
      SRC_ROOT,
      "features/freezone/composition.ts",
    );
    const freezoneCommitTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/freezone/scene-director-world-commit.test.ts",
    );
    const legacyFreezoneCommitPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/sceneDirectorWorldCommit.ts",
    );
    const legacyApiPath = resolve(SRC_ROOT, "api/viewerManifests.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const moduleCompositionSource = readFileSync(
      moduleCompositionPath,
      "utf8",
    );
    const publicSource = readFileSync(publicPath, "utf8");
    const canvasCompositionSource = readFileSync(
      canvasCompositionPath,
      "utf8",
    );
    const sourceIdentitySource = readFileSync(sourceIdentityPath, "utf8");
    const canvasSourcesSource = readFileSync(canvasSourcesPath, "utf8");
    const freezoneDomainSource = readFileSync(freezoneDomainPath, "utf8");
    const freezoneApplicationSource = readFileSync(
      freezoneApplicationPath,
      "utf8",
    );
    const freezoneAdapterSource = readFileSync(freezoneAdapterPath, "utf8");
    const freezoneCompositionSource = readFileSync(
      freezoneCompositionPath,
      "utf8",
    );
    const sourceEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "director-stage/world/source",
        ),
      )
      .map(relativeSource)
      .sort();
    const clearEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "director-stage/world/clear",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "@/features/viewer-kit/three-d/directorManifest",
        "@/modules/asset_world/application/ports",
        "@/modules/asset_world/application/scene-gateway",
      ]),
    );
    expect(existsSync(legacyApiPath)).toBe(false);
    expect(applicationSource).toContain(
      "unwrapSceneDirectorWorldResponse(",
    );
    expect(applicationSource).not.toContain("react");
    expect(gatewaySource).toContain(
      "export interface SceneDirectorWorldSourceGateway",
    );
    expect(adapterSource).toContain(
      "SceneGateway & SceneDirectorWorldSourceGateway",
    );
    expect(sourceEndpointOwners).toEqual([
      "modules/asset_world/infrastructure/http-scene-gateway.ts",
    ]);
    expect(clearEndpointOwners).toEqual([
      "modules/asset_world/infrastructure/http-scene-gateway.ts",
    ]);
    expect(moduleCompositionSource).toContain(
      "loadSceneDirectorStageManifestUseCase(",
    );
    expect(moduleCompositionSource).toContain(
      "saveSceneDirectorWorldSourceUseCase(",
    );
    expect(publicSource).toContain("loadSceneDirectorStageManifest,");
    expect(publicSource).toContain("saveSceneDirectorWorldSource,");
    expect(importSpecifiers(sourceIdentityPath)).toEqual([]);
    expect(importSpecifiers(sourceIdentityTestPath)).toEqual([
      "vitest",
      "./director-world-source",
    ]);
    expect(sourceIdentitySource).toContain(
      "export function directorSourceIdentityUrl(",
    );
    expect(publicSource).toContain("directorSourceIdentityUrl");
    expect(importSpecifiers(canvasSourcesPath)).toContain(
      "@/modules/asset_world/public",
    );
    expect(canvasSourcesSource).not.toContain(
      "export function directorSourceIdentityUrl(",
    );
    expect(importSpecifiers(assetLibraryModelPath)).toContain(
      "@/modules/asset_world/public",
    );
    expect(importSpecifiers(assetLibraryModelPath)).not.toContain(
      "@/features/canvas/domain/directorWorldSources",
    );
    expect(importSpecifiers(canvasCompositionPath)).toContain(
      "@/modules/asset_world/public",
    );
    expect(canvasCompositionSource).toContain(
      "getSceneDirectorStageManifest: loadSceneDirectorStageManifest",
    );
    expect(existsSync(legacyFreezoneCommitPath)).toBe(false);
    expect(new Set(importSpecifiers(freezoneDomainPath))).toEqual(
      new Set([
        "@/modules/asset_world/public",
        "./assetCommit",
      ]),
    );
    expect(freezoneDomainSource).toContain(
      "export function buildSceneDirectorWorldCommitPlan(",
    );
    expect(freezoneDomainSource).not.toContain("@/features/canvas/");
    expect(freezoneDomainSource).not.toContain("@/features/viewer-kit/");
    expect(new Set(importSpecifiers(freezoneApplicationPath))).toEqual(
      new Set([
        "../domain/assetCommit",
        "../domain/directorWorldCommit",
      ]),
    );
    expect(freezoneApplicationSource).toContain(
      "buildSceneDirectorWorldCommitPlan(params.target, params.nodeData)",
    );
    expect(freezoneApplicationSource).not.toContain(
      "@/modules/asset_world/public",
    );
    expect(new Set(importSpecifiers(freezoneAdapterPath))).toEqual(
      new Set([
        "@/modules/asset_world/public",
        "../application/sceneDirectorWorldCommit",
      ]),
    );
    expect(freezoneAdapterSource).toContain(
      "await dependencies.loadSceneDirectorStageManifest(",
    );
    expect(freezoneAdapterSource).toContain(
      "export function createAssetWorldSceneDirectorCommitGateway(",
    );
    expect(importSpecifiers(freezoneCompositionPath)).toContain(
      "./application/sceneDirectorWorldCommit",
    );
    expect(importSpecifiers(freezoneCompositionPath)).toContain(
      "./infrastructure/assetWorldSceneDirectorCommitGateway",
    );
    expect(freezoneCompositionSource).toContain(
      "commitSceneDirectorWorldFromCanvasNodeUseCase(",
    );
    expect(importSpecifiers(freezoneCommitTestPath)).toContain(
      "@/features/freezone/domain/directorWorldCommit",
    );
    expect(importSpecifiers(freezoneCommitTestPath)).toContain(
      "@/features/freezone/application/sceneDirectorWorldCommit",
    );
    expect(importSpecifiers(freezoneCommitTestPath)).toContain(
      "@/features/freezone/infrastructure/assetWorldSceneDirectorCommitGateway",
    );
  });

  it("keeps Beat director editing behind the Viewer Kit public API", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/viewer-kit/three-d/application/directorStageOperations.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/viewer-kit/three-d/infrastructure/freezoneDirectorStageGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/viewer-kit/three-d/composition.ts",
    );
    const publicPath = resolve(SRC_ROOT, "features/viewer-kit/public.ts");
    const dialogPath = resolve(
      SRC_ROOT,
      "features/viewer-kit/three-d/ThreeDDirectorDialog.tsx",
    );
    const freezoneApplicationPath = resolve(
      SRC_ROOT,
      "features/freezone/application/directorRenderCommit.ts",
    );
    const freezoneAdapterPath = resolve(
      SRC_ROOT,
      "features/freezone/infrastructure/browserDirectorRenderCommitGateway.ts",
    );
    const freezoneCompositionPath = resolve(
      SRC_ROOT,
      "features/freezone/composition.ts",
    );
    const legacyFreezoneCommitPath = resolve(
      SRC_ROOT,
      "features/freezone/commit/directorRenderCommit.ts",
    );
    const legacyApiPath = resolve(SRC_ROOT, "api/viewerManifests.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const publicSource = readFileSync(publicPath, "utf8");
    const dialogSource = readFileSync(dialogPath, "utf8");
    const freezoneApplicationSource = readFileSync(
      freezoneApplicationPath,
      "utf8",
    );
    const freezoneAdapterSource = readFileSync(freezoneAdapterPath, "utf8");
    const freezoneCompositionSource = readFileSync(
      freezoneCompositionPath,
      "utf8",
    );
    const endpointOwner = (endpoint: string) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => !path.includes(".test."))
        .filter((path) => readFileSync(path, "utf8").includes(endpoint))
        .map(relativeSource)
        .sort();
    const expectedAdapter = [
      "features/viewer-kit/three-d/infrastructure/freezoneDirectorStageGateway.ts",
    ];

    expect(existsSync(legacyApiPath)).toBe(false);
    expect(existsSync(legacyFreezoneCommitPath)).toBe(false);
    expect(importSpecifiers(applicationPath)).toEqual([
      "../directorManifest",
    ]);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../directorManifest",
        "../application/directorStageOperations",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(adapterSource).toContain("beatDirectorPath(");
    expect(endpointOwner("director-stage/${suffix}")).toEqual(
      expectedAdapter,
    );
    expect(adapterSource).toContain('"overlay"');
    expect(adapterSource).toContain('"control-frame"');
    expect(endpointOwner("freezone/ai-staging-prop")).toEqual(
      expectedAdapter,
    );
    expect(compositionSource).toContain(
      "saveBeatDirectorControlFrameUseCase(",
    );
    expect(compositionSource).toContain("freezoneDirectorStageGateway");
    expect(publicSource).toContain("saveBeatDirectorControlFrame,");
    expect(importSpecifiers(dialogPath)).toContain(
      "@/features/viewer-kit/public",
    );
    expect(importSpecifiers(dialogPath)).not.toContain(
      "@/api/viewerManifests",
    );
    expect(dialogSource).toContain("saveBeatDirectorStageOverlay(");
    expect(importSpecifiers(freezoneApplicationPath)).toEqual([
      "../domain/assetCommit",
    ]);
    expect(new Set(importSpecifiers(freezoneAdapterPath))).toEqual(
      new Set([
        "@/features/viewer-kit/public",
        "../application/directorRenderCommit",
      ]),
    );
    expect(freezoneApplicationSource).not.toContain("fetch(");
    expect(freezoneApplicationSource).not.toContain("FileReader");
    expect(freezoneApplicationSource).not.toContain(
      "@/features/viewer-kit/public",
    );
    expect(importSpecifiers(freezoneAdapterPath)).not.toContain(
      "@/api/viewerManifests",
    );
    expect(freezoneAdapterSource).toContain("fetch(url");
    expect(freezoneAdapterSource).toContain("new FileReader()");
    expect(freezoneAdapterSource).toContain(
      "await saveBeatDirectorControlFrame(",
    );
    expect(importSpecifiers(freezoneCompositionPath)).toContain(
      "./application/directorRenderCommit",
    );
    expect(importSpecifiers(freezoneCompositionPath)).toContain(
      "./infrastructure/browserDirectorRenderCommitGateway",
    );
    expect(freezoneCompositionSource).toContain(
      "commitDirectorRenderFromCanvasSourceUseCase(",
    );
    expect(freezoneCompositionSource).toContain(
      "browserDirectorRenderCommitGateway",
    );
  });

  it("keeps Canvas image-to-3D generation orchestration out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/imageTo3d.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasImageTo3d.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneImageTo3dGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const nodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useThreeDWorldNodeController.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const nodeSource = readFileSync(nodePath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const declaration = [
      "export async function",
      "generateCanvasImageTo3d(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/image-to-3gs`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual(["./canvasNodes"]);
    expect(domainSource).toContain(
      "export function resolveCanvasImageTo3dSourceKind(",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/directorWorldSources",
        "../domain/imageTo3d",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "dependencies.taskGateway.awaitCompletion(",
    );
    expect(applicationSource).toContain("sourceFromImageTo3gsResult(");
    expect(implementationOwners).toEqual([
      "features/canvas/application/generateCanvasImageTo3d.ts",
    ]);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasImageTo3d",
        "../application/ports",
      ]),
    );
    expect(adapterSource).toContain(
      "freezoneImageTo3dGenerationGateway: CanvasImageTo3dSubmissionGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasImageTo3dUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneImageTo3dGenerationGateway",
    );
    expect(importSpecifiers(nodePath)).toContain(
      "@/features/canvas/domain/imageTo3d",
    );
    expect(importSpecifiers(nodePath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(nodePath)).not.toContain("@/api/ops");
    expect(importSpecifiers(nodePath)).not.toContain("@/api/tasks");
    expect(nodeSource).toContain("await generateCanvasImageTo3d(");
    expect(nodeSource).not.toContain("submitFreezoneImageTo3GS");
    expect(nodeSource).not.toContain("awaitTaskCompletion");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneImageTo3dGenerationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneImageTo3GSPayload",
      "submitFreezoneImageTo3GS",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/image-to-3gs`");
    expect(legacyOpsSource).not.toContain(
      "@/features/canvas/domain/imageTo3d",
    );
  });

  it("keeps Canvas image generation tasks behind one shared gateway", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasImage.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneImageGenerationGateway.ts",
    );
    const legacyGatewayPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAiGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const nodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageGenNodeController.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const legacyGatewaySource = readFileSync(legacyGatewayPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const nodeSource = readFileSync(nodePath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/gen`"),
      )
      .map(relativeSource)
      .sort();
    const editEndpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/edit`"),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["./completeCanvasMediaGenerationTask", "./ports"]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasImage",
        "../application/ports",
        "./freezoneAssetGateway",
      ]),
    );
    expect(adapterSource).toContain(
      "freezoneImageGenerationGateway: CanvasImageGenerationSubmissionGateway",
    );
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneImageGenerationGateway.ts",
    ]);
    expect(importSpecifiers(legacyGatewayPath)).toContain(
      "./freezoneImageGenerationGateway",
    );
    expect(importSpecifiers(legacyGatewayPath)).toContain(
      "./freezoneGenerationTaskGateway",
    );
    expect(importSpecifiers(legacyGatewayPath)).toContain(
      "./freezoneAssetGateway",
    );
    expect(importSpecifiers(legacyGatewayPath)).toContain(
      "@/shared/api/client",
    );
    expect(importSpecifiers(legacyGatewayPath)).not.toContain("@/api/ops");
    expect(legacyGatewaySource).toContain(
      "freezoneImageGenerationGateway.submit(projectId, {",
    );
    expect(legacyGatewaySource).toContain(
      "freezoneGenerationTaskGateway.awaitCompletion(",
    );
    expect(legacyGatewaySource).toContain(
      "freezoneGenerationTaskGateway.fetchResultUrl(",
    );
    expect(legacyGatewaySource).toContain("submitImageEdit(projectId, {");
    expect(editEndpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneAiGateway.ts",
    ]);
    expect(legacyGatewaySource).not.toContain("submitFreezoneGen");
    expect(legacyGatewaySource).not.toContain("fetchFreezoneJobResult");
    expect(legacyGatewaySource).not.toContain("awaitTaskCompletion");
    expect(importSpecifiers(legacyGatewayPath)).not.toContain("@/api/tasks");
    expect(compositionSource).toContain(
      "generateCanvasImageUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneImageGenerationGateway",
    );
    expect(importSpecifiers(nodePath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(nodePath)).not.toContain("@/api/ops");
    expect(importSpecifiers(nodePath)).not.toContain("@/api/tasks");
    expect(nodeSource).toContain("await generateCanvasImage(");
    expect(nodeSource).not.toContain("submitFreezoneGen");
    expect(nodeSource).not.toContain("fetchFreezoneJobResult");
    expect(nodeSource).not.toContain("awaitTaskCompletion");
    expect(nodeSource).not.toContain("resolveGenerationOutputUrl");
    for (const legacySymbol of [
      "FreezoneGenCamera",
      "FreezoneGenStyle",
      "FreezoneGenPayload",
      "submitFreezoneGen",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    for (const legacySymbol of [
      "FreezoneNodeContext",
      "FreezoneProvider",
      "FreezoneEditPayload",
      "submitFreezoneEdit",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/gen`");
    expect(legacyOpsSource).not.toContain("}/freezone/edit`");
  });

  it("keeps Canvas generation result queries behind one shared gateway", () => {
    const gatewayPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneGenerationTaskGateway.ts",
    );
    const portsPath = resolve(
      SRC_ROOT,
      "features/canvas/application/ports.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const portsSource = readFileSync(portsPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "}/freezone/jobs/${encodeURIComponent(taskType)}/${encodeURIComponent(jobId)}/result`",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(gatewayPath))).toEqual(
      new Set([
        "@/task-center/public",
        "@/shared/api/client",
        "../application/ports",
      ]),
    );
    expect(gatewaySource).toContain(
      "freezoneGenerationTaskGateway: CanvasGenerationTaskGateway",
    );
    expect(gatewaySource).toContain(
      "resultPath(projectId, 'freezone_image_reverse_prompt', jobId)",
    );
    expect(gatewaySource).toContain(
      "resultPath(projectId, 'freezone_story_script', jobId)",
    );
    expect(portsSource).toContain(
      "export interface CanvasStoryScriptResult",
    );
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneGenerationTaskGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneJobResult",
      "fetchFreezoneJobResult",
      "FreezoneReversePromptResult",
      "fetchFreezoneReversePromptResult",
      "FreezoneStoryScriptRow",
      "FreezoneStoryScriptResult",
      "fetchFreezoneStoryScriptResult",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/jobs/");
  });

  it("keeps Canvas video story analysis behind application", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/analyzeCanvasVideoStory.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneVideoStoryAnalysisGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const toolbarPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/NodeActionToolbar.tsx",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const toolbarSource = readFileSync(toolbarPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "}/freezone/analyze-video-story`",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["./ports", "./videoStoryNormalizer"]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "dependencies.taskGateway.awaitCompletion(",
    );
    expect(applicationSource).toContain("normalizeVideoStoryRows(rawResult)");
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/analyzeCanvasVideoStory",
      ]),
    );
    expect(adapterSource).toContain(
      "freezoneVideoStoryAnalysisGateway: CanvasVideoStoryAnalysisSubmissionGateway",
    );
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneVideoStoryAnalysisGateway.ts",
    ]);
    expect(compositionSource).toContain(
      "analyzeCanvasVideoStoryUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneVideoStoryAnalysisGateway",
    );
    expect(toolbarSource).toContain("await analyzeCanvasVideoStory({");
    expect(toolbarSource).not.toContain("submitFreezoneAnalyzeVideoStory");
    expect(toolbarSource).not.toContain("normalizeVideoStoryRows");
    for (const legacySymbol of [
      "FreezoneAnalyzeVideoStoryPayload",
      "submitFreezoneAnalyzeVideoStory",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain(
      "}/freezone/analyze-video-story`",
    );
  });

  it("keeps Canvas audio separation orchestration and result mapping out of UI", () => {
    const resultPath = resolve(
      SRC_ROOT,
      "features/canvas/application/audioSeparationResult.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/separateCanvasAudioVideo.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAudioSeparationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const toolbarPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/NodeActionToolbar.tsx",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const resultSource = readFileSync(resultPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const toolbarSource = readFileSync(toolbarPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const productionSources = sourceFiles(SRC_ROOT).filter(
      (path) => !path.includes(".test."),
    );
    const submitEndpointOwners = productionSources
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "}/freezone/video/audio-separate`",
        ),
      )
      .map(relativeSource)
      .sort();
    const resultEndpointOwners = productionSources
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "/freezone/jobs/freezone_audio_separate/",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(resultPath)).toEqual([]);
    expect(resultSource).toContain(
      "export function resolveCanvasAudioSeparationOutputs(",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["./audioSeparationResult", "./ports"]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "dependencies.taskGateway.awaitCompletion(",
    );
    expect(applicationSource).toContain(
      "dependencies.audioSeparationGateway.fetchResult(",
    );
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/ports",
        "../application/separateCanvasAudioVideo",
      ]),
    );
    expect(adapterSource).toContain(
      "freezoneAudioSeparationGateway: CanvasAudioSeparationGateway",
    );
    expect(submitEndpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneAudioSeparationGateway.ts",
    ]);
    expect(resultEndpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneAudioSeparationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneAudioSeparatePayload",
      "submitFreezoneAudioSeparate",
      "fetchFreezoneAudioSeparateResult",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(compositionSource).toContain(
      "separateCanvasAudioVideoUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "audioSeparationGateway: freezoneAudioSeparationGateway",
    );
    expect(importSpecifiers(toolbarPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(toolbarPath)).not.toContain("@/api/tasks");
    expect(toolbarSource).toContain("await separateCanvasAudioVideo({");
    expect(toolbarSource).not.toContain("submitFreezoneAudioSeparate");
    expect(toolbarSource).not.toContain("fetchFreezoneAudioSeparateResult");
    expect(toolbarSource).not.toContain("awaitTaskCompletion");
    expect(toolbarSource).not.toContain("collectStrings");
    expect(toolbarSource).not.toContain("toStaticUrl");
  });

  it("keeps Canvas scene-360 generation orchestration in application", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/scene360.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasScene360.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneScene360GenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/Scene360Overlay.tsx",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const overlaySource = readFileSync(overlayPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/scene-360`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export const CANVAS_SCENE_360_ASPECT_RATIOS",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/scene360",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasScene360(",
    );
    expect(applicationSource).toContain(
      'referenceUrl: params.referenceUrl.split("?")[0]',
    );
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(applicationSource).toContain(
      "onTaskSubmitted: dependencies.onTaskSubmitted",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasScene360",
        "../application/ports",
        "./freezoneAssetGateway",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneScene360GenerationGateway: CanvasScene360GenerationGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasScene360UseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneScene360GenerationGateway",
    );
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("await generateCanvasScene360(");
    expect(overlaySource).not.toContain("submitFreezoneScene360");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneScene360GenerationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneScene360Payload",
      "submitFreezoneScene360",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/scene-360`");
    expect(legacyOpsSource).not.toContain(
      "@/features/canvas/domain/scene360",
    );
  });

  it("keeps Canvas multi-angle generation rules and orchestration out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/multiAngle.ts",
    );
    const completionPath = resolve(
      SRC_ROOT,
      "features/canvas/application/completeCanvasMediaGenerationTask.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasMultiAngle.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneMultiAngleGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/MultiAngleEditorPanel.tsx",
    );
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/MultiAngleEditorOverlay.tsx",
    );
    const sceneApplicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasScene360.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const completionSource = readFileSync(completionPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const overlaySource = readFileSync(overlayPath, "utf8");
    const sceneApplicationSource = readFileSync(sceneApplicationPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/multi-view`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export function resolveMultiAngleGenerationPreset(",
    );
    expect(domainSource).toContain(
      "export function normalizeMultiAngleYaw(",
    );
    expect(importSpecifiers(completionPath)).toEqual(["./ports"]);
    expect(completionSource).toContain(
      "dependencies.onTaskSubmitted(params.task)",
    );
    expect(completionSource).toContain(
      "dependencies.taskGateway.fetchResultUrl(",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/multiAngle",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasMultiAngle(",
    );
    expect(applicationSource).toContain(
      "preset: resolveMultiAngleGenerationPreset(params.preset)",
    );
    expect(applicationSource).toContain(
      "yawDegrees: normalizeMultiAngleYaw(params.yawDegrees)",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasMultiAngle",
        "../application/ports",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneMultiAngleGenerationGateway: CanvasMultiAngleGenerationGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasMultiAngleUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneMultiAngleGenerationGateway",
    );
    expect(importSpecifiers(panelPath)).toContain(
      "@/features/canvas/domain/multiAngle",
    );
    expect(panelSource).not.toContain("export type MultiAnglePresetKey");
    expect(panelSource).not.toContain("export type MultiAngleZoomLevel");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("await generateCanvasMultiAngle(");
    expect(overlaySource).not.toContain("PRESET_MAP");
    expect(overlaySource).not.toContain("normalizeYaw");
    expect(overlaySource).not.toContain("submitFreezoneMultiView");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
    expect(sceneApplicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneMultiAngleGenerationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneMultiViewPreset",
      "FreezoneMultiViewShotSize",
      "FreezoneMultiViewPayload",
      "submitFreezoneMultiView",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/multi-view`");
  });

  it("keeps Canvas relight rules and generation orchestration out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/relight.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasRelight.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneRelightGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const panelPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/LightEditorPanel.tsx",
    );
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/LightEditorOverlay.tsx",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const panelSource = readFileSync(panelPath, "utf8");
    const overlaySource = readFileSync(overlayPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/relight`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export function resolveCanvasRelightKeyLightDirection(",
    );
    expect(domainSource).toContain(
      "export function buildCanvasRelightPrompt(",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/relight",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasRelight(",
    );
    expect(applicationSource).toContain(
      "resolveCanvasRelightKeyLightDirection(",
    );
    expect(applicationSource).toContain("buildCanvasRelightPrompt(");
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasRelight",
        "../application/ports",
        "./freezoneAssetGateway",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneRelightGenerationGateway: CanvasRelightGenerationGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasRelightUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneRelightGenerationGateway",
    );
    expect(importSpecifiers(panelPath)).toContain(
      "@/features/canvas/domain/relight",
    );
    expect(panelSource).not.toContain("export type LightDirectionKey");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("await generateCanvasRelight(");
    expect(overlaySource).not.toContain("KEY_LIGHT_DIRECTIONS");
    expect(overlaySource).not.toContain("resolveKeyLightDirection");
    expect(overlaySource).not.toContain("buildRelightPrompt");
    expect(overlaySource).not.toContain("submitFreezoneRelight");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneRelightGenerationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneRelightScope",
      "FreezoneRelightKeyLightDirection",
      "FreezoneRelightPayload",
      "submitFreezoneRelight",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/relight`");
  });

  it("keeps Canvas grid-action rules and generation orchestration out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/gridAction.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasGridAction.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneGridActionGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/GridActionConfirmOverlay.tsx",
    );
    const toolbarPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/NodeActionToolbar.tsx",
    );
    const selectedOverlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/SelectedNodeOverlay.tsx",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const overlaySource = readFileSync(overlayPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/template-edit`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export function resolveGridActionTemplateMode(",
    );
    expect(domainSource).toContain("export interface GridActionRequest");
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/gridAction",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasGridAction(",
    );
    expect(applicationSource).toContain(
      "mode: resolveGridActionTemplateMode(params.actionKey)",
    );
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasGridAction",
        "../application/ports",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneGridActionGenerationGateway: CanvasGridActionGenerationGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasGridActionUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneGridActionGenerationGateway",
    );
    expect(importSpecifiers(overlayPath)).toContain(
      "@/features/canvas/domain/gridAction",
    );
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("await generateCanvasGridAction(");
    expect(overlaySource).not.toContain("GRID_ACTION_MODE_MAP");
    expect(overlaySource).not.toContain("submitFreezoneTemplateEdit");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
    expect(importSpecifiers(toolbarPath)).toContain(
      "@/features/canvas/domain/gridAction",
    );
    expect(importSpecifiers(toolbarPath)).not.toContain(
      "./GridActionConfirmOverlay",
    );
    expect(importSpecifiers(selectedOverlayPath)).toContain(
      "@/features/canvas/domain/gridAction",
    );
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneGridActionGenerationGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneTemplateEditMode",
      "FreezoneTemplateEditPayload",
      "submitFreezoneTemplateEdit",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/template-edit`");
  });

  it("keeps Canvas image-upscale rules and generation orchestration out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/upscale.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasUpscale.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneUpscaleGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/UpscaleEditorOverlay.tsx",
    );
    const opsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const overlaySource = readFileSync(overlayPath, "utf8");
    const opsSource = readFileSync(opsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/upscale`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export const CANVAS_UPSCALE_IMAGE_SIZES",
    );
    expect(domainSource).toContain(
      "export function resolveCanvasUpscaleImageSize(",
    );
    expect(domainSource).toContain(
      "export function resolveCanvasUpscaleScaleFactor(",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/upscale",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasUpscale(",
    );
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasUpscale",
        "../application/ports",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneUpscaleGenerationGateway: CanvasUpscaleGenerationGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasUpscaleUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneUpscaleGenerationGateway",
    );
    expect(importSpecifiers(overlayPath)).toContain(
      "@/features/canvas/domain/upscale",
    );
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("await generateCanvasUpscale(");
    expect(overlaySource).not.toContain("submitFreezoneUpscale");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneUpscaleGenerationGateway.ts",
    ]);
    expect(opsSource).not.toContain("@/features/canvas/domain/upscale");
    expect(opsSource).not.toContain("FreezoneUpscalePayload");
    expect(opsSource).not.toContain("submitFreezoneUpscale");
    expect(opsSource).not.toContain("}/freezone/upscale`");
    expect(opsSource).not.toContain("FreezoneUpscaleScaleFactor");
  });

  it("keeps Canvas video-upscale rules and generation orchestration out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoUpscale.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasVideoUpscale.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneVideoUpscaleGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/VideoUpscaleEditorOverlay.tsx",
    );
    const opsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const overlaySource = readFileSync(overlayPath, "utf8");
    const opsSource = readFileSync(opsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/video/upscale`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export const CANVAS_VIDEO_UPSCALE_RESOLUTIONS",
    );
    expect(domainSource).toContain(
      "export function resolveCanvasVideoUpscaleResolution(",
    );
    expect(domainSource).toContain(
      "export function resolveCanvasVideoUpscaleDenoise(",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/videoUpscale",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasVideoUpscale(",
    );
    expect(applicationSource).toContain('frameInterpolation: "none"');
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasVideoUpscale",
        "../application/ports",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneVideoUpscaleGenerationGateway: CanvasVideoUpscaleGenerationGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasVideoUpscaleUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneVideoUpscaleGenerationGateway",
    );
    expect(importSpecifiers(overlayPath)).toContain(
      "@/features/canvas/domain/videoUpscale",
    );
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("await generateCanvasVideoUpscale(");
    expect(overlaySource).not.toContain("submitFreezoneVideoUpscale");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneVideoUpscaleGenerationGateway.ts",
    ]);
    expect(opsSource).not.toContain("@/features/canvas/domain/videoUpscale");
    expect(opsSource).not.toContain("FreezoneVideoUpscalePayload");
    expect(opsSource).not.toContain("submitFreezoneVideoUpscale");
    expect(opsSource).not.toContain("}/freezone/video/upscale`");
    expect(opsSource).not.toContain("FreezoneVideoUpscaleResolution");
    expect(opsSource).not.toContain("FreezoneVideoUpscaleDenoise");
  });

  it("keeps Canvas outpaint rules and generation orchestration out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/outpaint.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasOutpaint.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneOutpaintGenerationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/OutpaintEditorOverlay.tsx",
    );
    const opsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const overlaySource = readFileSync(overlayPath, "utf8");
    const opsSource = readFileSync(opsPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/outpaint`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export const CANVAS_OUTPAINT_ASPECT_RATIOS",
    );
    expect(domainSource).toContain(
      "export function calculateCanvasOutpaintFrame(",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/outpaint",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasOutpaint(",
    );
    expect(applicationSource).toContain("numImages: 1");
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/generateCanvasOutpaint",
        "../application/ports",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneOutpaintGenerationGateway: CanvasOutpaintGenerationGateway",
    );
    expect(compositionSource).toContain(
      "generateCanvasOutpaintUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "submissionGateway: freezoneOutpaintGenerationGateway",
    );
    expect(importSpecifiers(overlayPath)).toContain(
      "@/features/canvas/domain/outpaint",
    );
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("calculateCanvasOutpaintFrame(");
    expect(overlaySource).toContain("await generateCanvasOutpaint(");
    expect(overlaySource).not.toContain("submitFreezoneOutpaint");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneOutpaintGenerationGateway.ts",
    ]);
    expect(opsSource).not.toContain("@/features/canvas/domain/outpaint");
    expect(opsSource).not.toContain("FreezoneOutpaintPayload");
    expect(opsSource).not.toContain("submitFreezoneOutpaint");
    expect(opsSource).not.toContain("}/freezone/outpaint`");
    expect(opsSource).not.toContain("FreezoneOutpaintAspectRatio");
  });

  it("keeps Canvas redraw rules and generation orchestration out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/redraw.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generateCanvasRedraw.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneRedrawTaskGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/RedrawOverlay.tsx",
    );
    const retryPath = resolve(
      SRC_ROOT,
      "features/canvas/application/regenerateExportNode.ts",
    );
    const portsPath = resolve(
      SRC_ROOT,
      "features/canvas/application/ports.ts",
    );
    const opsPath = resolve(SRC_ROOT, "api/ops.ts");
    const pipelineEditorPath = resolve(
      SRC_ROOT,
      "features/freezone/presentation/MaskEditor.tsx",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const overlaySource = readFileSync(overlayPath, "utf8");
    const retrySource = readFileSync(retryPath, "utf8");
    const portsSource = readFileSync(portsPath, "utf8");
    const opsSource = readFileSync(opsPath, "utf8");
    const pipelineEditorSource = readFileSync(pipelineEditorPath, "utf8");
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/redraw`"),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export const CANVAS_REDRAW_ASPECT_RATIOS",
    );
    expect(domainSource).toContain(
      "export function resolveCanvasRedrawAspectRatio(",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/redraw",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "export async function generateCanvasRedraw(",
    );
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/ports",
        "./freezoneGenerationTaskGateway",
      ]),
    );
    expect(infrastructureSource).toContain(
      "freezoneRedrawTaskGateway: CanvasRedrawTaskGateway",
    );
    expect(infrastructureSource).toContain("prompt: command.prompt");
    expect(infrastructureSource).toContain("model: command.model");
    expect(compositionSource).toContain(
      "generateCanvasRedrawUseCase(params, {",
    );
    expect(compositionSource).toContain(
      "redrawGateway: freezoneRedrawTaskGateway",
    );
    expect(importSpecifiers(overlayPath)).toContain(
      "@/features/canvas/domain/redraw",
    );
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(overlayPath)).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("await generateCanvasRedraw(");
    expect(overlaySource).not.toContain("submitFreezoneRedraw");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
    expect(retrySource).toContain("completeCanvasMediaGenerationTask(");
    expect(retrySource).not.toContain("redrawGateway.awaitCompletion(");
    expect(retrySource).not.toContain("redrawGateway.fetchResultUrl(");
    expect(portsSource).toContain("prompt?: string");
    expect(portsSource).toContain("model?: string");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneRedrawTaskGateway.ts",
    ]);
    expect(importSpecifiers(pipelineEditorPath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(pipelineEditorPath)).toContain(
      "@/features/canvas/domain/redraw",
    );
    expect(importSpecifiers(pipelineEditorPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(pipelineEditorPath)).not.toContain("@/api/tasks");
    expect(pipelineEditorSource).toContain("await generateCanvasRedraw(");
    expect(opsSource).not.toContain("@/features/canvas/domain/redraw");
    expect(opsSource).not.toContain("FreezoneRedrawPayload");
    expect(opsSource).not.toContain("submitFreezoneRedraw");
    expect(opsSource).not.toContain("}/freezone/redraw`");
    expect(opsSource).not.toContain("FreezoneRedrawAspectRatio");
  });

  it("routes Canvas erase generation through the redraw use case", () => {
    const overlayPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/EraseOverlay.tsx",
    );
    const overlaySource = readFileSync(overlayPath, "utf8");
    const imports = importSpecifiers(overlayPath);

    expect(imports).toContain("@/features/canvas/composition");
    expect(imports).toContain("@/features/canvas/domain/redraw");
    expect(imports).not.toContain("@/api/ops");
    expect(imports).not.toContain("@/api/tasks");
    expect(overlaySource).toContain("await generateCanvasRedraw(");
    expect(overlaySource).not.toContain("submitFreezoneRedraw");
    expect(overlaySource).not.toContain("fetchFreezoneJobResult");
    expect(overlaySource).not.toContain("awaitTaskCompletion");
  });

  it("keeps Canvas asset extraction independent from media URL infrastructure", () => {
    const assetPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasAssets.ts",
    );
    const assetSource = readFileSync(assetPath, "utf8");
    const historyControllerSource = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasHistoryAssetsModalController.ts",
      ),
      "utf8",
    );

    expect(importSpecifiers(assetPath)).not.toContain("@/lib/media-url");
    expect(assetSource).toContain("resolveMediaUrl: CanvasMediaUrlResolver");
    expect(historyControllerSource).toContain(
      "extractCanvasAssets(nodes, resolveMediaUrl)",
    );
    expect(historyControllerSource).toContain(
      "recordsToAssetBuckets(records, resolveNodeMeta, resolveMediaUrl)",
    );
  });

  it("keeps Canvas history-assets modal split into controller, view, and media leaf", () => {
    const entryPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/CanvasHistoryAssetsModal.tsx",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasHistoryAssetsModalController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasHistoryAssetsModalController.test.tsx",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/CanvasHistoryAssetsModalView.tsx",
    );
    const viewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/CanvasHistoryAssetsModalView.test.tsx",
    );
    const cardPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/CanvasHistoryAssetCard.tsx",
    );
    const cardTestPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/CanvasHistoryAssetCard.test.tsx",
    );
    const entrySource = readFileSync(entryPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const viewTestSource = readFileSync(viewTestPath, "utf8");
    const cardSource = readFileSync(cardPath, "utf8");
    const cardTestSource = readFileSync(cardTestPath, "utf8");
    const declarations = [
      ["export function", "CanvasHistoryAssetsModal("].join(" "),
      ["export function", "useCanvasHistoryAssetsModalController("].join(
        " ",
      ),
      ["export function", "CanvasHistoryAssetsModalView("].join(" "),
      ["export function", "CanvasHistoryAssetCard("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(entryPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/hooks/useCanvasHistoryAssetsModalController",
        "./CanvasHistoryAssetsModalView",
      ]),
    );
    expect(entrySource).toContain(
      "useCanvasHistoryAssetsModalController(props)",
    );
    expect(entrySource).toContain(
      "createElement(CanvasHistoryAssetsModalView, { controller })",
    );
    expect(entrySource).not.toContain("useState(");
    expect(entrySource).not.toContain("className=");
    expect(controllerSource).toContain("useCanvasGenerationHistory(");
    expect(controllerSource).toContain(
      "recordsToAssetBuckets(records, resolveNodeMeta, resolveMediaUrl)",
    );
    expect(controllerSource).toContain(
      "extractCanvasAssets(nodes, resolveMediaUrl)",
    );
    expect(controllerSource).toContain("downloadUrlAsFile(asset.url)");
    expect(controllerSource).toContain("buildStandaloneWorldManifest({");
    expect(controllerSource).not.toContain("className=");
    expect(controllerSource).not.toContain("lucide-react");
    expect(controllerSource).not.toContain("<ImageViewerModal");
    expect(importSpecifiers(viewPath)).not.toContain(
      "@/features/canvas/canvasStore",
    );
    expect(importSpecifiers(viewPath)).not.toContain(
      "@/features/canvas/hooks/useCanvasGenerationHistory",
    );
    expect(importSpecifiers(viewPath)).not.toContain("@/lib/browserDownload");
    expect(importSpecifiers(viewPath)).not.toContain("@/lib/url-params");
    expect(viewSource).not.toContain("useState(");
    expect(viewSource).not.toContain("useEffect(");
    expect(viewSource).not.toContain("useMemo(");
    expect(viewSource).not.toContain("useRef(");
    expect(viewSource).not.toContain("requestAnimationFrame");
    expect(viewSource).not.toContain("<audio");
    expect(viewSource).toContain("<CanvasHistoryAssetCard");
    expect(viewSource).toContain("<ImageViewerModal");
    expect(viewSource).toContain("<VideoViewerModal");
    expect(viewSource).toContain("<ThreeDDirectorDialog");
    expect(cardSource).toContain("<audio");
    expect(cardSource).toContain("requestAnimationFrame(tick)");
    expect(cardSource).not.toContain("@/features/canvas/canvasStore");
    expect(cardSource).not.toContain("useCanvasGenerationHistory(");
    expect(cardSource).not.toContain("downloadUrlAsFile(");
    expect(cardSource).not.toContain("readUrl(");
    expect(declarationOwners).toEqual([
      ["features/canvas/ui/CanvasHistoryAssetsModal.tsx"],
      ["features/canvas/hooks/useCanvasHistoryAssetsModalController.ts"],
      ["features/canvas/ui/CanvasHistoryAssetsModalView.tsx"],
      ["features/canvas/ui/CanvasHistoryAssetCard.tsx"],
    ]);
    expect(controllerTestSource).toContain(
      "from './useCanvasHistoryAssetsModalController'",
    );
    expect(viewTestSource).toContain(
      "from './CanvasHistoryAssetsModalView'",
    );
    expect(cardTestSource).toContain("from './CanvasHistoryAssetCard'");
  });

  it("keeps generation-history record parsing and asset projection out of UI", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/generationHistoryRecord.ts",
    );
    const domainTestPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/generationHistoryRecord.test.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generationHistoryAssets.ts",
    );
    const historyAssetTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/canvas/history-assets-buckets.test.ts",
    );
    const historyViewPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/NodeGenerationHistory.tsx",
    );
    const historyAssetsControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasHistoryAssetsModalController.ts",
    );
    const imageControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageGenNodeController.ts",
    );
    const videoControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoNodeController.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const domainTestSource = readFileSync(domainTestPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const historyAssetTestSource = readFileSync(historyAssetTestPath, "utf8");
    const historyViewSource = readFileSync(historyViewPath, "utf8");
    const historyAssetsControllerSource = readFileSync(
      historyAssetsControllerPath,
      "utf8",
    );
    const imageControllerSource = readFileSync(imageControllerPath, "utf8");
    const videoControllerSource = readFileSync(videoControllerPath, "utf8");
    const declarations = [
      ["export function", "historyRecordOutputUrl("].join(" "),
      ["export function", "historyRecordWorldUrl("].join(" "),
      ["export function", "historyRecordStrictWorldUrl("].join(" "),
      ["export function", "historyRecordPreviewImageUrl("].join(" "),
      ["export function", "historyRecordInputImageUrl("].join(" "),
      ["export function", "historyRecordPrompt("].join(" "),
      ["export function", "isCompletedHistoryRecord("].join(" "),
      ["export function", "hasCompletedHistoryRecords("].join(" "),
      ["export function", "recordsToAssetBuckets("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("@/features/canvas/application/");
    expect(domainSource).not.toContain("@/lib/");
    expect(domainSource).not.toContain("className=");
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "@/features/canvas/application/generationHistory",
        "@/features/canvas/domain/canvasAssets",
        "@/features/canvas/domain/generationHistoryRecord",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/features/canvas/ui/");
    expect(applicationSource).not.toContain("@/lib/media-url");
    expect(applicationSource).not.toContain("className=");
    expect(historyViewSource).toContain(
      "@/features/canvas/domain/generationHistoryRecord",
    );
    expect(historyViewSource).not.toContain(
      "export function historyRecord",
    );
    expect(historyViewSource).not.toContain(
      "export function hasCompletedHistoryRecords",
    );
    expect(historyAssetsControllerSource).toContain(
      "@/features/canvas/application/generationHistoryAssets",
    );
    expect(historyAssetsControllerSource).not.toContain(
      "export function recordsToAssetBuckets",
    );
    expect(imageControllerSource).toContain(
      "@/features/canvas/domain/generationHistoryRecord",
    );
    expect(videoControllerSource).toContain(
      "@/features/canvas/domain/generationHistoryRecord",
    );
    expect(imageControllerSource).not.toContain(
      "@/features/canvas/ui/NodeGenerationHistory",
    );
    expect(videoControllerSource).not.toContain(
      "@/features/canvas/ui/NodeGenerationHistory",
    );
    expect(declarationOwners).toEqual([
      ["features/canvas/domain/generationHistoryRecord.ts"],
      ["features/canvas/domain/generationHistoryRecord.ts"],
      ["features/canvas/domain/generationHistoryRecord.ts"],
      ["features/canvas/domain/generationHistoryRecord.ts"],
      ["features/canvas/domain/generationHistoryRecord.ts"],
      ["features/canvas/domain/generationHistoryRecord.ts"],
      ["features/canvas/domain/generationHistoryRecord.ts"],
      ["features/canvas/domain/generationHistoryRecord.ts"],
      ["features/canvas/application/generationHistoryAssets.ts"],
    ]);
    expect(domainTestSource).toContain("from './generationHistoryRecord'");
    expect(historyAssetTestSource).toContain(
      "@/features/canvas/application/generationHistoryAssets",
    );
    expect(historyAssetTestSource).toContain(
      "@/features/canvas/domain/generationHistoryRecord",
    );
  });

  it("keeps Canvas drag lifecycle orchestration in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasDragLifecycleController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const graphInteractionPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasGraphInteractionController.ts",
    );
    const graphInteractionSource = readFileSync(
      graphInteractionPath,
      "utf8",
    );
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const graphInteractionForbiddenImports = importSpecifiers(
      graphInteractionPath,
    ).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasDragLifecycleController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const graphInteractionDeclaration = [
      "export function",
      "useCanvasGraphInteractionController(",
    ].join(" ");
    const graphInteractionOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(graphInteractionDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(graphInteractionForbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasDragLifecycleController.ts",
    ]);
    expect(graphInteractionOwners).toEqual([
      "features/canvas/hooks/useCanvasGraphInteractionController.ts",
    ]);
    expect(controllerSource).toContain("beginGroupFitNodeDrag(");
    expect(controllerSource).toContain("beginLinkedCaptureDrag(");
    expect(controllerSource).toContain("beginAltDragCopy(");
    expect(controllerSource).toContain("finishLinkedCaptureDrag();");
    expect(controllerSource).toContain("finishGroupFitDrag();");
    expect(controllerSource).toContain("finishAltDragCopy(node.id, node.position)");
    expect(graphInteractionSource).toContain(
      "./useCanvasAltDragCopyController",
    );
    expect(graphInteractionSource).toContain(
      "./useCanvasGroupFitDragController",
    );
    expect(graphInteractionSource).toContain(
      "./useCanvasLinkedCaptureDragController",
    );
    expect(graphInteractionSource).toContain(
      "./useCanvasGraphChangeController",
    );
    expect(graphInteractionSource).toContain(
      "./useCanvasDragLifecycleController",
    );
    expect(graphInteractionSource).toContain("type: 'position' as const");
    expect(graphInteractionSource).toContain(
      "isCopyDragActive: altDragCopy.isCopyDragActive",
    );
    expect(canvasSource).toContain(
      "./hooks/useCanvasGraphEditingSurfaceController",
    );
    expect(canvasSource).not.toContain(
      "./hooks/useCanvasGraphInteractionController",
    );
    expect(canvasSource).not.toContain("./hooks/useCanvasDragLifecycleController");
    expect(canvasSource).not.toContain("commitDragNodePositions");
    expect(canvasSource).not.toContain("const handleNodeDragStart = useCallback");
    expect(canvasSource).not.toContain("const handleNodeDrag = useCallback");
    expect(canvasSource).not.toContain("const handleNodeDragStop = useCallback");
    expect(canvasSource).not.toContain("const handleSelectionDragStart = useCallback");
  });

  it("keeps Canvas node-creation assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeCreationSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasNodeCreationSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const childControllers = [
      "./useCanvasNodeMenuStateController",
      "./useCanvasNodeCatalogController",
      "./useCanvasConnectionController",
      "./useCanvasNodeInteractionController",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeCreationSurfaceController.ts",
    ]);
    for (const childController of childControllers) {
      expect(controllerSource).toContain(childController);
      expect(canvasSource).not.toContain(
        childController.replace("./", "./hooks/"),
      );
    }
    expect(controllerSource).toContain("skillById: nodeCatalog.skillById");
    expect(controllerSource).toContain(
      "bindSkill: connection.bindSingleBeatContextInput",
    );
    expect(controllerSource).toContain(
      "connectSpawnedNode: connection.connectSpawnedNode",
    );
    expect(canvasSource).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasSource).not.toContain("skillById");
    expect(canvasSource).not.toContain("resolvePlacementLabel");
    expect(canvasSource).not.toContain("bindSingleBeatContextInput");
    expect(canvasSource).not.toContain("connectSpawnedNode");
  });

  it("keeps Canvas node-menu state in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeMenuStateController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasNodeMenuStateController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeMenuStateController.ts",
    ]);
    expect(controllerSource).toContain("createPreviewPath(preview.line)");
    expect(controllerSource).toContain(
      "handleMarqueeStart: resetActiveConnectionMenu",
    );
    expect(controllerSource).toContain(
      "prepareBatchConnectionDrag: resetActiveConnectionMenu",
    );
    expect(controllerSource).toContain(
      "dismissNodeMenuForPaneClick: resetActiveConnectionMenu",
    );
    expect(canvasSource).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasSource).not.toContain(
      "./hooks/useCanvasNodeMenuStateController",
    );
    expect(canvasSource).not.toContain("useState(");
    expect(canvasSource).not.toContain("setShowNodeMenu(");
    expect(canvasSource).not.toContain("setMenuAllowedTypes(");
    expect(canvasSource).not.toContain("setPendingConnectStart(");
    expect(canvasSource).not.toContain("setPendingBatchConnectIds(");
    expect(canvasSource).not.toContain("setPreviewConnectionVisual(");
  });

  it("keeps Canvas pane-click orchestration in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasPaneClickController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const nodeInteractionPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeInteractionController.ts",
    );
    const nodeInteractionSource = readFileSync(nodeInteractionPath, "utf8");
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const nodeInteractionForbiddenImports = importSpecifiers(
      nodeInteractionPath,
    ).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        /^(?:\.\.\/)+application(?:\/|$)/.test(specifier) ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        /^(?:\.\.\/)+infrastructure(?:\/|$)/.test(specifier) ||
        specifier === "@/features/canvas/composition" ||
        specifier === "@/features/canvas/nodeFactoryComposition",
    );
    const declaration = [
      "export function",
      "useCanvasPaneClickController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const nodeInteractionDeclaration = [
      "export function",
      "useCanvasNodeInteractionController(",
    ].join(" ");
    const nodeInteractionOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(nodeInteractionDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(nodeInteractionForbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasPaneClickController.ts",
    ]);
    expect(nodeInteractionOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeInteractionController.ts",
    ]);
    expect(controllerSource).toContain("paneClickSuppressedRef");
    expect(controllerSource).toContain("event.detail >= 2");
    expect(controllerSource).toContain("commitPlacement({");
    expect(nodeInteractionSource).toContain(
      "./useCanvasNodePlacementController",
    );
    expect(nodeInteractionSource).toContain("./useCanvasPaneClickController");
    expect(nodeInteractionSource).toContain("./useCanvasNodeMenuShortcut");
    expect(nodeInteractionSource).toContain("./useCanvasNodeClickController");
    expect(nodeInteractionSource).toContain(
      "./useCanvasNodeMenuSelectionController",
    );
    expect(nodeInteractionSource).toContain("./useCanvasQuickAddController");
    expect(nodeInteractionSource).toContain(
      "flowPosition: screenToFlowPosition(clientPosition)",
    );
    expect(nodeInteractionSource).toContain("selectNode(null)");
    expect(canvasSource).toContain(
      "./hooks/useCanvasNodeCreationSurfaceController",
    );
    expect(canvasSource).not.toContain(
      "./hooks/useCanvasNodeInteractionController",
    );
    expect(canvasSource).not.toContain("./hooks/useCanvasPaneClickController");
    expect(canvasSource).not.toContain(
      "openNodeMenuAtClientPosition = useCallback",
    );
    expect(canvasSource).not.toContain("suppressNextPaneClickRef");
    expect(canvasSource).not.toContain("event.detail >= 2");
    expect(canvasSource).not.toContain("const handlePaneClick = useCallback");
  });

  it("keeps Canvas context-menu commands in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasContextMenuController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const commandSurfacePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasCommandSurfaceController.ts",
    );
    const commandSurface = readFileSync(commandSurfacePath, "utf8");
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasContextMenuController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const commandSurfaceDeclaration = [
      "export function",
      "useCanvasCommandSurfaceController(",
    ].join(" ");
    const commandSurfaceOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(commandSurfaceDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasContextMenuController.ts",
    ]);
    expect(commandSurfaceOwners).toEqual([
      "features/canvas/hooks/useCanvasCommandSurfaceController.ts",
    ]);
    expect(controllerSource).toContain("useCanvasPaneContextMenu({");
    expect(controllerSource).toContain("label: '上传'");
    expect(controllerSource).toContain("screenToFlowPosition(clientPosition)");
    expect(commandSurface).toContain("getContextMenuCapabilities");
    expect(commandSurface).toContain("CANVAS_NODE_TYPES.upload");
    expect(canvasSource).toContain("sections: contextMenuSections");
    expect(canvasSource).not.toContain("getContextMenuCapabilities");
    expect(canvasSource).not.toContain("createContextMenuUploadNode");
    expect(canvasSource).not.toContain("contextMenu.clientX");
    expect(canvasSource).not.toContain("label: '上传'");
  });

  it("keeps Canvas render assembly in one presentation controller", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasRenderSurfaceController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(controllerPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "useCanvasRenderSurfaceController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const internalDependencies = [
      "../ui/edgeVisibilityStore",
      "../ui/canvasRenderProjection",
      "./useCanvasNodePlacementConfirm",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasRenderSurfaceController.ts",
    ]);
    for (const dependency of internalDependencies) {
      expect(controllerSource).toContain(dependency);
    }
    expect(canvasSource).toContain("./hooks/useCanvasRenderSurfaceController");
    expect(canvasSource).not.toContain("./ui/edgeVisibilityStore");
    expect(canvasSource).not.toContain("./ui/canvasRenderProjection");
    expect(canvasSource).not.toContain("./hooks/useCanvasNodePlacementConfirm");
    expect(canvasSource).not.toContain("placementConfirmNodeId");
    expect(canvasSource).not.toContain("edgesHidden");
  });

  it("keeps Canvas render projection in one pure presentation model", () => {
    const projectionPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/canvasRenderProjection.ts",
    );
    const projectionSource = readFileSync(projectionPath, "utf8");
    const renderController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasRenderSurfaceController.ts",
      ),
      "utf8",
    );
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(projectionPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const nodeProjectionDeclaration = [
      "export function",
      "projectCanvasNodesForRender(",
    ].join(" ");
    const edgeProjectionDeclaration = [
      "export function",
      "projectCanvasEdgesForRender(",
    ].join(" ");
    const nodeProjectionOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(
        nodeProjectionDeclaration,
      ))
      .map(relativeSource)
      .sort();
    const edgeProjectionOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(
        edgeProjectionDeclaration,
      ))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(nodeProjectionOwners).toEqual([
      "features/canvas/ui/canvasRenderProjection.ts",
    ]);
    expect(edgeProjectionOwners).toEqual([
      "features/canvas/ui/canvasRenderProjection.ts",
    ]);
    expect(projectionSource).toContain("PLACEMENT_CONFIRM_CLASS_NAME");
    expect(projectionSource).toContain("edge.hidden ? edge");
    expect(renderController).toContain("projectCanvasNodesForRender(");
    expect(renderController).toContain("projectCanvasEdgesForRender(");
    expect(canvasSource).toContain("./hooks/useCanvasRenderSurfaceController");
    expect(canvasSource).not.toContain("projectCanvasNodesForRender(");
    expect(canvasSource).not.toContain("projectCanvasEdgesForRender(");
    expect(canvasSource).not.toContain("canvas-node-placement-confirm");
    expect(canvasSource).not.toContain("edge.hidden ? edge");
  });

  it("keeps Canvas stage and transient overlay markup in presentation views", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/CanvasTransientOverlays.tsx",
    );
    const stagePath = resolve(
      SRC_ROOT,
      "features/canvas/ui/CanvasStageView.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const stageSource = readFileSync(stagePath, "utf8");
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const stageForbiddenImports = importSpecifiers(stagePath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const stageDeclaration = [
      "export function",
      "CanvasStageView(",
    ].join(" ");
    const overlaysDeclaration = [
      "export function",
      "CanvasTransientOverlays(",
    ].join(" ");
    const connectionPreviewDeclaration = [
      "export function",
      "CanvasConnectionPreviewOverlay(",
    ].join(" ");
    const overlaysOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(
        overlaysDeclaration,
      ))
      .map(relativeSource)
      .sort();
    const connectionPreviewOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(
        connectionPreviewDeclaration,
      ))
      .map(relativeSource)
      .sort();
    const stageOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(
        stageDeclaration,
      ))
      .map(relativeSource)
      .sort();
    const connectionRadiusDeclaration = [
      "const CONNECTION_SNAP_RADIUS",
      "= 160;",
    ].join(" ");
    const connectionRadiusOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(
        connectionRadiusDeclaration,
      ))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(stageForbiddenImports).toEqual([]);
    expect(stageOwners).toEqual([
      "features/canvas/ui/CanvasStageView.tsx",
    ]);
    expect(connectionRadiusOwners).toEqual([
      "features/canvas/ui/CanvasStageView.tsx",
    ]);
    expect(overlaysOwners).toEqual([
      "features/canvas/ui/CanvasTransientOverlays.tsx",
    ]);
    expect(connectionPreviewOwners).toEqual([
      "features/canvas/ui/CanvasTransientOverlays.tsx",
    ]);
    expect(viewSource).toContain("z-[130]");
    expect(viewSource).toContain("z-[135]");
    expect(viewSource).toContain("z-[120]");
    expect(viewSource).toContain("absolute z-40 overflow-visible");
    expect(stageSource).toContain("@xyflow/react/dist/style.css");
    expect(stageSource).toContain("<ReactFlow<CanvasNode, CanvasEdge>");
    expect(stageSource).toContain("nodeTypes={canvasNodeTypes}");
    expect(stageSource).toContain("edgeTypes={canvasEdgeTypes}");
    expect(stageSource).toContain("<CanvasTransientOverlays");
    expect(stageSource).toContain("<CanvasConnectionPreviewOverlay");
    expect(stageSource.indexOf("<CanvasQuickActionBar")).toBeLessThan(
      stageSource.indexOf("<CanvasConnectionPreviewOverlay"),
    );
    expect(canvasSource).toContain("<CanvasStageView");
    expect(canvasSource).not.toContain("<ReactFlow");
    expect(canvasSource).not.toContain("<CanvasTransientOverlays");
    expect(canvasSource).not.toContain("<CanvasConnectionPreviewOverlay");
    expect(canvasSource).not.toContain("@xyflow/react/dist/style.css");
    expect(canvasSource).not.toContain("CONNECTION_SNAP_RADIUS");
    expect(canvasSource).not.toContain("const emptyHint = useMemo");
    expect(canvasSource).not.toContain("释放以添加到画布");
  });

  it("keeps Canvas node layering in one domain rule and Store command", () => {
    const layeringPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasNodeLayering.ts",
    );
    const layeringSource = readFileSync(layeringPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const nodeMutationSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
      ),
      "utf8",
    );
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const altDragController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasAltDragCopyController.ts",
      ),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(layeringPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "elevateCanvasNodes(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/domain/canvasNodeLayering.ts",
    ]);
    expect(layeringSource).toContain("style: { ...(node.style ?? {}), zIndex }");
    expect(nodeMutationSlice).toContain(
      "elevateCanvasNodes(state.nodes, nodeIds, zIndex)",
    );
    expect(canvasStore).not.toContain("elevateCanvasNodes(");
    expect(altDragController).toContain(
      "elevateNodes(copiedNodeIds, ALT_DRAG_COPY_Z_INDEX)",
    );
    expect(canvasSource).toContain("state.elevateNodes");
    expect(canvasSource).not.toContain("useCanvasStore.setState");
    expect(canvasSource).not.toContain("const nodeIdSet = new Set(nodeIds)");
  });

  it("keeps Canvas system clipboard access in one browser adapter", () => {
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserClipboardGateway.ts",
    );
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/composition.ts"),
      "utf8",
    );
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const clipboardController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasNodeClipboard.ts",
      ),
      "utf8",
    );
    const canvasClipboardController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasClipboardController.ts",
      ),
      "utf8",
    );
    const declaration = [
      "export function",
      "clearBrowserClipboard(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(implementationOwners).toEqual([
      "features/canvas/infrastructure/browserClipboardGateway.ts",
    ]);
    expect(adapterSource).toContain("runtime?.clipboard?.writeText('')");
    expect(compositionSource).toContain("export { clearBrowserClipboard };");
    expect(canvasClipboardController).toContain(
      "clearSystemClipboard: clearBrowserClipboard",
    );
    expect(canvasSource).not.toContain("clearSystemClipboard: clearBrowserClipboard");
    expect(canvasSource).not.toContain("navigator.clipboard");
    expect(clipboardController).toContain(
      "void clearSystemClipboard().catch(() => undefined)",
    );
  });

  it("keeps Canvas media transfer events in one shared adapter", () => {
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasMediaTransferController.ts",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const externalFilePublishCount = (
      controllerSource.match(
        /eventBus\.publish\('upload-node\/external-file'/g,
      ) ?? []
    ).length;
    const declaration = [
      "export function",
      "useCanvasMediaTransferController(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(externalFilePublishCount).toBe(1);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasMediaTransferController.ts",
    ]);
    expect(controllerSource).toContain("const mediaTransferEventPort = useMemo");
    expect(controllerSource).toContain("eventPort: mediaTransferEventPort");
    expect(controllerSource).toContain(
      "attachExternalFile: mediaTransferEventPort.attachExternalFile",
    );
    expect(canvasSource).not.toContain("const mediaTransferEventPort");
    expect(canvasSource).not.toContain("const attachDroppedExternalFile");
  });

  it("keeps Canvas client-to-Flow conversion in one adapter", () => {
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const directConversionCount = (
      canvasSource.match(/reactFlowInstance\.screenToFlowPosition\(/g) ?? []
    ).length;

    expect(directConversionCount).toBe(1);
    expect(canvasSource).toContain("const screenToFlowPosition = useCallback");
    const transferController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasMediaTransferController.ts",
      ),
      "utf8",
    );
    expect(transferController).toContain(
      "screenToCanvasPosition: screenToFlowPosition",
    );
    expect(canvasSource).not.toContain("const screenToCanvasPosition");
  });

  it("keeps Canvas transferred Upload-node creation in one adapter", () => {
    const canvasSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const transferController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasMediaTransferController.ts",
      ),
      "utf8",
    );
    const transferredMarkerCount = (
      transferController.match(/\{ user_spawned: true \}/g) ?? []
    ).length;

    expect(transferredMarkerCount).toBe(1);
    expect(transferController).toContain(
      "const createTransferredUploadNode = useCallback",
    );
    expect(
      transferController.match(
        /createUploadNode: createTransferredUploadNode/g,
      ),
    ).toHaveLength(2);
    expect(canvasSource).not.toContain("createTransferredUploadNode");
    expect(canvasSource).not.toContain("createPastedUploadNode");
    expect(canvasSource).not.toContain("createDroppedUploadNode");
  });

  it("keeps Canvas viewport infrastructure in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasViewportSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const implementations = [
      ["setViewportState", "(viewport) {"],
      ["setViewportBookmark", "(index, bookmark) {"],
      ["clearViewportBookmarks", "() {"],
      ["hydrateViewportBookmarks", "(list) {"],
      ["setCanvasViewportSize", "(size) {"],
      ["openImageViewer", "(imageUrl, imageList = []) {"],
      ["closeImageViewer", "() {"],
      ["navigateImageViewer", "(direction) {"],
      ["findNodePosition", "(sourceNodeId, newNodeWidth, newNodeHeight) {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasViewportSlice.ts",
      ]);
    }

    expect(importSpecifiers(slicePath)).toEqual([
      "@xyflow/react",
      "../application/canvasImageViewer",
      "../domain/canvasGeometry",
      "../domain/canvasNodes",
      "../domain/viewportBookmarks",
    ]);
    expect(canvasStore).toMatch(
      /interface CanvasState[\s\S]*?CanvasViewportSlice/,
    );
    expect(canvasStore).toContain("...createZustandCanvasViewportSlice({");
    expect(canvasStore).not.toContain("currentViewport: { x: 0, y: 0, zoom: 1 }");
    expect(canvasStore).not.toContain("viewportBookmarks: createEmptyBookmarks()");
    expect(canvasStore).not.toContain("imageViewer: createClosedCanvasImageViewer()");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas transient interaction state in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasTransientInteractionSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["setActiveOverlayNodeId", "(nodeId) {"],
      ["setHoveredNodeId", "(nodeId) {"],
      ["requestFocusNode", "(nodeId) {"],
      ["clearPendingFocus", "() {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasTransientInteractionSlice.ts",
      ]);
    }

    expect(importSpecifiers(slicePath)).toEqual([]);
    expect(canvasStateHeader).toContain("CanvasTransientInteractionSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasTransientInteractionSlice({",
    );
    expect(canvasStore).not.toContain("activeOverlayNodeId: null");
    expect(canvasStore).not.toContain("hoveredNodeId: null");
    expect(canvasStore).not.toContain("pendingFocusNodeId: null");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas history state and commands in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasHistorySlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["undo", ": () => commitNavigation('undo')"],
      ["redo", ": () => commitNavigation('redo')"],
      ["restoreHistory", "(history) {"],
    ].map(([name, suffix]) => `${name}${suffix}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasHistorySlice.ts",
      ]);
    }

    expect(new Set(importSpecifiers(slicePath))).toEqual(new Set([
      "../domain/canvasHistory",
      "../application/canvasDataNormalization",
      "../application/canvasHistoryNavigation",
      "../application/ports",
    ]));
    expect(canvasStateHeader).toContain("CanvasHistorySlice");
    expect(canvasStore).toContain("...createZustandCanvasHistorySlice({");
    expect(canvasStore).not.toContain("history: { past: [], future: [] }");
    expect(canvasStore).not.toContain("navigateCanvasHistory(state");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas graph mutations in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasGraphMutationSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const graphGateway = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGraphGateway.ts",
      ),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["onNodesChange", "(changes) {"],
      ["onEdgesChange", "(changes) {"],
      ["onConnect", "(connection) {"],
      ["replaceEdges", "(edges) {"],
      ["addEdge", "(source, target) {"],
      ["addEdgeWithData", "(source, target, data, options) {"],
      ["deleteEdge", "(edgeId) {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual(
        implementation.startsWith("addEdgeWithData")
          ? [
              "features/canvas/infrastructure/zustandCanvasGraphGateway.ts",
              "features/canvas/infrastructure/zustandCanvasGraphMutationSlice.ts",
            ]
          : [
              "features/canvas/infrastructure/zustandCanvasGraphMutationSlice.ts",
            ],
      );
    }

    expect(new Set(importSpecifiers(slicePath))).toEqual(new Set([
      "@xyflow/react",
      "../domain/canvasHistory",
      "../domain/canvasEdgeDeletion",
      "../domain/canvasEdgeNormalization",
      "../domain/canvasMutation",
      "../domain/canvasNodes",
      "../application/canvasEdgeChangeEffects",
      "../application/canvasEdgeCreation",
      "../application/canvasNodeChangeEffects",
    ]));
    expect(canvasStateHeader).toContain("CanvasGraphMutationSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasGraphMutationSlice({",
    );
    expect(canvasStore).not.toContain("@xyflow/react");
    expect(canvasStore).not.toContain("applyNodeChanges<CanvasNode>");
    expect(canvasStore).not.toContain("applyEdgeChanges<CanvasEdge>");
    expect(canvasStore).not.toContain("prepareCanvasReactFlowConnection(");
    expect(graphGateway).toContain(
      ".addEdgeWithData(source, target, data, options)",
    );
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas document lifecycle in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasDocumentLifecycleSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["setCanvasData", "(nodes, edges, history) {"],
      ["applyCanvasDataEdit", "(nodes, edges) {"],
      ["hydrateCanvasDraft", "(draft) {"],
      ["clearCanvas", "() {"],
      ["acknowledgePendingClear", "() {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasDocumentLifecycleSlice.ts",
      ]);
    }

    expect(new Set(importSpecifiers(slicePath))).toEqual(new Set([
      "../domain/canvasHistory",
      "../domain/canvasMutation",
      "../domain/canvasNodes",
      "../application/canvasDataNormalization",
      "../application/ports",
    ]));
    expect(canvasStateHeader).toContain("CanvasDocumentLifecycleSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasDocumentLifecycleSlice({",
    );
    expect(canvasStore).not.toContain("userEditsSinceHydrate: 0");
    expect(canvasStore).not.toContain("pendingClearIntent: false");
    expect(canvasStore).not.toContain("normalizeCanvasData(");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas node mutations in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const graphGateway = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasGraphGateway.ts",
      ),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["addNode", "(type, position, data = {}) {"],
      ["convertNodeType", "(nodeId, newType, dataOverrides = {}) {"],
      ["updateNodeData", "(nodeId, data) {"],
      ["updateNodeSize", "(nodeId, size, options) {"],
      ["updateNodePosition", "(nodeId, position) {"],
      ["setNodePositions", "(positions) {"],
      ["elevateNodes", "(nodeIds, zIndex) {"],
      ["updateStoryboardFrame", "(nodeId, frameId, data) {"],
      ["reorderStoryboardFrame", "(nodeId, draggedFrameId, targetFrameId) {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual(
        implementation.startsWith("updateNodeData")
          ? [
              "features/canvas/infrastructure/zustandCanvasGraphGateway.ts",
              "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
            ]
          : [
              "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
            ],
      );
    }

    expect(new Set(importSpecifiers(slicePath))).toEqual(new Set([
      "../domain/canvasHistory",
      "../domain/canvasNodeLayering",
      "../domain/canvasNodePositions",
      "../domain/canvasMutation",
      "../domain/canvasNodes",
      "../domain/storyboardFrames",
      "../application/canvasNodeConversion",
      "../application/canvasNodeCreation",
      "../application/canvasNodeData",
      "../application/canvasNodeSize",
      "../application/ports",
    ]));
    expect(canvasStateHeader).toContain("CanvasNodeMutationSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasNodeMutationSlice({",
    );
    expect(canvasStore).toContain("nodeFactory: canvasNodeFactory");
    expect(graphGateway).toContain(
      "useCanvasStore.getState().updateNodeData(nodeId, data)",
    );
    expect(sliceSource).not.toContain("nodeFactoryComposition");
    expect(sliceSource).not.toContain("@/features/canvas/composition");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas derived node creation in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      /addDerivedUploadNode\(sourceNodeId, imageUrl, aspectRatio, previewImageUrl\) \{/,
      /addDerivedExportNode\(\s+sourceNodeId,\s+imageUrl,\s+aspectRatio,\s+previewImageUrl,\s+options,\s+\) \{/,
      /addStoryboardSplitNode\(\s+sourceNodeId,\s+rows,\s+cols,\s+frames,\s+frameAspectRatio,\s+\) \{/,
      /duplicateNodeAsSibling\(sourceNodeId, index, dataOverrides = \{\}\) \{/,
      /duplicateNodesAsSiblings\(nodeIds\) \{/,
      /addPanoCaptureGroup\(sourceNodeId, captures, options\) \{/,
    ];

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => implementation.test(readFileSync(path, "utf8")))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice.ts",
      ]);
    }

    expect(new Set(importSpecifiers(slicePath))).toEqual(new Set([
      "@xyflow/react",
      "../domain/canvasHistory",
      "../domain/canvasMutation",
      "../domain/canvasNodes",
      "../application/canvasDerivedNodeCreation",
      "../application/canvasNodeDuplication",
      "../application/panoCaptureNodes",
      "../application/ports",
    ]));
    expect(canvasStateHeader).toContain("CanvasDerivedNodeCreationSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasDerivedNodeCreationSlice({",
    );
    expect(canvasStore).toContain("nodeFactory: canvasNodeFactory");
    expect(sliceSource).not.toContain("nodeFactoryComposition");
    expect(sliceSource).not.toContain("@/features/canvas/composition");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas node deletion in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasNodeDeletionSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["deleteNode", "(nodeId) {"],
      ["deleteNodes", "(nodeIds) {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasNodeDeletionSlice.ts",
      ]);
    }

    expect(new Set(importSpecifiers(slicePath))).toEqual(new Set([
      "../domain/canvasHistory",
      "../domain/canvasMutation",
      "../domain/canvasNodes",
      "../domain/groupSelectionDelete",
    ]));
    expect(canvasStateHeader).toContain("CanvasNodeDeletionSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasNodeDeletionSlice({",
    );
    expect(canvasStore).not.toContain("deleteCanvasNodes(");
    expect(sliceSource).not.toContain("@/features/canvas/composition");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas group lifecycle in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasGroupLifecycleSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["groupNodes", "(nodeIds, options) {"],
      ["autoGroupSpawn", "(sourceNodeId, spawnedNodeIds, options) {"],
      ["fitGroupToChildren", "(groupNodeId) {"],
      ["arrangeGroupChildren", "(groupNodeId, mode) {"],
      ["ungroupNode", "(groupNodeId) {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasGroupLifecycleSlice.ts",
      ]);
    }

    expect(new Set(importSpecifiers(slicePath))).toEqual(new Set([
      "../domain/canvasAutoGrouping",
      "../domain/canvasGroupArrangement",
      "../domain/canvasGroupFit",
      "../domain/canvasGroupRemoval",
      "../domain/canvasHistory",
      "../domain/canvasMutation",
      "../domain/canvasNodes",
      "../application/canvasGroupCreation",
      "../application/ports",
    ]));
    expect(canvasStateHeader).toContain("CanvasGroupLifecycleSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasGroupLifecycleSlice({",
    );
    expect(canvasStore).toContain("nodeFactory: canvasNodeFactory");
    expect(sliceSource).not.toContain("nodeFactoryComposition");
    expect(sliceSource).not.toContain("@/features/canvas/composition");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas storyboard group mutations in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasStoryboardGroupSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["mergeStoryboardGroup", "(nodeIds) {"],
      ["setStoryboardGroupConfig", "(groupNodeId, config) {"],
      ["reorderStoryboardMember", "(groupNodeId, fromIndex, toIndex) {"],
      ["addStoryboardMembers", "(groupNodeId, images) {"],
      ["convertStoryboardGroupToPlain", "(groupNodeId) {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasStoryboardGroupSlice.ts",
      ]);
    }

    expect(new Set(importSpecifiers(slicePath))).toEqual(new Set([
      "../domain/canvasHistory",
      "../domain/canvasMutation",
      "../domain/canvasNodes",
      "../domain/canvasStoryboardGroupConfig",
      "../domain/canvasStoryboardGroupConversion",
      "../domain/canvasStoryboardGroupMembers",
      "../application/canvasStoryboardGroupCreation",
      "../application/canvasStoryboardGroupMemberAddition",
      "../application/ports",
    ]));
    expect(canvasStateHeader).toContain("CanvasStoryboardGroupSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasStoryboardGroupSlice({",
    );
    expect(canvasStore).toContain("nodeFactory: canvasNodeFactory");
    expect(sliceSource).not.toContain("nodeFactoryComposition");
    expect(sliceSource).not.toContain("@/features/canvas/composition");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps Canvas selection state in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasSelectionSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const canvasStateHeader = canvasStore.match(
      /interface CanvasState[\s\S]*?\{/,
    )?.[0];
    const implementations = [
      ["setSelectedNode", "(nodeId) {"],
      ["openToolDialog", "(dialog) {"],
      ["closeToolDialog", "() {"],
    ].map(([name, parameters]) => `${name}${parameters}`);

    for (const implementation of implementations) {
      const owners = sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(implementation))
        .map(relativeSource)
        .sort();
      expect(owners).toEqual([
        "features/canvas/infrastructure/zustandCanvasSelectionSlice.ts",
      ]);
    }

    expect(importSpecifiers(slicePath)).toEqual([
      "../domain/canvasNodes",
    ]);
    expect(canvasStateHeader).toContain("CanvasSelectionSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasSelectionSlice({",
    );
    expect(canvasStore).not.toContain("selectedNodeId: null");
    expect(canvasStore).not.toContain("activeToolDialog: null");
    expect(sliceSource).not.toContain("@/features/canvas/composition");
    expect(sliceSource).not.toContain("@/features/canvas/canvasStore");
  });

  it("keeps VideoNode subtitle-erase controls in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoSubtitleEraseControls.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      "SubtitleEraseBoxOverlay(",
      "SubtitleEraseOpsPanel(",
    ].map((name) => ["export function", name].join(" "));
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      ["features/canvas/nodes/VideoSubtitleEraseControls.tsx"],
      ["features/canvas/nodes/VideoSubtitleEraseControls.tsx"],
    ]);
    expect(viewSource).toContain("new ResizeObserver(");
    expect(viewSource).toContain("setPointerCapture(event.pointerId)");
    expect(viewSource).toContain("width < 0.01 || height < 0.01");
    expect(viewSource).toContain(
      'mode === "box" && !hasBox',
    );
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoSubtitleEraseControls",
    );
    expect(videoNode).toContain("<SubtitleEraseBoxOverlay");
    expect(videoNode).toContain("<SubtitleEraseOpsPanel");
    expect(videoNode).not.toContain("interface DisplayedRect");
    expect(videoNode).not.toContain("new ResizeObserver(");
    expect(videoNode).not.toContain("setPointerCapture(event.pointerId)");
    expect(videoNode).not.toContain("interface SubtitleEraseOpsPanelProps");
  });

  it("keeps VideoNode player controls in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoPlayerControls.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "VideoPlayerControls(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/VideoPlayerControls.tsx",
    ]);
    expect(viewSource).toContain('videoEl.addEventListener("play"');
    expect(viewSource).toContain('videoEl.addEventListener("timeupdate"');
    expect(viewSource).toContain('videoEl.addEventListener("volumechange"');
    expect(viewSource).toContain("videoEl.currentTime = next");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoPlayerControls",
    );
    expect(videoNode).toContain("<VideoPlayerControls");
    expect(videoNode).not.toContain("interface VideoPlayerControlsProps");
    expect(videoNode).not.toContain('videoEl.addEventListener("play"');
    expect(videoNode).not.toContain("function formatTime(");
  });

  it("keeps VideoNode reference media in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoReferenceMedia.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const videoNodeController = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      ["export function", "ReferenceMediaRow("].join(" "),
      ["function", "useHoverPreviewPos("].join(" "),
      ["function", "ReferenceImageChip("].join(" "),
      ["function", "ReferenceVideoChip("].join(" "),
      ["function", "ReferenceAudioChip("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/nodes/VideoReferenceMedia.tsx",
      ]),
    );
    expect(viewSource).toContain(
      'event.dataTransfer.setData("text/plain", item.nodeId)',
    );
    expect(viewSource).toContain("new Audio()");
    expect(viewSource).toContain("createPortal(");
    expect(viewSource).not.toContain("REFERENCE_CAPS_BY_MODE");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoReferenceMedia",
    );
    expect(videoNode).toContain("<ReferenceMediaRow");
    expect(videoNodeController).toContain(
      "@/features/canvas/domain/videoReferenceLimits",
    );
    expect(videoNode).toContain(
      "caps={referenceMediaCaps}",
    );
    expect(videoNode).not.toContain("const REFERENCE_CAPS_BY_MODE");
    expect(videoNode).not.toContain("interface ReferenceMediaRowProps");
    expect(videoNode).not.toContain(declarations[1]);
    expect(videoNode).not.toContain(declarations[2]);
    expect(videoNode).not.toContain(declarations[3]);
    expect(videoNode).not.toContain(declarations[4]);
  });

  it("keeps video reference limits in one pure domain module", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoReferenceLimits.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const referenceView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoReferenceMedia.tsx"),
      "utf8",
    );
    const declarations = [
      ["export function", "videoReferenceCapsForMode("].join(" "),
      ["export function", "classifyVideoReferenceItems("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(domainPath)).toEqual(["./canvasNodes"]);
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("window");
    expect(domainSource).not.toContain("@/api/");
    expect(domainSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/domain/videoReferenceLimits.ts",
      ]),
    );
    expect(domainSource).toContain(
      "allReference: { image: 9, video: 3, audio: 3 }",
    );
    expect(domainSource).toContain(
      "firstLastFrame: { image: 2, video: 0, audio: 0 }",
    );
    expect(videoNode).toContain(
      "@/features/canvas/domain/videoReferenceLimits",
    );
    expect(referenceView).toContain(
      "@/features/canvas/domain/videoReferenceLimits",
    );
    expect(videoNode).not.toContain("const REFERENCE_CAPS_BY_MODE");
  });

  it("keeps VideoNode empty and upload states in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoNodeEmptyState.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      ["export function", "VideoUploadActionRail("].join(" "),
      ["export function", "VideoNodeEmptyState("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/nodes/VideoNodeEmptyState.tsx",
      ]),
    );
    expect(viewSource).toContain("<NodeSideActionRail");
    expect(viewSource).toContain("首尾帧生成视频");
    expect(viewSource).toContain("hasUpstreamVideo");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoNodeEmptyState",
    );
    expect(videoNode).toContain("<VideoUploadActionRail");
    expect(videoNode).toContain("<VideoNodeEmptyState");
    expect(videoNode).not.toContain("<NodeSideActionRail");
    expect(videoNode).not.toContain("<span>首尾帧生成视频</span>");
    expect(videoNode).not.toContain("<Layers");
    expect(videoNode).not.toContain("<Sparkles");
  });

  it("keeps VideoNode media status views in one presentation module", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoNodeMediaStatus.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      ["export function", "VideoUploadingState("].join(" "),
      ["export function", "VideoGenerationHistoryPreview("].join(" "),
      ["export function", "VideoGeneratingState("].join(" "),
      ["export function", "VideoGenerationErrorState("].join(" "),
      ["export function", "VideoLoadErrorOverlay("].join(" "),
      ["export function", "VideoMetadataLoadingOverlay("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/nodes/VideoNodeMediaStatus.tsx",
      ]),
    );
    expect(viewSource).toContain("<NodeGenerationOverlay");
    expect(viewSource).toContain("<RegenerateButton");
    expect(viewSource).toContain("新视频生成中…");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoNodeMediaStatus",
    );
    for (const declaration of declarations) {
      const componentName = declaration.slice(
        declaration.lastIndexOf(" ") + 1,
        -1,
      );
      expect(videoNode).toContain(`<${componentName}`);
    }
    expect(videoNode).not.toContain("<NodeGenerationOverlay");
    expect(videoNode).not.toContain("<RegenerateButton");
    expect(videoNode).not.toContain("新视频生成中…");
  });

  it("keeps video metadata persistence projection in one application module", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/videoMetadataPatch.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const declaration = [
      "export function",
      "buildVideoMetadataPatch(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual([
      "../domain/canvasNodes",
    ]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("window");
    expect(applicationSource).not.toContain("document");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual([
      "features/canvas/application/videoMetadataPatch.ts",
    ]);
    expect(applicationSource).not.toContain("aspectRatio");
    expect(videoNode).toContain(
      "@/features/canvas/application/videoMetadataPatch",
    );
    expect(videoNode).toContain("buildVideoMetadataPatch(");
    expect(videoNode).not.toContain(
      "if (data.widthPx !== el.videoWidth)",
    );
  });

  it("keeps VideoNode primary video element in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoNodePrimaryVideo.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const videoNodeController = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "VideoNodePrimaryVideo(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/VideoNodePrimaryVideo.tsx",
    ]);
    expect(viewSource).toContain("<video");
    expect(viewSource).toContain("Math.round(element.duration * 1000)");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoNodePrimaryVideo",
    );
    expect(videoNode).toContain("<VideoNodePrimaryVideo");
    expect(videoNodeController).toContain("buildVideoMetadataPatch(");
    expect(videoNode).not.toContain("<video");
    expect(videoNode).not.toContain("onLoadedMetadata={(event)");
  });

  it("keeps VideoNode generation history panel in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoNodeGenerationHistoryPanel.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "VideoNodeGenerationHistoryPanel(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/VideoNodeGenerationHistoryPanel.tsx",
    ]);
    expect(viewSource).toContain("<NodeGenerationHistory");
    expect(viewSource).toContain("hasCompletedHistoryRecords(records)");
    expect(viewSource).toContain("historyRecordOutputUrl(record)");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoNodeGenerationHistoryPanel",
    );
    expect(videoNode).toContain("<VideoNodeGenerationHistoryPanel");
    expect(videoNode).not.toContain("<NodeGenerationHistory");
    expect(videoNode).not.toContain("hasCompletedHistoryRecords(");
    expect(videoNode).not.toContain("NODE_OPS_PANEL_ENTER_CLASS");
  });

  it("keeps VideoNode human review switch in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoHumanReviewSwitch.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "VideoHumanReviewSwitch(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/VideoHumanReviewSwitch.tsx",
    ]);
    expect(viewSource).toContain('role="switch"');
    expect(viewSource).toContain("真人验证");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoHumanReviewSwitch",
    );
    expect(videoNode).toContain("<VideoHumanReviewSwitch");
    expect(videoNode).not.toContain('role="switch"');
    expect(videoNode).not.toContain("<span>真人验证</span>");
  });

  it("keeps VideoNode clip operation panel in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoNodeClipPanel.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = [
      "export function",
      "VideoNodeClipPanel(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/VideoNodeClipPanel.tsx",
    ]);
    expect(viewSource).toContain("<VideoClipPanel");
    expect(viewSource).toContain("if (!visible || !videoUrl) return null");
    expect(viewSource).toContain("剪辑失败：{error}");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoNodeClipPanel",
    );
    expect(videoNode).toContain("<VideoNodeClipPanel");
    expect(videoNode).not.toContain(
      'from "@/features/canvas/nodes/VideoClipPanel"',
    );
    expect(videoNode).not.toContain("<VideoClipPanel");
    expect(videoNode).not.toContain("剪辑失败：{clipError}");
  });

  it("keeps VideoNode camera movement trigger in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/CameraMovementChip.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = ["export function", "CameraMovementChip("].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/CameraMovementChip.tsx",
    ]);
    expect(viewSource).toContain("createPortal(");
    expect(viewSource).toContain('window.addEventListener("resize"');
    expect(viewSource).toContain('document.addEventListener("mousedown"');
    expect(viewSource).toContain("findCameraMovementPreset(");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/CameraMovementChip",
    );
    expect(videoNode).toContain("<CameraMovementChip");
    expect(videoNode).not.toContain("interface CameraMovementChipProps");
    expect(videoNode).not.toContain(
      "CAMERA_MOVEMENT_POPOVER_MAX_HEIGHT",
    );
  });

  it("keeps VideoNode asset-library trigger in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/CharacterLibraryChip.tsx",
    );
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = ["export function", "CharacterLibraryChip("].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/CharacterLibraryChip.tsx",
    ]);
    expect(videoNode).toContain(
      "@/features/canvas/nodes/CharacterLibraryChip",
    );
    expect(videoNode).toContain("<CharacterLibraryChip");
    expect(videoNode).not.toContain("interface CharacterLibraryChipProps");
  });

  it("keeps VideoNode count selection in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoCountPicker.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = ["export function", "VideoCountPicker("].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const activeClass = [
      "bg-primary/12",
      "text-foreground",
      "ring-1",
      "ring-primary/30",
    ].join(" ");
    const activeClassOwners = [
      viewPath,
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      resolve(SRC_ROOT, "features/canvas/ui/nodeControlStyles.ts"),
    ]
      .filter((path) => readFileSync(path, "utf8").includes(activeClass))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/VideoCountPicker.tsx",
    ]);
    expect(activeClassOwners).toEqual([
      "features/canvas/ui/nodeControlStyles.ts",
    ]);
    expect(viewSource).toContain("options.map((option)");
    expect(viewSource).toContain("NODE_OPTION_ACTIVE_BUTTON_CLASS");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoCountPicker",
    );
    expect(videoNode).toContain("<VideoCountPicker");
    expect(videoNode).toContain("options={VIDEO_NODE_COUNT_OPTIONS}");
    expect(videoNode).not.toContain("interface CountPickerProps");
    expect(videoNode).not.toContain("VIDEO_COUNT_OPTION_BASE_CLASS");
  });

  it("keeps VideoNode generation parameters in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoConfigChip.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const videoNodeController = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declaration = ["export function", "VideoConfigChip("].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/nodes/VideoConfigChip.tsx",
    ]);
    expect(viewSource).toContain("aspectRatioOptions.map((ratio)");
    expect(viewSource).toContain("normalizeDuration(parsed)");
    expect(viewSource).toContain("setDurationDraft(String(durationSec))");
    expect(viewSource).not.toContain("function clampVideoDuration(");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoConfigChip",
    );
    expect(videoNode).toContain("<VideoConfigChip");
    expect(videoNode).toContain(
      "aspectRatioOptions={VIDEO_NODE_ASPECT_RATIOS}",
    );
    expect(videoNode).toContain("normalizeDuration={normalizeDuration}");
    expect(videoNodeController).toContain(
      "clampVideoDuration(value, durationBounds)",
    );
    expect(videoNode).not.toContain("function clampVideoDuration(");
    expect(videoNode).not.toContain("interface VideoConfigChipProps");
    expect(videoNode).not.toContain("durationDraft");
    expect(videoNode).not.toContain("VIDEO_PARAM_POPOVER_CLASS");
  });

  it("keeps VideoNode generation-mode projection separate from its view", () => {
    const projectionPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/videoGenerationModeOptions.ts",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoGenerationModeSelect.tsx",
    );
    const projectionSource = readFileSync(projectionPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const videoNodeController = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const forbiddenViewImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      ["export function", "resolveVideoGenerationModeOptions("].join(" "),
      ["export function", "VideoGenerationModeSelect("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(projectionPath)).toEqual([
      "@/features/canvas/domain/canvasNodes",
    ]);
    expect(forbiddenViewImports).toEqual([]);
    expect(implementationOwners).toEqual([
      ["features/canvas/nodes/videoGenerationModeOptions.ts"],
      ["features/canvas/nodes/VideoGenerationModeSelect.tsx"],
    ]);
    expect(projectionSource).toContain("HAPPYHORSE_MODE_ORDER");
    expect(projectionSource).toContain("上游含视频素材时只能用");
    expect(viewSource).toContain("options.map((option)");
    expect(viewSource).toContain("option.disabledReason");
    expect(viewSource).not.toContain("HappyHorse");
    expect(viewSource).not.toContain("上游含视频素材时只能用");
    expect(videoNodeController).toContain(
      "@/features/canvas/nodes/videoGenerationModeOptions",
    );
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoGenerationModeSelect",
    );
    expect(videoNodeController).toContain(
      "resolveVideoGenerationModeOptions({",
    );
    expect(videoNode).toContain("<VideoGenerationModeSelect");
    expect(videoNode).not.toContain("interface GenModeSelectProps");
    expect(videoNode).not.toContain("function videoModeDisabledReason(");
    expect(videoNode).not.toContain("const MODE_TABS");
  });

  it("keeps video model generation rules in one pure domain module", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoGenerationModel.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const declarations = [
      ["export function", "qualityToResolution("].join(" "),
      ["export function", "videoQualityOptionsForModel("].join(" "),
      ["export function", "videoDurationBoundsForModel("].join(" "),
      ["export function", "clampVideoDuration("].join(" "),
      ["export function", "isHappyHorseVideoModel("].join(" "),
      ["export function", "isSeedance20VideoModel("].join(" "),
      ["export function", "isVideoModeSupportedByModel("].join(" "),
      ["export function", "videoModelReferenceDisabledReason("].join(" "),
      ["export function", "sceneOptimizeOptionsForModel("].join(" "),
      ["export function", "normalizeSceneOptimize("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(domainPath)).toEqual(["./canvasNodes"]);
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("@/api/");
    expect(domainSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/domain/videoGenerationModel.ts",
      ]),
    );
    expect(videoNode).toContain(
      "@/features/canvas/domain/videoGenerationModel",
    );
    expect(videoNode).not.toContain("const DEFAULT_DURATION_MIN");
    expect(videoNode).not.toContain("function resolutionToQuality(");
    expect(videoNode).not.toContain("function isSeedance1xModel(");
    expect(videoNode).not.toContain("function isGrokVideoChannelModel(");
    expect(videoNode).toContain("isSeedance20VideoModel(modelId)");
    expect(videoNode).not.toContain("/seedance2/i.test(");
  });

  it("keeps video clip range rules in one pure domain module", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoClipRange.ts",
    );
    const clipPanelPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoClipPanel.tsx",
    );
    const timelinePath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeTimeline.ts",
    );
    const composeModalPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/VideoComposeModal.tsx",
    );
    const gesturesPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeTimelineGestures.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const clipPanelSource = readFileSync(clipPanelPath, "utf8");
    const timelineSource = readFileSync(timelinePath, "utf8");
    const composeModalSource = readFileSync(composeModalPath, "utf8");
    const declarations = [
      ["export const", "VIDEO_CLIP_MIN_DURATION_MS = 200"].join(" "),
      ["export function", "resolveVideoClipRange("].join(" "),
      ["export function", "constrainVideoClipStartMs("].join(" "),
      ["export function", "constrainVideoClipEndMs("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("document");
    expect(domainSource).not.toContain("@/api/");
    expect(domainSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual(
      declarations.map(() => ["features/canvas/domain/videoClipRange.ts"]),
    );
    expect(clipPanelSource).toContain(
      "@/features/canvas/domain/videoClipRange",
    );
    expect(clipPanelSource).toContain("resolveVideoClipRange({");
    expect(clipPanelSource).not.toContain("const MIN_CLIP_MS = 200");
    expect(timelineSource).not.toContain("export const MIN_CLIP_MS");
    expect(importSpecifiers(gesturesPath)).toContain("./videoClipRange");
    expect(composeModalSource).not.toContain(
      "@/features/canvas/domain/videoClipRange",
    );
    expect(composeModalSource).not.toContain("MIN_CLIP_MS");
  });

  it("keeps video-compose timeline state, session projection, and media probing in their layers", () => {
    const timelinePath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeTimeline.ts",
    );
    const timelineTestPath = resolve(
      SRC_ROOT,
      "__tests__/features/canvas/timelineModel.test.ts",
    );
    const sessionPath = resolve(
      SRC_ROOT,
      "features/canvas/application/videoComposeTimelineSession.ts",
    );
    const sessionTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/videoComposeTimelineSession.test.ts",
    );
    const runtimePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserVideoComposeMediaRuntime.ts",
    );
    const runtimeTestPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserVideoComposeMediaRuntime.test.ts",
    );
    const modalPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/VideoComposeModal.tsx",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposeNodeController.ts",
    );
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoComposeNodeView.tsx",
    );
    const oldTimelinePath = resolve(
      SRC_ROOT,
      "features/canvas/compose/timelineModel.ts",
    );
    const timelineSource = readFileSync(timelinePath, "utf8");
    const timelineTestSource = readFileSync(timelineTestPath, "utf8");
    const sessionSource = readFileSync(sessionPath, "utf8");
    const sessionTestSource = readFileSync(sessionTestPath, "utf8");
    const runtimeSource = readFileSync(runtimePath, "utf8");
    const runtimeTestSource = readFileSync(runtimeTestPath, "utf8");
    const modalSource = readFileSync(modalPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const viewSource = readFileSync(viewPath, "utf8");
    const declarations = [
      ["export function", "buildComposePayload("].join(" "),
      ["export function", "buildVideoComposeInitialTimeline("].join(" "),
      ["export function", "reconcileVideoComposeDraftWithSources("].join(
        " ",
      ),
      ["export function", "resolveVideoComposeInitialTimeline("].join(" "),
      ["export function", "probeVideoComposeMediaDuration("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(timelinePath)).toEqual(["./videoCompose"]);
    expect(timelineSource).not.toContain("react");
    expect(timelineSource).not.toContain("document.");
    expect(timelineSource).not.toContain("useCanvasStore");
    expect(timelineSource).not.toContain("@/api/");
    expect(new Set(importSpecifiers(sessionPath))).toEqual(
      new Set([
        "@/features/canvas/domain/canvasNodes",
        "@/features/canvas/domain/videoComposeTimeline",
      ]),
    );
    expect(sessionSource).not.toContain("react");
    expect(sessionSource).not.toContain("document.");
    expect(sessionSource).not.toContain("useCanvasStore");
    expect(sessionSource).not.toContain("className=");
    expect(importSpecifiers(runtimePath)).toEqual([
      "@/features/canvas/domain/videoComposeTimeline",
    ]);
    expect(runtimeSource).toContain("document.createElement(");
    expect(runtimeSource).toContain("element.src = resolveUrl(url)");
    expect(runtimeSource).not.toContain("resolveImageDisplayUrl");
    expect(runtimeSource).not.toContain("useCanvasStore");
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/application/videoComposeTimelineSession",
    );
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/domain/videoComposeTimeline",
    );
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/infrastructure/browserVideoComposeMediaRuntime",
    );
    expect(importSpecifiers(modalPath)).not.toContain(
      "@/features/canvas/canvasStore",
    );
    expect(modalSource).toContain("resolveVideoComposeInitialTimeline({");
    expect(modalSource).toContain("probeVideoComposeMediaDuration(");
    expect(modalSource).not.toContain("function buildInitialTimeline(");
    expect(modalSource).not.toContain("function reconcileDraftWithUpstream(");
    expect(modalSource).not.toContain("function probeMediaDuration(");
    expect(controllerSource).toContain("sourceNodes: upstreamNodes");
    expect(viewSource).toContain("sourceNodes={controller.sourceNodes}");
    expect(existsSync(oldTimelinePath)).toBe(false);
    expect(declarationOwners).toEqual([
      ["features/canvas/domain/videoComposeTimeline.ts"],
      ["features/canvas/application/videoComposeTimelineSession.ts"],
      ["features/canvas/application/videoComposeTimelineSession.ts"],
      ["features/canvas/application/videoComposeTimelineSession.ts"],
      [
        "features/canvas/infrastructure/browserVideoComposeMediaRuntime.ts",
      ],
    ]);
    expect(timelineTestSource).toContain(
      "@/features/canvas/domain/videoComposeTimeline",
    );
    expect(sessionTestSource).toContain(
      "from './videoComposeTimelineSession'",
    );
    expect(runtimeTestSource).toContain(
      "from './browserVideoComposeMediaRuntime'",
    );
  });

  it("keeps video-compose selection and editing rules in one pure domain reducer", () => {
    const editsPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeTimelineEdits.ts",
    );
    const editsTestPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeTimelineEdits.test.ts",
    );
    const modalPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/VideoComposeModal.tsx",
    );
    const editsSource = readFileSync(editsPath, "utf8");
    const editsTestSource = readFileSync(editsTestPath, "utf8");
    const modalSource = readFileSync(modalPath, "utf8");
    const declarations = [
      ["export const", "VIDEO_COMPOSE_MIN_SPEED = 0.25"].join(" "),
      ["export const", "VIDEO_COMPOSE_MAX_SPEED = 4"].join(" "),
      ["export function", "resolveVideoComposeClipSelection("].join(" "),
      ["export function", "applyVideoComposeTimelineEdit("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(editsPath))).toEqual(
      new Set(["./videoClipRange", "./videoComposeTimeline"]),
    );
    expect(editsSource).not.toContain("react");
    expect(editsSource).not.toContain("document.");
    expect(editsSource).not.toContain("Date.now(");
    expect(editsSource).not.toContain("Math.random(");
    expect(editsSource).not.toContain("@/api/");
    expect(editsSource).not.toContain("@/stores/");
    expect(editsSource).not.toContain("className=");
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/domain/videoComposeTimelineEdits",
    );
    expect(modalSource).toContain("resolveVideoComposeClipSelection(");
    expect(modalSource).toContain("applyVideoComposeTimelineEdit(");
    expect(modalSource).toContain('type: "splitClip"');
    expect(modalSource).toContain("leftClipId: leftId");
    expect(modalSource).not.toContain("const SPEED_MIN =");
    expect(modalSource).not.toContain("const SPEED_MAX =");
    expect(modalSource).not.toContain("const updateClip = useCallback");
    expect(modalSource).not.toContain("const compactVideoNow = useCallback");
    expect(modalSource).not.toContain("const selectedSourceMs = useMemo");
    expect(modalSource).not.toContain("muted: v <= 0");
    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/domain/videoComposeTimelineEdits.ts",
      ]),
    );
    expect(editsTestSource).toContain(
      'from "./videoComposeTimelineEdits"',
    );
  });

  it("keeps video-compose drag, snap, and trim projections in one pure domain module", () => {
    const gesturesPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeTimelineGestures.ts",
    );
    const gesturesTestPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeTimelineGestures.test.ts",
    );
    const modalPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/VideoComposeModal.tsx",
    );
    const gesturesSource = readFileSync(gesturesPath, "utf8");
    const gesturesTestSource = readFileSync(gesturesTestPath, "utf8");
    const modalSource = readFileSync(modalPath, "utf8");
    const declarations = [
      ["export function", "createVideoComposeClipDragSession("].join(" "),
      ["export function", "snapVideoComposeClipStart("].join(" "),
      ["export function", "snapVideoComposePlayhead("].join(" "),
      ["export function", "projectVideoComposeClipDrag("].join(" "),
      ["export function", "createVideoComposeTrimDragSession("].join(" "),
      ["export function", "projectVideoComposeTrimDrag("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(gesturesPath))).toEqual(
      new Set(["./videoClipRange", "./videoComposeTimeline"]),
    );
    expect(gesturesSource).not.toContain("react");
    expect(gesturesSource).not.toContain("document.");
    expect(gesturesSource).not.toContain("Date.now(");
    expect(gesturesSource).not.toContain("Math.random(");
    expect(gesturesSource).not.toContain("@/api/");
    expect(gesturesSource).not.toContain("@/stores/");
    expect(gesturesSource).not.toContain("className=");
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/domain/videoComposeTimelineGestures",
    );
    expect(modalSource).toContain("createVideoComposeClipDragSession(");
    expect(modalSource).toContain("projectVideoComposeClipDrag({");
    expect(modalSource).toContain("createVideoComposeTrimDragSession(");
    expect(modalSource).toContain("projectVideoComposeTrimDrag(");
    expect(modalSource).toContain("snapVideoComposePlayhead({");
    expect(modalSource).not.toContain("const SNAP_GRID_MS =");
    expect(modalSource).not.toContain("const SNAP_PX =");
    expect(modalSource).not.toContain("const snapClipStart = useCallback");
    expect(modalSource).not.toContain("const boundaryList = useCallback");
    expect(modalSource).not.toContain("const snapPlayhead = useCallback");
    expect(modalSource).not.toContain("reorderIndexForDrag(");
    expect(modalSource).not.toContain("packTrackClips(");
    expect(modalSource).not.toContain("const sourceMaxEnd =");
    expect(declarationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/domain/videoComposeTimelineGestures.ts",
      ]),
    );
    expect(gesturesTestSource).toContain(
      'from "./videoComposeTimelineGestures"',
    );
  });

  it("keeps video-compose controls and track media in presentation leaves", () => {
    const controlsPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/VideoComposeTimelineControls.tsx",
    );
    const controlsTestPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/VideoComposeTimelineControls.test.tsx",
    );
    const trackRowPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/VideoComposeTrackRow.tsx",
    );
    const trackRowTestPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/VideoComposeTrackRow.test.tsx",
    );
    const modalPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/VideoComposeModal.tsx",
    );
    const controlsSource = readFileSync(controlsPath, "utf8");
    const controlsTestSource = readFileSync(controlsTestPath, "utf8");
    const trackRowSource = readFileSync(trackRowPath, "utf8");
    const trackRowTestSource = readFileSync(trackRowTestPath, "utf8");
    const modalSource = readFileSync(modalPath, "utf8");
    const declarations = [
      ["export function", "VideoComposeToolButton("].join(" "),
      ["export function", "VideoComposeSpeedPopover("].join(" "),
      ["export function", "VideoComposeVolumePopover("].join(" "),
      ["export function", "VideoComposeTrackRow("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(new Set(importSpecifiers(controlsPath))).toEqual(
      new Set([
        "react",
        "lucide-react",
        "react-i18next",
        "@/features/canvas/domain/videoComposeTimelineEdits",
      ]),
    );
    expect(new Set(importSpecifiers(trackRowPath))).toEqual(
      new Set([
        "react",
        "lucide-react",
        "react-i18next",
        "@/features/canvas/domain/videoComposeTimeline",
        "@/features/canvas/compose/audioPeaks",
        "@/features/canvas/compose/filmstrip",
      ]),
    );
    expect(controlsSource).not.toContain("useCanvasStore");
    expect(controlsSource).not.toContain("@/api/");
    expect(trackRowSource).not.toContain("useCanvasStore");
    expect(trackRowSource).not.toContain("@/api/");
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/ui/VideoComposeTimelineControls",
    );
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/ui/VideoComposeTrackRow",
    );
    expect(importSpecifiers(modalPath)).not.toContain("./audioPeaks");
    expect(importSpecifiers(modalPath)).not.toContain("./filmstrip");
    expect(modalSource).toContain("<VideoComposeSpeedPopover");
    expect(modalSource).toContain("<VideoComposeVolumePopover");
    expect(modalSource).toContain("<VideoComposeTrackRow");
    expect(modalSource).not.toContain("function VideoComposeToolButton(");
    expect(modalSource).not.toContain("function VideoComposeSpeedPopover(");
    expect(modalSource).not.toContain("function VideoComposeVolumePopover(");
    expect(modalSource).not.toContain("function VideoComposeTrackRow(");
    expect(modalSource).not.toContain("function ClipFilmstrip(");
    expect(modalSource).not.toContain("function ClipWaveform(");
    expect(declarationOwners).toEqual([
      ["features/canvas/ui/VideoComposeTimelineControls.tsx"],
      ["features/canvas/ui/VideoComposeTimelineControls.tsx"],
      ["features/canvas/ui/VideoComposeTimelineControls.tsx"],
      ["features/canvas/ui/VideoComposeTrackRow.tsx"],
    ]);
    expect(controlsTestSource).toContain(
      'from "./VideoComposeTimelineControls"',
    );
    expect(trackRowTestSource).toContain(
      'from "./VideoComposeTrackRow"',
    );
  });

  it("keeps video-compose preview projection, clock, and browser playback in their layers", () => {
    const previewPath = resolve(
      SRC_ROOT,
      "features/canvas/application/videoComposePreview.ts",
    );
    const previewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/videoComposePreview.test.ts",
    );
    const clockPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposePlaybackClock.ts",
    );
    const clockTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposePlaybackClock.test.tsx",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposePlaybackController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposePlaybackController.test.tsx",
    );
    const modalPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/VideoComposeModal.tsx",
    );
    const oldClockPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/useComposePlayback.ts",
    );
    const previewSource = readFileSync(previewPath, "utf8");
    const previewTestSource = readFileSync(previewTestPath, "utf8");
    const clockSource = readFileSync(clockPath, "utf8");
    const clockTestSource = readFileSync(clockTestPath, "utf8");
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const modalSource = readFileSync(modalPath, "utf8");
    const declarations = [
      ["export function", "resolveVideoComposePreviewTrack("].join(" "),
      ["export function", "projectVideoComposeActiveMediaClock("].join(" "),
      ["export function", "resolveVideoComposeMediaClockMs("].join(" "),
      ["export function", "useVideoComposePlaybackClock("].join(" "),
      ["export function", "useVideoComposePlaybackController("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(previewPath)).toEqual([
      "@/features/canvas/domain/videoComposeTimeline",
    ]);
    expect(previewSource).not.toContain("react");
    expect(previewSource).not.toContain("document.");
    expect(previewSource).not.toContain("HTMLVideoElement");
    expect(previewSource).not.toContain("@/api/");
    expect(previewSource).not.toContain("@/stores/");
    expect(importSpecifiers(clockPath)).toEqual(["react"]);
    expect(clockSource).not.toContain("document.");
    expect(clockSource).not.toContain("HTMLVideoElement");
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/application/imageData",
        "@/features/canvas/application/videoComposePreview",
        "@/features/canvas/domain/videoComposeTimeline",
        "./useVideoComposePlaybackClock",
        "./useVideoComposeTrackMediaSync",
      ]),
    );
    expect(controllerSource).toContain("video.dataset.clipId ?? null");
    expect(controllerSource).toContain("stage.requestFullscreen()");
    expect(controllerSource).toContain('addEventListener("wheel"');
    expect(controllerSource).not.toContain("useCanvasStore");
    expect(controllerSource).not.toContain("@/api/");
    expect(controllerSource).not.toContain("className=");
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/hooks/useVideoComposePlaybackController",
    );
    expect(importSpecifiers(modalPath)).not.toContain(
      "./useComposePlayback",
    );
    expect(modalSource).not.toContain("const activeVideoRef = useRef");
    expect(modalSource).not.toContain("const mediaClockMs = useCallback");
    expect(modalSource).not.toContain("const positionPlayhead = useCallback");
    expect(modalSource).not.toContain("requestFullscreen");
    expect(existsSync(oldClockPath)).toBe(false);
    expect(declarationOwners).toEqual([
      ["features/canvas/application/videoComposePreview.ts"],
      ["features/canvas/application/videoComposePreview.ts"],
      ["features/canvas/application/videoComposePreview.ts"],
      ["features/canvas/hooks/useVideoComposePlaybackClock.ts"],
      ["features/canvas/hooks/useVideoComposePlaybackController.ts"],
    ]);
    expect(previewTestSource).toContain('from "./videoComposePreview"');
    expect(clockTestSource).toContain(
      'from "./useVideoComposePlaybackClock"',
    );
    expect(controllerTestSource).toContain(
      'from "./useVideoComposePlaybackController"',
    );
  });

  it("keeps video-compose track media synchronization in one hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposeTrackMediaSync.ts",
    );
    const hookTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposeTrackMediaSync.test.tsx",
    );
    const modalPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/VideoComposeModal.tsx",
    );
    const playbackControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposePlaybackController.ts",
    );
    const hookSource = readFileSync(hookPath, "utf8");
    const hookTestSource = readFileSync(hookTestPath, "utf8");
    const modalSource = readFileSync(modalPath, "utf8");
    const playbackControllerSource = readFileSync(
      playbackControllerPath,
      "utf8",
    );
    const declaration = [
      "export function",
      "useVideoComposeTrackMediaSync<",
    ].join(" ");
    const declarationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(hookPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/application/imageData",
        "@/features/canvas/domain/videoComposeTimeline",
      ]),
    );
    expect(hookSource).toContain("activeClipAt(track, playheadMs)");
    expect(hookSource).toContain("element.dataset.clipId = activeClipId");
    expect(hookSource).toContain("element.playbackRate =");
    expect(hookSource).toContain("desiredSourceSecondsRef");
    expect(hookSource).toContain("element.addEventListener('seeked'");
    expect(hookSource).not.toContain("useCanvasStore");
    expect(hookSource).not.toContain("@/features/canvas/composition");
    expect(hookSource).not.toContain("className=");
    expect(importSpecifiers(playbackControllerPath)).toContain(
      "./useVideoComposeTrackMediaSync",
    );
    expect(
      playbackControllerSource.match(/useVideoComposeTrackMediaSync\(/g)
        ?.length,
    ).toBe(2);
    expect(importSpecifiers(modalPath)).not.toContain(
      "@/features/canvas/hooks/useVideoComposeTrackMediaSync",
    );
    expect(modalSource).not.toContain("function useTrackMediaSync(");
    expect(modalSource).not.toContain("desiredSourceSecRef");
    expect(declarationOwners).toEqual([
      "features/canvas/hooks/useVideoComposeTrackMediaSync.ts",
    ]);
    expect(hookTestSource).toContain(
      "from './useVideoComposeTrackMediaSync'",
    );
  });

  it("keeps video-compose export orchestration and browser delivery out of the modal", () => {
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposeExportController.ts",
    );
    const controllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposeExportController.test.tsx",
    );
    const runtimePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserVideoComposeExportRuntime.ts",
    );
    const runtimeTestPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserVideoComposeExportRuntime.test.ts",
    );
    const modalPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/VideoComposeModal.tsx",
    );
    const controllerSource = readFileSync(controllerPath, "utf8");
    const controllerTestSource = readFileSync(controllerTestPath, "utf8");
    const runtimeSource = readFileSync(runtimePath, "utf8");
    const runtimeTestSource = readFileSync(runtimeTestPath, "utf8");
    const modalSource = readFileSync(modalPath, "utf8");
    const declarations = [
      ["export async function", "fetchVideoComposeResultBlob("].join(" "),
      ["export function", "resolveVideoComposeResultFileName("].join(" "),
      ["export function", "downloadVideoComposeBlob("].join(" "),
      ["export function", "useVideoComposeExportController("].join(" "),
    ];
    const declarationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(runtimePath)).toEqual([]);
    expect(runtimeSource).toContain("fetch(url, init)");
    expect(runtimeSource).toContain("document.createElement('a')");
    expect(runtimeSource).toContain("URL.createObjectURL(blob)");
    expect(runtimeSource).not.toContain("react");
    expect(runtimeSource).not.toContain("useCanvasStore");
    expect(new Set(importSpecifiers(controllerPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/application/imageData",
        "@/features/canvas/composition",
        "@/features/canvas/domain/videoCompose",
        "@/features/canvas/domain/videoComposeTimeline",
        "@/features/canvas/infrastructure/browserVideoComposeExportRuntime",
      ]),
    );
    expect(controllerSource).toContain("await composeCanvasVideo({");
    expect(controllerSource).toContain("await uploadCanvasAsset(");
    expect(controllerSource).toContain("buildComposePayload(");
    expect(controllerSource).toContain("hasOverlappingVideoClips(timeline)");
    expect(controllerSource).toContain(
      "timelineRef.current.cover?.url ?? null",
    );
    expect(controllerSource).not.toContain("document.");
    expect(controllerSource).not.toContain("URL.createObjectURL");
    expect(controllerSource).not.toContain("className=");
    expect(importSpecifiers(modalPath)).toContain(
      "@/features/canvas/hooks/useVideoComposeExportController",
    );
    expect(importSpecifiers(modalPath)).not.toContain(
      "@/features/canvas/composition",
    );
    expect(modalSource).toContain("useVideoComposeExportController({");
    expect(modalSource).not.toContain("composeCanvasVideo(");
    expect(modalSource).not.toContain("uploadCanvasAsset(");
    expect(modalSource).not.toContain("fetchComposedBlob");
    expect(modalSource).not.toContain("document.createElement(\"a\")");
    expect(modalSource).not.toContain("URL.createObjectURL");
    expect(modalSource).not.toContain("setIsExporting");
    expect(declarationOwners).toEqual([
      [
        "features/canvas/infrastructure/browserVideoComposeExportRuntime.ts",
      ],
      [
        "features/canvas/infrastructure/browserVideoComposeExportRuntime.ts",
      ],
      [
        "features/canvas/infrastructure/browserVideoComposeExportRuntime.ts",
      ],
      ["features/canvas/hooks/useVideoComposeExportController.ts"],
    ]);
    expect(controllerTestSource).toContain(
      "from './useVideoComposeExportController'",
    );
    expect(runtimeTestSource).toContain(
      "from './browserVideoComposeExportRuntime'",
    );
  });

  it("keeps single-video clip composition in one application use case", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/composeVideoClip.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneVideoComposeGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const declaration = ["export async function", "composeVideoClip("].join(
      " ",
    );
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/video/compose`"),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["../domain/canvasNodes", "./composeCanvasVideo"]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual([
      "features/canvas/application/composeVideoClip.ts",
    ]);
    expect(applicationSource).toContain("params.startMs / 1000");
    expect(applicationSource).toContain("params.endMs / 1000");
    expect(applicationSource).toContain("composeCanvasVideo(");
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/composeCanvasVideo",
        "../application/ports",
      ]),
    );
    expect(adapterSource).not.toContain("react");
    expect(adapterSource).not.toContain("@/stores/");
    expect(adapterSource).toContain('method: "POST"');
    expect(adapterSource).toContain("canvas_id: request.canvasId ?? \"\"");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneVideoComposeGateway.ts",
    ]);
    expect(legacyOpsSource).not.toContain("submitFreezoneVideoCompose");
    expect(legacyOpsSource).not.toContain("}/freezone/video/compose`");
    expect(importSpecifiers(legacyOpsPath)).not.toContain(
      "@/features/canvas/domain/videoCompose",
    );
    expect(compositionSource).toContain(
      "composeGateway: freezoneVideoComposeGateway",
    );
    expect(compositionSource).toContain(
      "taskGateway: freezoneGenerationTaskGateway",
    );
    expect(videoNode).toContain("composeVideoClip({");
    expect(videoNode).not.toContain("submitFreezoneVideoCompose");
    expect(videoNode).not.toContain("`track_${id}_video`");
    expect(videoNode).not.toContain("sourceStart: startMs / 1000");
  });

  it("keeps timeline video composition behind the shared Canvas use case", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoCompose.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/composeCanvasVideo.ts",
    );
    const timelinePath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoComposeTimeline.ts",
    );
    const exportControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoComposeExportController.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const opsPath = resolve(SRC_ROOT, "api/ops.ts");
    const oldAdapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneVideoClipComposeGateway.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const timelineSource = readFileSync(timelinePath, "utf8");
    const exportControllerSource = readFileSync(
      exportControllerPath,
      "utf8",
    );
    const compositionSource = readFileSync(compositionPath, "utf8");
    const opsSource = readFileSync(opsPath, "utf8");
    const declaration = ["export async function", "composeCanvasVideo("].join(
      " ",
    );
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export interface CanvasVideoComposeRequest",
    );
    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/videoCompose",
        "./completeCanvasMediaGenerationTask",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      "completeCanvasMediaGenerationTask(",
    );
    expect(implementationOwners).toEqual([
      "features/canvas/application/composeCanvasVideo.ts",
    ]);
    expect(importSpecifiers(timelinePath)).toContain("./videoCompose");
    expect(importSpecifiers(timelinePath)).not.toContain("@/api/ops");
    expect(timelineSource).toContain(
      "): CanvasVideoComposeRequest {",
    );
    expect(importSpecifiers(exportControllerPath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(exportControllerPath)).toContain(
      "@/features/canvas/domain/videoCompose",
    );
    expect(importSpecifiers(exportControllerPath)).not.toContain("@/api/ops");
    expect(importSpecifiers(exportControllerPath)).not.toContain("@/api/tasks");
    expect(exportControllerSource).toContain("await composeCanvasVideo({");
    expect(exportControllerSource).not.toContain("submitFreezoneVideoCompose");
    expect(exportControllerSource).not.toContain("fetchFreezoneJobResult");
    expect(exportControllerSource).not.toContain("awaitTaskCompletion");
    expect(compositionSource).toContain(
      "composeCanvasVideoUseCase(params, {",
    );
    expect(opsSource).not.toContain(
      "@/features/canvas/domain/videoCompose",
    );
    expect(opsSource).not.toContain("submitFreezoneVideoCompose");
    expect(opsSource).not.toContain("FreezoneVideoComposeResolution");
    expect(opsSource).not.toContain("FreezoneVideoComposePayload");
    expect(existsSync(oldAdapterPath)).toBe(false);
  });

  it("keeps video subtitle erasure in one application use case", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/eraseVideoSubtitles.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneVideoSubtitleEraseGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const declaration = [
      "export async function",
      "eraseVideoSubtitles(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes("}/freezone/video/erase`"),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set(["../domain/canvasNodes", "./ports"]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual([
      "features/canvas/application/eraseVideoSubtitles.ts",
    ]);
    expect(applicationSource).toContain('params.mode === "box"');
    expect(applicationSource).toContain('"smart_subtitle"');
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/eraseVideoSubtitles",
        "../application/ports",
      ]),
    );
    expect(adapterSource).not.toContain("react");
    expect(adapterSource).not.toContain("@/stores/");
    expect(adapterSource).toContain('method: "POST"');
    expect(adapterSource).toContain("source_url: submission.sourceUrl");
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneVideoSubtitleEraseGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneVideoEraseMode",
      "FreezoneVideoEraseBox",
      "FreezoneVideoErasePayload",
      "submitFreezoneVideoErase",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/video/erase`");
    expect(compositionSource).toContain(
      "eraseGateway: freezoneVideoSubtitleEraseGateway",
    );
    expect(compositionSource).toContain(
      "taskGateway: freezoneGenerationTaskGateway",
    );
    expect(videoNode).toContain("eraseVideoSubtitles({");
    expect(videoNode).not.toContain("submitFreezoneVideoErase");
    expect(videoNode).not.toContain('mode: "smart_subtitle"');
  });

  it("keeps canvas text translation in one application use case", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/translateCanvasText.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneCanvasTextTranslationGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const consumerPaths = [
      "features/canvas/hooks/useAudioOperationsPanelController.ts",
      "features/canvas/hooks/useImageGenNodeController.ts",
      "features/canvas/hooks/useScriptNodeController.ts",
      "features/canvas/hooks/useTextAnnotationNodeController.ts",
      "features/canvas/hooks/useVideoNodeController.ts",
    ].map((path) => resolve(SRC_ROOT, path));
    const declaration = [
      "export async function",
      "translateCanvasText(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const endpointFragments = [
      "}/freezone/text/translate`",
      "/freezone/jobs/freezone_text_translate/",
    ];
    const endpointOwners = endpointFragments.map((fragment) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => !path.includes(".test."))
        .filter((path) => readFileSync(path, "utf8").includes(fragment))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(applicationPath)).toEqual(["./ports"]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual([
      "features/canvas/application/translateCanvasText.ts",
    ]);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/ports",
        "../application/translateCanvasText",
      ]),
    );
    expect(adapterSource).not.toContain("react");
    expect(adapterSource).not.toContain("@/stores/");
    expect(adapterSource).toContain('method: "POST"');
    expect(endpointOwners).toEqual(
      endpointFragments.map(() => [
        "features/canvas/infrastructure/freezoneCanvasTextTranslationGateway.ts",
      ]),
    );
    for (const legacySymbol of [
      "FreezoneTextTranslateNodeType",
      "FreezoneTextTranslatePayload",
      "FreezoneTextTranslateResult",
      "submitFreezoneTextTranslate",
      "fetchFreezoneTextTranslateResult",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(compositionSource).toContain(
      "translationGateway: freezoneCanvasTextTranslationGateway",
    );
    expect(compositionSource).toContain(
      "taskGateway: freezoneGenerationTaskGateway",
    );
    for (const consumerPath of consumerPaths) {
      const consumerSource = readFileSync(consumerPath, "utf8");
      expect(consumerSource).toContain("translateCanvasText({");
      expect(consumerSource).not.toContain("submitFreezoneTextTranslate");
      expect(consumerSource).not.toContain(
        "fetchFreezoneTextTranslateResult",
      );
    }
  });

  it("keeps canvas video generation submission in one application use case", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/submitVideoGeneration.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneVideoGenerationSubmissionGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const videoNodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoNodeController.ts",
    );
    const textNodeControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useTextAnnotationNodeController.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const videoNode = readFileSync(videoNodePath, "utf8");
    const textNodeController = readFileSync(
      textNodeControllerPath,
      "utf8",
    );
    const legacyOpsSource = readFileSync(
      resolve(SRC_ROOT, "api/ops.ts"),
      "utf8",
    );
    const declaration = [
      "export async function",
      "submitVideoGeneration(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const endpointNames = [
      "gen",
      "keyframes",
      "i2v",
      "video-edit",
      "omni-gen",
    ];
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "}/freezone/video/${endpoint}`",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "../domain/canvasNodes",
        "../domain/videoGenerationModel",
        "./ports",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain("qualityToResolution(params.quality)");
    expect(implementationOwners).toEqual([
      "features/canvas/application/submitVideoGeneration.ts",
    ]);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/submitVideoGeneration",
      ]),
    );
    expect(adapterSource).not.toContain("react");
    expect(adapterSource).not.toContain("@/stores/");
    expect(compositionSource).toContain(
      "submissionGateway: freezoneVideoGenerationSubmissionGateway",
    );
    expect(videoNode.match(/submitVideoGeneration\(\{/g)).toHaveLength(5);
    expect(
      textNodeController.match(/submitVideoGeneration\(\{/g),
    ).toHaveLength(1);
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneVideoGenerationSubmissionGateway.ts",
    ]);
    for (const endpointName of endpointNames) {
      expect(adapterSource).toContain(
        `submitVideoGenerationRequest(projectId, "${endpointName}"`,
      );
    }
    for (const legacySymbol of [
      "FreezoneVideoAspectRatio",
      "FreezoneVideoResolution",
      "FreezoneVideoMark",
      "FreezoneVideoGenPayload",
      "submitFreezoneVideoGen",
      "FreezoneVideoKeyframesPayload",
      "submitFreezoneVideoKeyframes",
      "FreezoneVideoI2vPayload",
      "submitFreezoneVideoI2v",
      "FreezoneVideoEditPayload",
      "submitFreezoneVideoEdit",
      "FreezoneVideoReferenceType",
      "FreezoneVideoReferenceItem",
      "FreezoneVideoOmniGenPayload",
      "submitFreezoneVideoOmniGen",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("}/freezone/video/");
  });

  it("keeps active video task completion in one application use case", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/completeVideoGenerationTask.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const videoNodePath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoNodeController.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const videoNode = readFileSync(videoNodePath, "utf8");
    const declaration = [
      "export async function",
      "completeVideoGenerationTask(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(new Set(importSpecifiers(applicationPath))).toEqual(
      new Set([
        "./generationOutputUrl",
        "./ports",
        "./submitVideoGeneration",
      ]),
    );
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain(
      'resolveGenerationOutputUrl(completion.result, "video")',
    );
    expect(applicationSource).toContain(
      "dependencies.taskGateway.fetchResultUrl(",
    );
    expect(implementationOwners).toEqual([
      "features/canvas/application/completeVideoGenerationTask.ts",
    ]);
    expect(compositionSource).toContain(
      "taskGateway: freezoneGenerationTaskGateway",
    );
    expect(videoNode).toContain("completeVideoGenerationTask({");
    expect(videoNode).not.toContain("fetchFreezoneJobResult");
    expect(videoNode).not.toContain("awaitTaskCompletion");
    expect(videoNode).not.toContain("resolveGenerationOutputUrl");
  });

  it("keeps canvas asset uploads behind one application use case", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/uploadCanvasAsset.ts",
    );
    const directorCapturePath = resolve(
      SRC_ROOT,
      "features/canvas/application/directorCaptureBundle.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAssetGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const consumerPaths = [
      "features/canvas/compose/CoverEditor.tsx",
      "features/canvas/hooks/useVideoComposeExportController.ts",
      "features/canvas/hooks/useAudioNodeController.ts",
      "features/canvas/hooks/useGroupNodeController.ts",
      "features/canvas/hooks/useImageGenNodeController.ts",
      "features/canvas/hooks/useSkillNodeController.ts",
      "features/canvas/hooks/useThreeDWorldNodeController.ts",
      "features/canvas/hooks/useUploadNodeController.ts",
      "features/canvas/hooks/useVideoNodeController.ts",
      "features/canvas/hooks/useAssetLibraryModalController.ts",
      "features/canvas/ui/EraseOverlay.tsx",
      "features/canvas/ui/NodeActionToolbar.tsx",
      "features/canvas/ui/RedrawOverlay.tsx",
      "features/canvas/ui/RotateEditorOverlay.tsx",
    ].map((path) => resolve(SRC_ROOT, path));
    const applicationSource = readFileSync(applicationPath, "utf8");
    const directorCaptureSource = readFileSync(directorCapturePath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const consumerSources = consumerPaths.map((path) =>
      readFileSync(path, "utf8"),
    );
    const declaration = [
      "export async function",
      "uploadCanvasAsset(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const productionCanvasSources = sourceFiles(
      resolve(SRC_ROOT, "features/canvas"),
    ).filter((path) => !path.includes(".test."));
    const directImageUploadOwners = productionCanvasSources
      .filter((path) =>
        readFileSync(path, "utf8").includes("uploadFreezoneImage("),
      )
      .map(relativeSource)
      .sort();
    const directVideoUploadOwners = productionCanvasSources
      .filter((path) =>
        readFileSync(path, "utf8").includes("uploadFreezoneVideo("),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual(["./ports"]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual([
      "features/canvas/application/uploadCanvasAsset.ts",
    ]);
    expect(adapterSource).toContain("uploadFreezoneAsset(");
    expect(adapterSource).toContain("options");
    expect(compositionSource).toContain("uploadCanvasAssetUseCase(");
    expect(compositionSource).toContain("freezoneAssetGateway");
    expect(directorCaptureSource).toContain("uploadAsset(");
    expect(directorCaptureSource).not.toContain("uploadCanvasAsset");
    expect(
      directorCaptureSource.match(/uploadAsset\(/g),
    ).toHaveLength(3);
    expect(directorCaptureSource.match(/disableTimeout: true/g)).toHaveLength(1);
    expect(
      directorCaptureSource.match(/DIRECTOR_CAPTURE_UPLOAD_OPTIONS/g),
    ).toHaveLength(4);
    expect(consumerSources[6]).toContain("directorCaptureBundle");
    expect(consumerSources[7]).toContain("directorCaptureBundle");
    expect(consumerSources[6]).not.toContain(
      "director-world-${nodeId}-combined-",
    );
    expect(consumerSources[7]).not.toContain(
      "director-world-${nodeId}-combined-",
    );
    expect(directImageUploadOwners).toEqual([]);
    expect(directVideoUploadOwners).toEqual([]);
    for (const consumerSource of consumerSources) {
      expect(consumerSource).toContain("uploadCanvasAsset(");
      expect(consumerSource).not.toContain("uploadFreezoneImage");
      expect(consumerSource).not.toContain("uploadFreezoneVideo");
      expect(consumerSource).not.toContain("timeoutMs: false");
    }
    expect(
      consumerSources
        .join("\n")
        .match(/disableTimeout: true/g),
    ).toHaveLength(6);
  });

  it("keeps Canvas asset-library contracts and transport mapping out of views", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/assetLibrary.ts",
    );
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/assetLibrary.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneAssetLibraryGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/assetLibraryComposition.ts",
    );
    const modalEntryPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/AssetLibraryModal.tsx",
    );
    const modalModelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/assetLibraryModalModel.ts",
    );
    const modalModelTestPath = resolve(
      SRC_ROOT,
      "features/canvas/application/assetLibraryModalModel.test.ts",
    );
    const modalControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAssetLibraryModalController.ts",
    );
    const modalControllerTestPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useAssetLibraryModalController.test.tsx",
    );
    const modalViewPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/AssetLibraryModalView.tsx",
    );
    const modalViewTestPath = resolve(
      SRC_ROOT,
      "features/canvas/ui/AssetLibraryModalView.test.tsx",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const domainSource = readFileSync(domainPath, "utf8");
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const modalEntrySource = readFileSync(modalEntryPath, "utf8");
    const modalModelSource = readFileSync(modalModelPath, "utf8");
    const modalModelTestSource = readFileSync(modalModelTestPath, "utf8");
    const modalControllerSource = readFileSync(modalControllerPath, "utf8");
    const modalControllerTestSource = readFileSync(
      modalControllerTestPath,
      "utf8",
    );
    const modalViewSource = readFileSync(modalViewPath, "utf8");
    const modalViewTestSource = readFileSync(modalViewTestPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const imageEditModelPath = resolve(
      SRC_ROOT,
      "features/canvas/application/imageEditNodeModel.ts",
    );
    const imageEditControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageEditNodeController.ts",
    );
    const imageEditViewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageEditNodeView.tsx",
    );
    const imageGenControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useImageGenNodeController.ts",
    );
    const imageGenViewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/ImageGenNodeView.tsx",
    );
    const videoNodeControllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useVideoNodeController.ts",
    );
    const videoNodeViewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoNodeView.tsx",
    );
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes("freezone/video/character-library") &&
          source.includes("freezone/video/asset-library/sync-from-mainline")
        );
      })
      .map(relativeSource)
      .sort();
    const modalDeclarations = [
      ["export function", "AssetLibraryModal("].join(" "),
      ["export function", "resolveAssetLibraryTabs("].join(" "),
      ["export function", "useAssetLibraryModalController("].join(" "),
      ["export function", "AssetLibraryModalView("].join(" "),
    ];
    const modalDeclarationOwners = modalDeclarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(domainPath)).toEqual([]);
    expect(domainSource).toContain(
      "export interface CanvasAssetLibraryItem",
    );
    expect(importSpecifiers(applicationPath)).toEqual([
      "../domain/assetLibrary",
    ]);
    expect(applicationSource).toContain(
      "export interface CanvasAssetLibraryGateway",
    );
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "../application/assetLibrary",
        "../domain/assetLibrary",
      ]),
    );
    expect(adapterSource).toContain(
      "freezoneAssetLibraryGateway: CanvasAssetLibraryGateway",
    );
    expect(adapterSource).toContain("apiCall<unknown>(");
    expect(adapterSource).toContain("freezone/video/character-library");
    expect(adapterSource).toContain(
      "freezone/video/asset-library/sync-from-mainline",
    );
    expect(new Set(importSpecifiers(compositionPath))).toEqual(
      new Set([
        "./application/assetLibrary",
        "./infrastructure/freezoneAssetLibraryGateway",
      ]),
    );
    expect(compositionSource).toContain(
      "freezoneAssetLibraryGateway.syncFromMainline(projectId)",
    );
    expect(importSpecifiers(modalControllerPath)).toContain(
      "@/features/canvas/assetLibraryComposition",
    );
    expect(importSpecifiers(modalControllerPath)).toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(importSpecifiers(modalControllerPath)).toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(modalControllerPath)).not.toContain("@/api/ops");
    expect(modalControllerSource).not.toContain("normalizeLibraryList");
    expect(modalControllerSource).not.toContain(
      "fetchFreezoneVideoCharacterLibrary",
    );
    expect(modalControllerSource).not.toContain(
      "syncFreezoneAssetLibraryFromMainline",
    );
    expect(modalControllerSource).not.toContain(
      "submitFreezoneAddVideoCharacterLibraryItem",
    );
    expect(modalControllerSource).not.toContain(
      "deleteFreezoneVideoCharacterLibraryItem",
    );
    expect(importSpecifiers(modalViewPath)).not.toContain(
      "@/features/canvas/assetLibraryComposition",
    );
    expect(importSpecifiers(modalViewPath)).not.toContain(
      "@/features/canvas/composition",
    );
    expect(importSpecifiers(modalViewPath)).not.toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(modalViewSource).not.toContain("useState(");
    expect(modalViewSource).not.toContain("useEffect(");
    expect(modalViewSource).toContain("createPortal(");
    expect(modalViewSource).toContain("<Button");
    expect(new Set(importSpecifiers(modalEntryPath))).toEqual(
      new Set([
        "react",
        "@/features/canvas/hooks/useAssetLibraryModalController",
        "./AssetLibraryModalView",
      ]),
    );
    expect(modalEntrySource).toContain(
      "useAssetLibraryModalController(props)",
    );
    expect(modalEntrySource).toContain(
      "createElement(AssetLibraryModalView, { controller })",
    );
    expect(modalEntrySource).not.toContain("useState(");
    expect(modalEntrySource).not.toContain("className=");
    expect(modalModelSource).not.toContain("react");
    expect(modalModelSource).not.toContain("window.");
    expect(modalModelSource).not.toContain("document.");
    expect(modalModelSource).not.toContain("className=");
    expect(modalDeclarationOwners).toEqual([
      ["features/canvas/ui/AssetLibraryModal.tsx"],
      ["features/canvas/application/assetLibraryModalModel.ts"],
      ["features/canvas/hooks/useAssetLibraryModalController.ts"],
      ["features/canvas/ui/AssetLibraryModalView.tsx"],
    ]);
    expect(modalModelTestSource).toContain(
      "from './assetLibraryModalModel'",
    );
    expect(modalControllerTestSource).toContain(
      "from './useAssetLibraryModalController'",
    );
    expect(modalViewTestSource).toContain(
      "from './AssetLibraryModalView'",
    );
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneAssetLibraryGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneVideoCharacterLibraryItem",
      "FreezoneAddVideoCharacterLibraryItemPayload",
      "fetchFreezoneVideoCharacterLibrary",
      "submitFreezoneAddVideoCharacterLibraryItem",
      "syncFreezoneAssetLibraryFromMainline",
      "deleteFreezoneVideoCharacterLibraryItem",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(legacyOpsSource).not.toContain("freezone/video/character-library");
    expect(legacyOpsSource).not.toContain(
      "freezone/video/asset-library/sync-from-mainline",
    );
    expect(importSpecifiers(videoNodeControllerPath)).toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(importSpecifiers(videoNodeControllerPath)).not.toContain(
      "@/features/canvas/ui/AssetLibraryModal",
    );
    expect(importSpecifiers(videoNodeViewPath)).toContain(
      "@/features/canvas/ui/AssetLibraryModal",
    );
    expect(importSpecifiers(videoNodeViewPath)).not.toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(importSpecifiers(imageEditModelPath)).toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(importSpecifiers(imageEditControllerPath)).toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(importSpecifiers(imageEditControllerPath)).not.toContain(
      "@/features/canvas/ui/AssetLibraryModal",
    );
    expect(importSpecifiers(imageEditViewPath)).toContain(
      "@/features/canvas/ui/AssetLibraryModal",
    );
    expect(importSpecifiers(imageEditViewPath)).not.toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(importSpecifiers(imageGenControllerPath)).toContain(
      "@/features/canvas/domain/assetLibrary",
    );
    expect(importSpecifiers(imageGenControllerPath)).not.toContain(
      "@/features/canvas/ui/AssetLibraryModal",
    );
    expect(importSpecifiers(imageGenViewPath)).toContain(
      "@/features/canvas/ui/AssetLibraryModal",
    );
    expect(importSpecifiers(imageGenViewPath)).not.toContain(
      "@/features/canvas/domain/assetLibrary",
    );
  });

  it("keeps generation history queries behind one application boundary", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generationHistory.ts",
    );
    const adapterPath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/freezoneGenerationHistoryGateway.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const legacyOpsPath = resolve(SRC_ROOT, "api/ops.ts");
    const hookPaths = [
      "features/canvas/hooks/useCanvasGenerationHistory.ts",
      "features/canvas/hooks/useNodeGenerationHistory.ts",
    ].map((path) => resolve(SRC_ROOT, path));
    const consumerPaths = [
      ...hookPaths,
      resolve(SRC_ROOT, "features/canvas/hooks/useScriptNodeController.ts"),
      resolve(SRC_ROOT, "features/canvas/hooks/useThreeDWorldNodeController.ts"),
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useCanvasHistoryAssetsModalController.ts",
      ),
      resolve(SRC_ROOT, "features/canvas/ui/NodeGenerationHistory.tsx"),
    ];
    const applicationSource = readFileSync(applicationPath, "utf8");
    const adapterSource = readFileSync(adapterPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const legacyOpsSource = readFileSync(legacyOpsPath, "utf8");
    const hookSources = hookPaths.map((path) => readFileSync(path, "utf8"));
    const consumerSources = consumerPaths.map((path) =>
      readFileSync(path, "utf8"),
    );
    const declarations = [
      ["export function", "queryNodeGenerationHistory("].join(" "),
      ["export async function", "queryCanvasGenerationHistory("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );
    const endpointOwners = sourceFiles(SRC_ROOT)
      .filter((path) => !path.includes(".test."))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "generation-history?limit=${limit}`",
        ),
      )
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual([]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).toContain("const FALLBACK_CONCURRENCY = 6");
    expect(applicationSource).toContain("if (aggregate !== null)");
    expect(implementationOwners).toEqual([
      ["features/canvas/application/generationHistory.ts"],
      ["features/canvas/application/generationHistory.ts"],
    ]);
    expect(new Set(importSpecifiers(adapterPath))).toEqual(
      new Set([
        "@/shared/api/client",
        "@/shared/api/errors",
        "../application/generationHistory",
      ]),
    );
    expect(adapterSource).toContain("apiCall<{");
    expect(adapterSource).toContain("/nodes/${encodeURIComponent(nodeId)}");
    expect(adapterSource).toContain("error.status === 404");
    expect(compositionSource).toContain(
      "queryNodeGenerationHistory(",
    );
    expect(compositionSource).toContain(
      "queryCanvasGenerationHistory(",
    );
    for (const hookSource of hookSources) {
      expect(hookSource).toContain("@/features/canvas/composition");
      expect(hookSource).not.toContain("@/api/ops");
      expect(hookSource).not.toContain("ApiError");
      expect(hookSource).not.toContain("FANOUT_CONCURRENCY");
    }
    for (const consumerSource of consumerSources) {
      expect(consumerSource).not.toContain(
        "FreezoneGenerationHistoryRecord",
      );
      expect(consumerSource).not.toContain("fetchNodeGenerationHistory(");
      expect(consumerSource).not.toContain("fetchCanvasGenerationHistory(");
    }
    expect(endpointOwners).toEqual([
      "features/canvas/infrastructure/freezoneGenerationHistoryGateway.ts",
    ]);
    for (const legacySymbol of [
      "FreezoneGenerationHistoryRecord",
      "fetchNodeGenerationHistory",
      "fetchCanvasGenerationHistory",
    ]) {
      expect(legacyOpsSource).not.toContain(legacySymbol);
    }
    expect(legacyOpsSource).not.toContain("generation-history?limit=");
  });

  it("keeps video reference URL projection in one pure domain module", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoReferenceMedia.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const declarations = [
      ["export function", "referenceImageUrl("].join(" "),
      ["export function", "referenceVideoUrl("].join(" "),
      ["export function", "submittableImageUrl("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(importSpecifiers(domainPath)).toEqual(["./canvasNodes"]);
    expect(domainSource).not.toContain("react");
    expect(domainSource).not.toContain("window");
    expect(domainSource).not.toContain("@/api/");
    expect(domainSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/domain/videoReferenceMedia.ts",
      ]),
    );
    expect(videoNode).toContain(
      "@/features/canvas/domain/videoReferenceMedia",
    );
    expect(videoNode).not.toContain("function referenceImageUrl(");
    expect(videoNode).not.toContain("function referenceVideoUrl(");
    expect(videoNode).not.toContain("function submittableImageUrl(");
  });

  it("keeps dropped video file selection in one application module", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/resolveDroppedVideoFile.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const declaration = [
      "export function",
      "resolveDroppedVideoFile(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual(["./videoFileTypes"]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("@/stores/");
    expect(applicationSource).not.toContain("@/api/");
    expect(implementationOwners).toEqual([
      "features/canvas/application/resolveDroppedVideoFile.ts",
    ]);
    expect(videoNode).toContain(
      "@/features/canvas/application/resolveDroppedVideoFile",
    );
    expect(videoNode).toContain(
      "resolveDroppedVideoFile(event.dataTransfer)",
    );
    expect(videoNode).not.toContain("function resolveDroppedVideoFile(");
  });

  it("keeps reference audio duration validation in application", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/validateVideoReferenceAudioDuration.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserAudioMetadata.ts",
    );
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const probeDeclaration = [
      "export function",
      "probeAudioDurationMs(",
    ].join(" ");
    const useCaseDeclaration = [
      "export async function",
      "validateVideoReferenceAudioDuration(",
    ].join(" ");
    const probeOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(probeDeclaration))
      .map(relativeSource)
      .sort();
    const useCaseOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(useCaseDeclaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual([]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("document");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).toContain(
      "SEEDANCE_2_MAX_REFERENCE_AUDIO_DURATION_MS = 15_200",
    );
    expect(applicationSource).toContain("gateway.probeDurationMs(");
    expect(useCaseOwners).toEqual([
      "features/canvas/application/validateVideoReferenceAudioDuration.ts",
    ]);
    expect(importSpecifiers(infrastructurePath)).toEqual([
      "../application/validateVideoReferenceAudioDuration",
    ]);
    expect(probeOwners).toEqual([
      "features/canvas/infrastructure/browserAudioMetadata.ts",
    ]);
    expect(infrastructureSource).toContain('document.createElement("audio")');
    expect(infrastructureSource).toContain(
      "window.setTimeout(() => finish(null), 8000)",
    );
    expect(infrastructureSource).toContain('audio.removeAttribute("src")');
    expect(compositionSource).toContain(
      "browserAudioMetadataGateway",
    );
    expect(videoNode).toContain("validateVideoReferenceAudioDuration({");
    expect(videoNode).not.toContain(
      "@/features/canvas/infrastructure/browserAudioMetadata",
    );
    expect(videoNode).not.toContain("MAX_AUDIO_TOTAL_DURATION_MS");
    expect(videoNode).not.toContain("probeAudioDurationMs(");
    expect(videoNode).not.toContain("function probeAudioDurationMs(");
  });

  it("keeps URL-based video frame capture in one infrastructure adapter", () => {
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserVideoFrameCapture.ts",
    );
    const compositionSource = readFileSync(compositionPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const declaration = [
      "export async function",
      "captureVideoFrameBlob(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(infrastructurePath)).toEqual([
      "../application/imageData",
    ]);
    expect(implementationOwners).toEqual([
      "features/canvas/infrastructure/browserVideoFrameCapture.ts",
    ]);
    expect(infrastructureSource).not.toContain("react");
    expect(infrastructureSource).not.toContain("@/stores/");
    expect(infrastructureSource).not.toContain("@/api/");
    expect(infrastructureSource).toContain('document.createElement("video")');
    expect(infrastructureSource).toContain('document.createElement("canvas")');
    expect(infrastructureSource).toContain("mediaNeedsCrossOrigin(source)");
    expect(compositionSource).toContain(
      "./infrastructure/browserVideoFrameCapture",
    );
    expect(compositionSource).toContain("captureVideoFrameBlob");
    expect(videoNode).not.toContain(
      "@/features/canvas/infrastructure/browserVideoFrameCapture",
    );
    expect(videoNode).toContain("captureVideoFrameBlob(src, seekSec)");
    expect(videoNode).not.toContain("function captureVideoFrameBlob(");
    expect(videoNode).not.toContain("mediaNeedsCrossOrigin");
  });

  it("keeps browser video frame-strip capture in one infrastructure adapter", () => {
    const compositionPath = resolve(
      SRC_ROOT,
      "features/canvas/composition.ts",
    );
    const contractPath = resolve(
      SRC_ROOT,
      "features/canvas/application/videoFrameStrip.ts",
    );
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserVideoFrameStrip.ts",
    );
    const clipPanelPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoClipPanel.tsx",
    );
    const filmstripPath = resolve(
      SRC_ROOT,
      "features/canvas/compose/filmstrip.ts",
    );
    const contractSource = readFileSync(contractPath, "utf8");
    const compositionSource = readFileSync(compositionPath, "utf8");
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const clipPanelSource = readFileSync(clipPanelPath, "utf8");
    const filmstripSource = readFileSync(filmstripPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const videoNodeView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const declaration = [
      "export async function",
      "captureBrowserVideoFrameStrip(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(contractPath)).toEqual([]);
    expect(new Set(importSpecifiers(infrastructurePath))).toEqual(
      new Set([
        "../application/imageData",
        "../application/videoFrameStrip",
      ]),
    );
    expect(contractSource).not.toContain("react");
    expect(contractSource).not.toContain("document");
    expect(implementationOwners).toEqual([
      "features/canvas/infrastructure/browserVideoFrameStrip.ts",
    ]);
    expect(infrastructureSource).not.toContain("react");
    expect(infrastructureSource).not.toContain("@/stores/");
    expect(infrastructureSource).not.toContain("@/api/");
    expect(infrastructureSource).toContain('document.createElement("video")');
    expect(infrastructureSource).toContain('document.createElement("canvas")');
    expect(clipPanelSource).toContain("captureFrameStrip(resolved, {");
    expect(clipPanelSource).not.toContain('document.createElement("video")');
    expect(clipPanelSource).not.toContain("function captureFrames(");
    expect(filmstripSource).toContain("captureBrowserVideoFrameStrip(");
    expect(filmstripSource).toContain("@/features/canvas/composition");
    expect(filmstripSource).not.toContain(
      "@/features/canvas/infrastructure/browserVideoFrameStrip",
    );
    expect(filmstripSource).not.toContain('document.createElement("video")');
    expect(filmstripSource).not.toContain("function captureFilmstrip(");
    expect(compositionSource).toContain(
      "./infrastructure/browserVideoFrameStrip",
    );
    expect(compositionSource).toContain("captureBrowserVideoFrameStrip");
    expect(videoNode).not.toContain(
      "@/features/canvas/infrastructure/browserVideoFrameStrip",
    );
    expect(videoNodeView).toContain(
      "captureFrameStrip={captureFrameStrip}",
    );
  });

  it("keeps generation output URL projection in one application module", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generationOutputUrl.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const consumerPaths = [
      "features/canvas/application/resumeGeneration.ts",
      "features/canvas/hooks/useTextAnnotationNodeController.ts",
    ];
    const consumerSources = Object.fromEntries(
      consumerPaths.map((path) => [
        path,
        readFileSync(resolve(SRC_ROOT, path), "utf8"),
      ]),
    );
    const completionSource = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/application/completeVideoGenerationTask.ts",
      ),
      "utf8",
    );
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const imageGenNode = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/hooks/useImageGenNodeController.ts",
      ),
      "utf8",
    );
    const declaration = [
      "export function",
      "resolveGenerationOutputUrl(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual([]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("window");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual([
      "features/canvas/application/generationOutputUrl.ts",
    ]);
    for (const source of Object.values(consumerSources)) {
      expect(source).toContain(
        "@/features/canvas/application/generationOutputUrl",
      );
    }
    expect(completionSource).toContain('./generationOutputUrl');
    expect(imageGenNode).not.toContain(
      "@/features/canvas/application/generationOutputUrl",
    );
    expect(imageGenNode).not.toContain("function resolveOutputUrl(");
    expect(
      consumerSources[
        "features/canvas/hooks/useTextAnnotationNodeController.ts"
      ],
    ).not.toContain("function resolveVideoOutputUrl(");
    expect(videoNode).not.toContain("function resolveOutputUrl(");
    expect(consumerSources["features/canvas/application/resumeGeneration.ts"])
      .not.toContain("function resolveUrlFromResult(");
  });

  it("keeps audio reference display-name projection in one application module", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/audioReferenceDisplayName.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/hooks/useVideoNodeController.ts"),
      "utf8",
    );
    const declaration = [
      "export function",
      "resolveAudioReferenceDisplayName(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(applicationPath)).toEqual([]);
    expect(applicationSource).not.toContain("react");
    expect(applicationSource).not.toContain("window");
    expect(applicationSource).not.toContain("@/api/");
    expect(applicationSource).not.toContain("@/stores/");
    expect(implementationOwners).toEqual([
      "features/canvas/application/audioReferenceDisplayName.ts",
    ]);
    expect(videoNode).toContain(
      "@/features/canvas/application/audioReferenceDisplayName",
    );
    expect(videoNode).not.toContain("function audioReferenceFileName(");
    expect(videoNode).toContain("resolveAudioReferenceDisplayName(");
  });

  it("keeps VideoNode album chrome in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoAlbumControls.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNodeView.tsx"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(viewPath).filter(
      (specifier) =>
        specifier === "@xyflow/react" ||
        specifier.startsWith("@xyflow/react/") ||
        specifier === "zustand" ||
        specifier.startsWith("zustand/") ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/api/") ||
        specifier.startsWith("@/features/canvas/application/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const declarations = [
      ["export function", "VideoAlbumDeck("].join(" "),
      ["export function", "VideoAlbumToggleButton("].join(" "),
      ["export function", "VideoAlbumGallery("].join(" "),
    ];
    const implementationOwners = declarations.map((declaration) =>
      sourceFiles(SRC_ROOT)
        .filter((path) => readFileSync(path, "utf8").includes(declaration))
        .map(relativeSource)
        .sort(),
    );

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual(
      declarations.map(() => [
        "features/canvas/nodes/VideoAlbumControls.tsx",
      ]),
    );
    expect(viewSource).toContain("Math.min(totalSlots - 1, 3)");
    expect(viewSource).toContain("Math.hypot(");
    expect(viewSource).toContain("onDownload(url, index)");
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoAlbumControls",
    );
    expect(videoNode).toContain("<VideoAlbumDeck");
    expect(videoNode).toContain("<VideoAlbumToggleButton");
    expect(videoNode).toContain("<VideoAlbumGallery");
    expect(videoNode).not.toContain("albumPointerDownPosRef");
    expect(videoNode).not.toContain("albumUrls.map((url, index)");
    expect(videoNode).not.toContain("title=\"点击设为主视频\"");
  });

  it("keeps box-selection projection in one presentation hook", () => {
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useIsBoxSelecting.ts",
    );
    const hookSource = readFileSync(hookPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "features/canvas/canvasStore.ts"),
      "utf8",
    );
    const declaration = [
      "export function",
      "useIsBoxSelecting(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();
    const consumerPaths = [
      "features/canvas/hooks/useAudioNodeController.ts",
      "features/canvas/hooks/useImageGenNodeController.ts",
      "features/canvas/hooks/useTextAnnotationNodeController.ts",
      "features/canvas/hooks/useVideoNodeController.ts",
    ];

    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useIsBoxSelecting.ts",
    ]);
    expect(importSpecifiers(hookPath)).toEqual([
      "@/features/canvas/canvasStore",
    ]);
    expect(hookSource).toContain("return useCanvasStore((state) => {");
    expect(canvasStore).not.toContain("useIsBoxSelecting");
    for (const consumerPath of consumerPaths) {
      const source = readFileSync(resolve(SRC_ROOT, consumerPath), "utf8");
      expect(source).toContain(
        "@/features/canvas/hooks/useIsBoxSelecting",
      );
      expect(source).not.toContain("useCanvasStore, useIsBoxSelecting");
    }
  });
});
