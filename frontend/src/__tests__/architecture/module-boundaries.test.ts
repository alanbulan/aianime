// Copyright (c) 2026 AI anime
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");
const MODULES_ROOT = resolve(SRC_ROOT, "modules");
const sourceFilesCache = new Map<string, string[]>();
const importSpecifiersCache = new Map<string, string[]>();

// Existing routes are migrated context by context. Their direct data imports
// may decrease, but no route may exceed this measured baseline.
const LEGACY_ROUTE_DATA_IMPORT_MAX: Record<string, number> = {
  "routes/_app/projects.$project/characters.lazy.tsx": 0,
  "routes/_app/projects.$project/episodes.$episode/beats.lazy.tsx": 0,
  "routes/_app/projects.$project/episodes.$episode/compose.lazy.tsx": 4,
  "routes/_app/projects.$project/episodes.$episode/script.lazy.tsx": 0,
  "routes/_app/projects.$project/episodes.tsx": 0,
  "routes/_app/projects.$project/freezone.lazy.tsx": 2,
  "routes/_app/projects.$project/styles.tsx": 0,
  "routes/_app/projects.$project/tasks.tsx": 1,
};

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

  it("does not increase direct route-to-data-layer imports", () => {
    const failures: string[] = [];
    for (const path of sourceFiles(resolve(SRC_ROOT, "routes"))) {
      const relativePath = relativeSource(path);
      const count = importSpecifiers(path).filter(isRawDataImport).length;
      const allowed = LEGACY_ROUTE_DATA_IMPORT_MAX[relativePath] ?? 0;
      if (count > allowed) failures.push(`${relativePath}: ${count} > ${allowed}`);
    }
    expect(failures).toEqual([]);
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
    const directCanvasStoreUsers = sourceFiles(applicationRoot)
      .filter((path) =>
        importSpecifiers(path).includes("@/stores/canvasStore"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
    expect(assetGateway).toContain("uploadFreezoneImage(");
    expect(assetGateway).toContain("{ timeoutMs: false }");
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
    expect(videoNode).toContain(
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

  it("keeps Canvas history rules in the domain model", () => {
    const historyPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasHistory.ts",
    );
    const historyModel = readFileSync(historyPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const canvasSync = readFileSync(
      resolve(SRC_ROOT, "features/freezone/useCanvasSync.ts"),
      "utf8",
    );
    const draftStorage = readFileSync(
      resolve(SRC_ROOT, "features/freezone/canvasDraftStorage.ts"),
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

    expect(forbiddenHistoryImports).toEqual([]);
    expect(historyContractOwners).toEqual([
      "features/canvas/domain/canvasHistory.ts",
    ]);
    expect(historyModel).toContain("export function undoHistory(");
    expect(historyModel).toContain("export function redoHistory(");
    expect(canvasStore).toContain(
      "@/features/canvas/domain/canvasHistory",
    );
    expect(canvasStore).not.toContain("function pushSnapshot(");
    expect(canvasStore).not.toContain("function undoHistory(");
    expect(canvasStore).not.toContain("function redoHistory(");
    expect(canvasSync).toContain(
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
    const historyPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasHistory.ts",
    );
    const changeIntent = readFileSync(changeIntentPath, "utf8");
    const historyModel = readFileSync(historyPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const forbiddenIntentImports = importSpecifiers(changeIntentPath).filter(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "@xyflow/react" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
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

    expect(forbiddenIntentImports).toEqual([]);
    expect(interactionHistoryOwners).toEqual([
      "features/canvas/domain/canvasHistory.ts",
    ]);
    expect(changeIntent).toContain("export function classifyCanvasNodeChanges(");
    expect(changeIntent).toContain(
      "export function hasMeaningfulCanvasEdgeChange(",
    );
    expect(historyModel).toContain(interactionHistoryDeclaration);
    expect(canvasStore).toContain(
      "@/features/canvas/application/canvasChangeIntent",
    );
    expect(canvasView).toContain(
      "@/features/canvas/application/canvasChangeIntent",
    );
    expect(canvasStore).toContain("recordCanvasInteractionHistory(");
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
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(canvasStore).toContain(
      "@/features/canvas/application/canvasImageViewer",
    );
    expect(canvasStore).toContain("imageViewer: createClosedCanvasImageViewer()");
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const canvasSyncCore = readFileSync(
      resolve(SRC_ROOT, "features/freezone/canvasSyncCore.ts"),
      "utf8",
    );
    const draftStorage = readFileSync(
      resolve(SRC_ROOT, "features/freezone/canvasDraftStorage.ts"),
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
    expect(canvasStore).toContain(
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
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
    const placementOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(placementDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenGeometryImports).toEqual([]);
    expect(placementOwners).toEqual([
      "features/canvas/domain/canvasGeometry.ts",
    ]);
    expect(geometryModel).toContain("export function getNodeSize(");
    expect(geometryModel).toContain("export function resolveAbsolutePosition(");
    expect(geometryModel).toContain("export function getDerivedNodePosition(");
    expect(geometryModel).toContain(placementDeclaration);
    expect(canvasStore).toContain(
      "@/features/canvas/domain/canvasGeometry",
    );
    expect(canvasStore).toContain("return findAvailableNodePosition({");
    expect(canvasStore).not.toContain("function getNodeSize(");
    expect(canvasStore).not.toContain("function resolveAbsolutePosition(");
    expect(canvasStore).not.toContain("function getDerivedNodePosition(");
    expect(canvasStore).not.toContain("const collides =");
    expect(canvasStore).not.toContain("const overflowAmount =");
    expect(canvasView).toContain(
      "@/features/canvas/domain/canvasGeometry",
    );
    expect(canvasView).not.toContain(
      "resolveAbsolutePosition, useCanvasStore",
    );
  });

  it("keeps Canvas node position reducers out of the Zustand store", () => {
    const positionsPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasNodePositions.ts",
    );
    const positionsModel = readFileSync(positionsPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(canvasStore).toContain(
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(canvasStore).toContain(
      "@/features/canvas/domain/canvasEdgeNormalization",
    );
    for (const ruleName of legacyRuleNames) {
      expect(canvasStore).not.toContain(`function ${ruleName}(`);
    }
  });

  it("keeps Canvas node hydration in the application layer", () => {
    const hydrationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeHydration.ts",
    );
    const hydrationModel = readFileSync(hydrationPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(hydrationPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );
    const legacyRuleNames = [
      "isNoReferenceNode",
      "nodeHydratePriority",
      "dedupeNodesById",
      "detachMissingParents",
      "sortParentNodesBeforeChildren",
      "normalizeCanvasNodes",
      "createDefaultStoryboardExportOptions",
    ];

    expect(forbiddenImports).toEqual([]);
    expect(hydrationModel).toContain("export function normalizeCanvasNodes(");
    expect(hydrationModel).toContain(
      "export function createDefaultStoryboardExportOptions(",
    );
    expect(canvasStore).toContain(
      "@/features/canvas/application/canvasNodeHydration",
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
    const deletionModel = readFileSync(deletionPath, "utf8");
    const storyboardModel = readFileSync(storyboardPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const forbiddenImports = [deletionPath, storyboardPath].flatMap((path) =>
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

    expect(forbiddenImports).toEqual([]);
    expect(deletionOwners).toEqual([
      "features/canvas/domain/groupSelectionDelete.ts",
    ]);
    expect(deletionModel).toContain(
      "export function collectNodeIdsWithDescendants(",
    );
    expect(deletionModel).toContain(deletionDeclaration);
    expect(storyboardModel).toContain(
      "export function restoreStoryboardEdges(",
    );
    expect(canvasStore).toContain(
      "@/features/canvas/domain/groupSelectionDelete",
    );
    expect(canvasStore).not.toContain(
      "function collectNodeIdsWithDescendants(",
    );
    expect(canvasStore).not.toContain("collectNodeIdsWithDescendants(");
    expect(canvasStore).not.toContain("isPresetManagedNode(");
    expect(canvasStore).not.toContain("const deleteSet =");
    expect(canvasStore).not.toContain("function restoreStoryboardEdges(");
  });

  it("keeps Canvas plain group creation outside the Zustand store", () => {
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
    const groupingModel = readFileSync(groupingPath, "utf8");
    const creationModel = readFileSync(creationPath, "utf8");
    const autoGroupingModel = readFileSync(autoGroupingPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const forbiddenImports = [groupingPath, creationPath, autoGroupingPath].flatMap((path) =>
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
            (path !== creationPath &&
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
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes(groupingDeclaration) ||
          source.includes(creationDeclaration) ||
          source.includes(autoGroupingDeclaration)
        );
      })
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/application/canvasGroupCreation.ts",
      "features/canvas/domain/canvasAutoGrouping.ts",
      "features/canvas/domain/canvasGrouping.ts",
    ]);
    expect(groupingModel).toContain(groupingDeclaration);
    expect(creationModel).toContain(creationDeclaration);
    expect(autoGroupingModel).toContain(autoGroupingDeclaration);
    expect(creationModel).toContain("nodeFactory: NodeFactory");
    expect(creationModel).toContain("resolveCanvasGroupMembers(nodes, nodeIds)");
    expect(canvasStore).toContain(
      "@/features/canvas/application/canvasGroupCreation",
    );
    expect(canvasStore).toContain(
      "@/features/canvas/domain/canvasGrouping",
    );
    expect(canvasStore).toContain(
      "@/features/canvas/domain/canvasAutoGrouping",
    );
    expect(canvasStore).not.toContain("const selectedSet = new Set(existingIds)");
    expect(canvasStore).not.toContain("const absoluteBounds = members.reduce(");
    expect(canvasStore).not.toContain("const SIDE_PADDING = 20 + extraPadding");
    expect(canvasStore).not.toContain("groupDisplayName = opts?.label");
    expect(canvasStore).not.toContain("let enclosing: CanvasNode | null");
    expect(canvasStore).not.toContain("spawnedNodeIds.map(");
    expect(canvasStore).not.toContain("spawnedSet.has(node.id)");
  });

  it("keeps Canvas storyboard node layout out of the Zustand store", () => {
    const layoutPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardNodeLayout.ts",
    );
    const layoutModel = readFileSync(layoutPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const forbiddenImports = importSpecifiers(layoutPath).filter(
      (specifier) =>
        specifier === "zustand" ||
        specifier.startsWith("@/stores/") ||
        specifier.startsWith("@/features/canvas/infrastructure/") ||
        specifier === "@/features/canvas/composition",
    );

    expect(forbiddenImports).toEqual([]);
    expect(layoutModel).toContain(
      "export function resolveStoryboardSplitNodeDimensions(",
    );
    expect(layoutModel).toContain(
      "export function resolveDerivedAspectRatio(",
    );
    expect(canvasStore).toContain(
      "@/features/canvas/application/storyboardNodeLayout",
    );
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(canvasStore).toContain(
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
    const selectionModel = readFileSync(selectionPath, "utf8");
    const viewportModel = readFileSync(viewportPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
      "utf8",
    );
    const forbiddenImports = [selectionPath, viewportPath].flatMap((path) =>
      importSpecifiers(path)
        .filter(
          (specifier) =>
            specifier === "zustand" ||
            specifier.startsWith("@/stores/") ||
            specifier.startsWith("@/features/canvas/application/") ||
            specifier.startsWith("@/features/canvas/infrastructure/"),
        )
        .map((specifier) => `${relativeSource(path)}: ${specifier}`),
    );

    expect(forbiddenImports).toEqual([]);
    expect(selectionModel).toContain("export function resolveSelectedNodeId(");
    expect(selectionModel).toContain("export function resolveActiveToolDialog(");
    expect(viewportModel).toContain("export function replaceViewportBookmark(");
    expect(canvasStore).toContain(
      "@/features/canvas/domain/canvasSelection",
    );
    expect(canvasStore).toContain("replaceViewportBookmark(current, index, bookmark)");
    expect(canvasStore).not.toContain("function resolveSelectedNodeId(");
    expect(canvasStore).not.toContain("function resolveActiveToolDialog(");
    expect(canvasStore.match(/create<CanvasState>/g)).toHaveLength(1);
  });

  it("keeps Canvas image node layout rules out of the Zustand store", () => {
    const layoutPath = resolve(
      SRC_ROOT,
      "features/canvas/application/imageNodeLayout.ts",
    );
    const layoutModel = readFileSync(layoutPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(canvasStore).toContain(
      "@/features/canvas/application/imageNodeLayout",
    );
    for (const ruleName of ruleNames) {
      expect(layoutModel).toContain(`export function ${ruleName}(`);
      expect(canvasStore).not.toContain(`function ${ruleName}(`);
    }
  });

  it("keeps Canvas node data updates out of the Zustand store", () => {
    const nodeDataPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeData.ts",
    );
    const nodeDataModel = readFileSync(nodeDataPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    const ruleOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(updateDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(ruleOwners).toEqual([
      "features/canvas/application/canvasNodeData.ts",
    ]);
    expect(nodeDataModel).toContain(updateDeclaration);
    expect(nodeDataModel).toContain("maybeApplyImageAutoResize(");
    expect(canvasStore).toContain(
      "@/features/canvas/application/canvasNodeData",
    );
    expect(canvasStore).not.toContain("const hasDataChange = Object.entries(data)");
    expect(canvasStore).not.toContain("const mergedData = {\n          ...node.data");
  });

  it("keeps Canvas node type conversion out of the Zustand store", () => {
    const conversionPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasNodeConversion.ts",
    );
    const conversionModel = readFileSync(conversionPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(conversionModel).toContain("nodeCatalog.getDefinition(newType)");
    expect(canvasStore).toContain(
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(canvasStore).toContain(
      "@/features/canvas/application/canvasNodeDuplication",
    );
    expect(canvasStore).toContain("canvasNodeFactory,");
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(canvasStore).toContain(
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(canvasStore).toContain(
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
    const connectionModel = readFileSync(connectionPath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) =>
        readFileSync(path, "utf8").includes(validationDeclaration),
      )
      .map(relativeSource)
      .sort();

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/domain/canvasConnection.ts",
    ]);
    expect(connectionModel).toContain(validationDeclaration);
    expect(canvasStore).toContain(
      "@/features/canvas/domain/canvasConnection",
    );
    expect(canvasStore).not.toContain("nodeHasSourceHandle(");
    expect(canvasStore).not.toContain("nodeHasTargetHandle(");
    expect(canvasStore).not.toContain("isUpstreamConnectionAllowed(");
    expect(canvasStore).not.toContain(
      "targetNode?.type === CANVAS_NODE_TYPES.threeDWorld",
    );
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

  it("keeps Asset & World callers on its public API", () => {
    const moduleRoot = resolve(SRC_ROOT, "modules/asset_world");
    const legacySketchQueries = readFileSync(
      resolve(SRC_ROOT, "lib/queries/sketches.ts"),
      "utf8",
    );
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
    expect(legacySketchQueries).not.toContain("useBeatBackgroundAnchors");
    expect(legacySketchQueries).not.toContain(
      "useBeatDirectorStageManifest",
    );
    expect(legacySketchQueries).not.toContain(
      "useCropBeatBackgroundAnchor",
    );
    expect(legacySketchQueries).not.toContain(
      "useDirectorControlFrameStatus",
    );
    expect(legacySketchQueries).not.toContain(
      "useUpdateBeatBackgroundAnchor",
    );
    expect(legacySketchQueries).not.toContain(
      "useUploadBeatBackgroundAnchor",
    );
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
    const legacySketchQueries = readFileSync(
      resolve(SRC_ROOT, "lib/queries/sketches.ts"),
      "utf8",
    );
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
    expect(legacySketchQueries).not.toContain("useAssignColors");
    expect(legacySketchQueries).not.toContain("useDetectIdentities");
    expect(legacySketchQueries).not.toContain("useDirectorControlToSketch");
    expect(legacySketchQueries).not.toContain("director-control-to-sketch");
    expect(legacySketchQueries).not.toContain("useGenerateSketches");
    expect(legacySketchQueries).not.toContain("useRegenerateGrid");
    expect(legacySketchQueries).not.toContain("useRegenerateSketches");
    expect(legacySketchQueries).not.toContain("useRegenerateRenderBeats");
    expect(legacySketchQueries).not.toContain("useGrids(");
    expect(legacySketchQueries).not.toContain("useGridsByBeat");
    expect(legacySketchQueries).not.toContain("useRebuildPoolIndex");
    expect(legacySketchQueries).not.toContain("export interface PoolImage");
    expect(legacySketchQueries).not.toContain("StalePoolSelectError");
    expect(legacySketchQueries).not.toContain("usePoolSelect");
    expect(legacySketchQueries).not.toContain("useUploadBeatImage");
    expect(legacySketchQueries).not.toContain("BeatImageUploadResult");
    expect(legacySketchQueries).not.toContain("useCutGrid");
    expect(legacySketchQueries).not.toContain("useExportGridPrompt");
    expect(legacySketchQueries).not.toContain("useSketchGridPreview");
    expect(legacySketchQueries).not.toContain("useUploadGrid");
    expect(legacySketchQueries).not.toContain("GridUploadResult");
    expect(legacySketchQueries).not.toContain("GridPromptResult");
    expect(legacySketchQueries).not.toContain("GridSketchPreviewResult");
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
});
