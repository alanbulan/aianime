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
    expect(
      existsSync(resolve(SRC_ROOT, "lib/queries/sketch-pose-editor.ts")),
    ).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "lib/sketch-pose-editor-model.ts"))).toBe(
      false,
    );
    expect(existsSync(resolve(SRC_ROOT, "types/render-plan.ts"))).toBe(false);
    expect(legacySketchQueries).not.toContain("useAssignColors");
    expect(legacySketchQueries).not.toContain("useDetectIdentities");
    expect(legacySketchQueries).not.toContain("useGenerateSketches");
    expect(legacySketchQueries).not.toContain("useRegenerateGrid");
    expect(legacySketchQueries).not.toContain("useRegenerateSketches");
    expect(legacySketchQueries).not.toContain("useRegenerateRenderBeats");
    expect(legacySketchQueries).not.toContain("useGrids(");
    expect(legacySketchQueries).not.toContain("useGridsByBeat");
    expect(legacySketchQueries).not.toContain("useRebuildPoolIndex");
    expect(legacySketchQueries).not.toContain("export interface PoolImage");
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
