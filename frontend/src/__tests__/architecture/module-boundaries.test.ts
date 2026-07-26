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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
          specifier !== "@/stores/canvasStore") ||
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
    expect(controllerSource).toContain("@/stores/canvasStore");
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
    const historyAssetsView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/ui/CanvasHistoryAssetsModal.tsx"),
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
    expect(historyAssetsView).toContain("CanvasHistoryAssetPlacement");
    expect(quickActionView).not.toContain(
      "placement?: { index: number; total: number }",
    );
    expect(historyAssetsView).not.toContain(
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
    const hookPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasSkillRegistry.ts",
    );
    const controllerPath = resolve(
      SRC_ROOT,
      "features/canvas/hooks/useCanvasNodeCatalogController.ts",
    );
    const hookModel = readFileSync(hookPath, "utf8");
    const controllerModel = readFileSync(controllerPath, "utf8");
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

    expect(forbiddenImports).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useCanvasSkillRegistry.ts",
    ]);
    expect(controllerOwners).toEqual([
      "features/canvas/hooks/useCanvasNodeCatalogController.ts",
    ]);
    expect(hookModel).toContain("loadSkillRegistry()");
    expect(hookModel).toContain("cancelled = true");
    expect(controllerModel).toContain("./useCanvasSkillRegistry");
    expect(controllerModel).toContain("getSkillRegistry");
    expect(controllerModel).toContain("nodeCatalog.getDefinition");
    expect(controllerModel).toContain("translateSkillName");
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
    expect(controllerSource).toContain("@/stores/canvasStore");
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

  it("keeps Canvas persistence owned by useCanvasSync", () => {
    const canvasView = readFileSync(
      resolve(SRC_ROOT, "features/canvas/Canvas.tsx"),
      "utf8",
    );
    const canvasSync = readFileSync(
      resolve(SRC_ROOT, "features/freezone/useCanvasSync.ts"),
      "utf8",
    );

    expect(canvasView).not.toContain("persistCanvasSnapshot");
    expect(canvasView).not.toContain("scheduleCanvasPersist");
    expect(canvasView).not.toContain("saveTimerRef");
    expect(canvasView).not.toContain("isRestoringCanvasRef");
    expect(canvasSync).toContain(
      "const unsubscribeCanvas = useCanvasStore.subscribe((state, prev) =>",
    );
    expect(canvasSync).toContain("void scheduleSave({");
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    const hydrationModel = readFileSync(hydrationPath, "utf8");
    const normalizationModel = readFileSync(normalizationPath, "utf8");
    const documentLifecycleSlice = readFileSync(
      resolve(
        SRC_ROOT,
        "features/canvas/infrastructure/zustandCanvasDocumentLifecycleSlice.ts",
      ),
      "utf8",
    );
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(normalizationModel).toContain("normalizeCanvasNodes(scoped.nodes)");
    expect(normalizationModel).toContain(
      "normalizeEdgesWithNodes(scoped.edges, nodes)",
    );
    expect(hydrationModel).toContain(
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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

  it("keeps Canvas storyboard node layout out of the Zustand store", () => {
    const layoutPath = resolve(
      SRC_ROOT,
      "features/canvas/application/storyboardNodeLayout.ts",
    );
    const derivedCreationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/canvasDerivedNodeCreation.ts",
    );
    const layoutModel = readFileSync(layoutPath, "utf8");
    const derivedCreationModel = readFileSync(derivedCreationPath, "utf8");
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
    expect(derivedCreationModel).toContain(
      "from './storyboardNodeLayout'",
    );
    expect(canvasStore).not.toContain(
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(conversionModel).toContain("nodeCatalog.getDefinition(newType)");
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(opsSource).toContain(
      'import type { CameraMovementPreset } from "@/features/canvas/domain/cameraMovementPresets";',
    );
    expect(opsSource).not.toContain(
      "export interface FreezoneVideoCameraTemplate",
    );
    expect(hookSource).not.toContain("type FreezoneVideoCameraTemplate");
  });

  it("keeps Canvas asset extraction independent from media URL infrastructure", () => {
    const assetPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/canvasAssets.ts",
    );
    const assetSource = readFileSync(assetPath, "utf8");
    const historyViewSource = readFileSync(
      resolve(SRC_ROOT, "features/canvas/ui/CanvasHistoryAssetsModal.tsx"),
      "utf8",
    );

    expect(importSpecifiers(assetPath)).not.toContain("@/lib/media-url");
    expect(assetSource).toContain("resolveMediaUrl: CanvasMediaUrlResolver");
    expect(historyViewSource).toContain(
      "extractCanvasAssets(nodes, resolveMediaUrl)",
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas transient interaction state in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasTransientInteractionSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas history state and commands in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasHistorySlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    ]));
    expect(canvasStateHeader).toContain("CanvasHistorySlice");
    expect(canvasStore).toContain("...createZustandCanvasHistorySlice({");
    expect(canvasStore).not.toContain("history: { past: [], future: [] }");
    expect(canvasStore).not.toContain("navigateCanvasHistory(state");
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas graph mutations in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasGraphMutationSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas document lifecycle in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasDocumentLifecycleSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    ]));
    expect(canvasStateHeader).toContain("CanvasDocumentLifecycleSlice");
    expect(canvasStore).toContain(
      "...createZustandCanvasDocumentLifecycleSlice({",
    );
    expect(canvasStore).not.toContain("userEditsSinceHydrate: 0");
    expect(canvasStore).not.toContain("pendingClearIntent: false");
    expect(canvasStore).not.toContain("normalizeCanvasData(");
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas node mutations in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasNodeMutationSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas derived node creation in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas node deletion in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasNodeDeletionSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas group lifecycle in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasGroupLifecycleSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas storyboard group mutations in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasStoryboardGroupSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps Canvas selection state in one Zustand slice", () => {
    const slicePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/zustandCanvasSelectionSlice.ts",
    );
    const sliceSource = readFileSync(slicePath, "utf8");
    const canvasStore = readFileSync(
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
    expect(sliceSource).not.toContain("@/stores/canvasStore");
  });

  it("keeps VideoNode subtitle-erase controls in one presentation view", () => {
    const viewPath = resolve(
      SRC_ROOT,
      "features/canvas/nodes/VideoSubtitleEraseControls.tsx",
    );
    const viewSource = readFileSync(viewPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
    expect(videoNode).toContain(
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
    expect(videoNode).toContain("buildVideoMetadataPatch(");
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
    expect(videoNode).toContain("options={COUNT_OPTIONS}");
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
    expect(videoNode).toContain("aspectRatioOptions={ASPECT_RATIOS}");
    expect(videoNode).toContain("clampVideoDuration(value, durationBounds)");
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
    expect(videoNode).toContain(
      "@/features/canvas/nodes/videoGenerationModeOptions",
    );
    expect(videoNode).toContain(
      "@/features/canvas/nodes/VideoGenerationModeSelect",
    );
    expect(videoNode).toContain("resolveVideoGenerationModeOptions({");
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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

  it("keeps video reference URL projection in one pure domain module", () => {
    const domainPath = resolve(
      SRC_ROOT,
      "features/canvas/domain/videoReferenceMedia.ts",
    );
    const domainSource = readFileSync(domainPath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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

  it("keeps browser audio duration probing in one infrastructure adapter", () => {
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserAudioMetadata.ts",
    );
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
      "utf8",
    );
    const declaration = [
      "export function",
      "probeAudioDurationMs(",
    ].join(" ");
    const implementationOwners = sourceFiles(SRC_ROOT)
      .filter((path) => readFileSync(path, "utf8").includes(declaration))
      .map(relativeSource)
      .sort();

    expect(importSpecifiers(infrastructurePath)).toEqual([]);
    expect(implementationOwners).toEqual([
      "features/canvas/infrastructure/browserAudioMetadata.ts",
    ]);
    expect(infrastructureSource).toContain('document.createElement("audio")');
    expect(infrastructureSource).toContain(
      "window.setTimeout(() => finish(null), 8000)",
    );
    expect(infrastructureSource).toContain('audio.removeAttribute("src")');
    expect(videoNode).toContain(
      "@/features/canvas/infrastructure/browserAudioMetadata",
    );
    expect(videoNode).not.toContain("function probeAudioDurationMs(");
  });

  it("keeps URL-based video frame capture in one infrastructure adapter", () => {
    const infrastructurePath = resolve(
      SRC_ROOT,
      "features/canvas/infrastructure/browserVideoFrameCapture.ts",
    );
    const infrastructureSource = readFileSync(infrastructurePath, "utf8");
    const videoNode = readFileSync(
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
    expect(videoNode).toContain(
      "@/features/canvas/infrastructure/browserVideoFrameCapture",
    );
    expect(videoNode).not.toContain("function captureVideoFrameBlob(");
    expect(videoNode).not.toContain("mediaNeedsCrossOrigin");
  });

  it("keeps generation output URL projection in one application module", () => {
    const applicationPath = resolve(
      SRC_ROOT,
      "features/canvas/application/generationOutputUrl.ts",
    );
    const applicationSource = readFileSync(applicationPath, "utf8");
    const consumerPaths = [
      "features/canvas/application/resumeGeneration.ts",
      "features/canvas/nodes/ImageGenNode.tsx",
      "features/canvas/nodes/TextAnnotationNode.tsx",
      "features/canvas/nodes/VideoNode.tsx",
    ];
    const consumerSources = Object.fromEntries(
      consumerPaths.map((path) => [
        path,
        readFileSync(resolve(SRC_ROOT, path), "utf8"),
      ]),
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
    expect(consumerSources["features/canvas/nodes/ImageGenNode.tsx"])
      .not.toContain("function resolveOutputUrl(");
    expect(consumerSources["features/canvas/nodes/TextAnnotationNode.tsx"])
      .not.toContain("function resolveVideoOutputUrl(");
    expect(consumerSources["features/canvas/nodes/VideoNode.tsx"])
      .not.toContain("function resolveOutputUrl(");
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "features/canvas/nodes/VideoNode.tsx"),
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
      resolve(SRC_ROOT, "stores/canvasStore.ts"),
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
      "features/canvas/nodes/AudioNode.tsx",
      "features/canvas/nodes/ImageGenNode.tsx",
      "features/canvas/nodes/TextAnnotationNode.tsx",
      "features/canvas/nodes/VideoNode.tsx",
    ];

    expect(implementationOwners).toEqual([
      "features/canvas/hooks/useIsBoxSelecting.ts",
    ]);
    expect(importSpecifiers(hookPath)).toEqual([
      "@/stores/canvasStore",
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
