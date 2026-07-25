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
    const beatsPageViewSource = readFileSync(
      resolve(moduleRoot, "presentation/BeatsPageView.tsx"),
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
    const singleBeatPanelSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/single-beat-panel.tsx",
      ),
      "utf8",
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
    const actionPanelSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/action-panel.tsx",
      ),
      "utf8",
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
    expect(beatsPageViewSource).toContain("<SketchStudioActionsView");
    expect(sketchStudioControllerSource).toContain("queries.useScript");
    expect(sketchStudioControllerSource).toContain(
      "dependencies.useCharacters",
    );
    expect(sketchStudioViewSource).not.toContain("useScript(");
    expect(sketchStudioViewSource).not.toContain("useCharacters(");
    expect(sketchStudioViewSource).not.toContain("useEpisodeBeats(");
    expect(sketchStudioViewSource).not.toContain("useEpisodeDetail(");
    expect(singleBeatPanelSource).toContain("<SingleBeatPanelView");
    expect(singleBeatPanelSource).toContain(
      "useSingleBeatPanelController({",
    );
    expect(singleBeatPanelSource).toContain(
      "renderSectionContent={renderSectionContent}",
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
    expect(actionPanelSource).toContain("<ActionPanelView");
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
    const batchBarSource = readFileSync(
      resolve(SRC_ROOT, "components/episode/beat-workbench/batch-bar.tsx"),
      "utf8",
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
    const productionPublicSource = readFileSync(
      resolve(SRC_ROOT, "modules/production/public.ts"),
      "utf8",
    );
    const renderPlanDialogSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/render-plan-dialog.tsx",
      ),
      "utf8",
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
    const sketchCropDialogSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/sketch-crop-dialog.tsx",
      ),
      "utf8",
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
    const sketchPoseEditorDialogSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/sketch-pose-editor-dialog.tsx",
      ),
      "utf8",
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
    const videoPaneSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/video-pane.tsx",
      ),
      "utf8",
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
    const sketchSectionSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/sketch-section.tsx",
      ),
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
    const renderSectionSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/render-section.tsx",
      ),
      "utf8",
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
    const renderGridGallerySource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/render-grid-gallery.tsx",
      ),
      "utf8",
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
    const sketchGridGallerySource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/sketch-grid-gallery.tsx",
      ),
      "utf8",
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
    const narratorVoicePanelSource = readFileSync(
      resolve(
        SRC_ROOT,
        "components/episode/beat-workbench/narrator-voice-panel.tsx",
      ),
      "utf8",
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
    expect(videoPaneSource).toContain("<VideoPaneView");
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
    expect(videoPaneSource).toContain("controller={controller}");
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
    expect(sketchSectionSource).toContain("<SketchSectionView");
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
    expect(sketchSectionSource).not.toContain("toast.");
    expect(sketchSectionControllerSource).toContain(
      "createUseSketchSectionController",
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
    expect(sketchSectionViewSource).toContain('type="file"');
    expect(sketchSectionViewSource).toContain("<AlertDialog");
    expect(sketchSectionViewSource).toContain("MEDIA_THUMB_CLASS");
    expect(renderSectionSource).toContain("<RenderSectionView");
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
    expect(renderSectionControllerSource).toContain("useTaskController(");
    expect(renderSectionControllerSource).toContain("handleRegen");
    expect(renderSectionControllerSource).toContain(
      "handleChooseBackground",
    );
    expect(renderSectionControllerSource).toContain("handleOpenFreezone");
    expect(renderSectionControllerSource).not.toContain("@/features/");
    expect(renderSectionControllerSource).not.toContain("@/stores/");
    expect(renderSectionControllerSource).not.toContain("document.");
    expect(renderGridGallerySource).toContain("<RenderGridGalleryView");
    expect(renderGridGallerySource).toContain("<RenderGridCardView");
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
    expect(sketchGridGallerySource).toContain("<SketchGridGalleryView");
    expect(sketchGridGallerySource).toContain("<SketchGridCardView");
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
    expect(batchBarControllerSource).toContain(
      "episodeAudioModelCallCount(",
    );
    expect(batchBarSource).not.toContain(
      "export function episodeAudioModelCallCount",
    );
    expect(batchBarSource).not.toContain("normalizeAudioTypeForCost");
    expect(batchBarSource).toContain("useBatchBarController({");
    expect(batchBarSource).toContain("<BatchBarView");
    expect(batchBarSource).toContain("controller={controller}");
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
    expect(renderPlanDialogSource).toContain("<RenderPlanDialogView");
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
    expect(sketchCropDialogSource).toContain("<SketchCropDialogView");
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
      "<SketchPoseEditorDialogView",
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
    expect(narratorVoicePanelSource).toContain("<NarratorVoicePanelView");
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
