// Copyright (c) 2026 AI anime
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ReactNode } from "react";

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          common: {
            loading: "Loading",
            upload: "Upload",
            error: "Error",
            stop: "Stop",
            reupload: "Reupload",
            delete: "Delete",
            close: "Close",
            clear: "Clear",
          },
          ingest: {
            title: "Import Novel",
            subtitle: "Upload your novel file.",
            dropzoneHint: "Click or drop your novel file here",
            supportedFormats: "Supports .txt / .md / .docx",
            restoredFilename: "Imported novel",
            previewHeading: "Novel Structure Preview",
            resultHeading: "Import Results",
            resultViews: {
              chapters: "Chapter Preview",
              graph: "Relationship Graph",
            },
            knowledgeGraph: {
              title: "Knowledge Graph",
              stats: "{{nodes}} nodes · {{edges}} relationships",
              visibleStats: "Showing {{visible}} of {{total}} nodes",
              connections: "{{count}} connections",
              relationships: "Relationships",
              properties: "Node details",
              searchPlaceholder: "Search entities or properties",
              filterType: "Filter node type",
              allTypes: "All types",
              empty: "No matching nodes",
              emptyHint: "Clear the filters.",
              interactionHint: "Drag to pan",
              truncated: "Showing core relationships",
              zoomIn: "Zoom in",
              zoomOut: "Zoom out",
              resetView: "Reset view",
              expand: "Expand graph",
              collapse: "Collapse graph",
              loadFailed: "Knowledge graph is unavailable",
              loadFailedHint: "Try again later.",
              retry: "Reload",
              types: {
                Entity: "Entity",
                Unknown: "Other",
              },
              relations: {
                appears_in: "appears in",
              },
            },
            inputMode: { upload: "Upload Novel", paste: "Paste Text" },
            sourceHint: {
              uploadActive: "Uploaded file active",
              pasteActive: "Pasted text active",
            },
            pastePlaceholder: "Paste novel text here",
            startIngest: "Start Import",
            processing: "Processing...",
            status: {
              uploaded: "Uploaded",
              importing: "Importing",
              completed: "Completed",
              stopped: "Stopped",
              failed: "Failed",
            },
            saveSettings: "Save Settings",
            settingsSaved: "Project settings saved",
            settingsSaveFailed: "Failed to save project settings",
            selectPlaceholder: "Select",
            textModel: "Knowledge text model",
            embeddingModel: "Knowledge embedding model",
            modelPlaceholder: "Select a model",
            modelCatalogFailed: "Model catalog failed",
            projectType: "Project type",
            projectTypeLocked: "Project type is locked after import",
            projectTypes: {
              narrated: "Narrated",
              drama: "Premium drama",
            },
            firstPerson: "First person",
            thirdPerson: "Third person",
            ethnicity: "Default unspecified people",
            visualStyles: {
              chinesePeriodDrama: "Chinese period drama",
              anime: "Anime",
              guomanFantasy: "3D Xianxia Guoman",
              postApocalyptic: "Post-apocalyptic",
              realistic: "Realistic",
            },
            ethnicities: {
              chinese: "Chinese",
              japanese: "Japanese",
              korean: "Korean",
              western: "Western",
              mixed: "Mixed",
            },
          },
        },
      },
    },
  });
});

const mocks = vi.hoisted(() => ({
  projectConfig: {
    spine_template: "drama",
    visual_style: "chinese_period_drama",
    narration_style: "first_person",
    ethnicity: "Chinese",
  },
  updateProject: vi.fn(),
  uploadNovel: vi.fn(),
  startIngest: vi.fn(),
  chaptersData: undefined as
    | {
        total_chars: number;
        count: number;
        preview_only?: boolean;
        chapters: {
          number: number;
          title?: string | null;
          content?: string;
          word_count?: number;
          char_count?: number;
        }[];
      }
    | undefined,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  ingestTasks: [] as { task_type: string; episode: number; status: string }[],
  // 模拟 React Query 的 isFetchedAfterMount：默认 true（已挂载后刷到新数据）；
  // stale-cache 竞态用例把它设为 false，表示当前 data 还是挂载前的旧缓存。
  ingestTasksFetchedAfterMount: true,
  knowledgeGraphEnabled: false,
  refetchKnowledgeGraph: vi.fn(),
  taskStreamOnComplete: null as null | (() => void | Promise<void>),
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  type SelectContextValue = {
    value?: string;
    onValueChange?: (value: string) => void;
  };
  const SelectContext = React.createContext<SelectContextValue>({});

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      children: ReactNode;
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: ({
      children,
      placeholder,
    }: {
      children?: ((value: string) => ReactNode) | ReactNode;
      placeholder?: ReactNode;
    }) => {
      const ctx = React.useContext(SelectContext);
      if (typeof children === "function") {
        return <span>{ctx.value ? children(ctx.value) : placeholder}</span>;
      }
      return <span>{children ?? placeholder}</span>;
    },
    SelectContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: ReactNode;
    }) => {
      const ctx = React.useContext(SelectContext);
      return (
        <button
          type="button"
          role="option"
          onClick={() => ctx.onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
  };
});

vi.mock("@/modules/project_workspace/public", () => ({
  useProject: () => ({
    data: mocks.projectConfig,
  }),
  useUpdateProject: () => ({
    mutateAsync: mocks.updateProject,
    isPending: false,
  }),
}));

vi.mock("@/modules/model_usage/public", () => ({
  useCommercialModelCatalog: (operation: string) => ({
    data: {
      catalogVersion: "test",
      items: [
        {
          id: operation.toLowerCase(),
          code:
            operation === "TEXT"
              ? "cloud-text-standard"
              : "cloud-embedding-standard",
          displayName:
            operation === "TEXT" ? "Text standard" : "Embedding standard",
          operation,
          capabilities: {},
          parameterSchema: {},
        },
      ],
    },
    error: null,
    isLoading: false,
  }),
}));

vi.mock("@/modules/story_intake/application/query-hooks", () => ({
  createStoryIntakeQueryHooks: () => ({
    useChapters: () => ({ data: mocks.chaptersData, isFetching: false }),
    useKnowledgeGraph: (_project: string, enabled: boolean) => {
      mocks.knowledgeGraphEnabled = enabled;
      return {
        data: enabled
          ? {
              nodes: [
                {
                  id: "node-1",
                  label: "林昭",
                  type: "Entity",
                  degree: 1,
                  properties: { description: "雨巷少年" },
                },
                {
                  id: "node-2",
                  label: "雨巷",
                  type: "Entity",
                  degree: 1,
                  properties: {},
                },
              ],
              edges: [
                {
                  id: "edge-1",
                  source: "node-1",
                  target: "node-2",
                  relation: "appears_in",
                  properties: {},
                },
              ],
              total_nodes: 2,
              total_edges: 1,
              truncated: false,
            }
          : undefined,
        isLoading: false,
        isError: false,
        refetch: mocks.refetchKnowledgeGraph,
      };
    },
    useUploadNovel: () => ({
      mutateAsync: mocks.uploadNovel,
      isPending: false,
    }),
    useStartIngest: () => ({
      mutateAsync: mocks.startIngest,
      isPending: false,
    }),
  }),
}));

vi.mock("@/modules/asset_world/public", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/asset_world/public")
  >()),
  useCharacters: () => ({ data: { ok: true, data: [] } }),
}));

vi.mock("@/modules/task_execution/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  awaitTaskCompletion: vi.fn(),
  useCancelTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTasks: () => ({
    data: { ok: true, data: mocks.ingestTasks },
    isFetchedAfterMount: mocks.ingestTasksFetchedAfterMount,
  }),
}));

vi.mock("@/modules/task_execution/presentation/useTaskStream", () => ({
  useTaskStream: (options: { onComplete?: () => void | Promise<void> }) => {
    mocks.taskStreamOnComplete = options.onComplete ?? null;
    return {
      status: "idle",
      progress: 0,
      currentTask: "",
      result: null,
      error: null,
      logs: [],
    };
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

import { IngestPageContent } from "@/routes/_app/projects.$project/ingest";

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.projectConfig = {
    spine_template: "drama",
    visual_style: "chinese_period_drama",
    narration_style: "first_person",
    ethnicity: "Chinese",
  };
  mocks.updateProject.mockReset();
  mocks.updateProject.mockResolvedValue({ ok: true, data: mocks.projectConfig });
  mocks.uploadNovel.mockReset();
  mocks.startIngest.mockReset();
  mocks.chaptersData = undefined;
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.ingestTasks = [];
  mocks.ingestTasksFetchedAfterMount = true;
  mocks.knowledgeGraphEnabled = false;
  mocks.refetchKnowledgeGraph.mockReset();
  mocks.taskStreamOnComplete = null;
});

describe("IngestPage settings save", () => {
  it("advertises text, markdown and docx uploads", () => {
    const { container } = render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    expect(
      screen.getByText("Supports .txt / .md / .docx"),
    ).toBeInTheDocument();
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).toHaveAttribute("accept", ".txt,.md,.docx");
  });

  it("saves project settings without uploading or starting ingest", async () => {
    const user = userEvent.setup();

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    const saveButton = screen.getByRole("button", { name: /save settings/i });
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByRole("option", { name: "Narrated" }));
    await user.click(screen.getByRole("option", { name: "Anime" }));
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() =>
      expect(mocks.updateProject).toHaveBeenCalledWith({
        spine_template: "narrated",
        visual_style: "anime",
        narration_style: "first_person",
        ethnicity: "Chinese",
      }),
    );
    expect(mocks.uploadNovel).not.toHaveBeenCalled();
    expect(mocks.startIngest).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Project settings saved");
  });

  it("hides first/third person options for premium drama and reveals them for narrated", async () => {
    const user = userEvent.setup();

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    // Default config is premium drama → no narration perspective options.
    expect(
      screen.queryByRole("option", { name: "First person" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Third person" }),
    ).not.toBeInTheDocument();

    // Switching to narrated reveals the perspective entry.
    await user.click(screen.getByRole("option", { name: "Narrated" }));

    expect(
      screen.getByRole("option", { name: "First person" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Third person" }),
    ).toBeInTheDocument();
  });

  it("does not persist narration_style when saving a premium drama", async () => {
    const user = userEvent.setup();

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    // Stay on premium drama (default), only change the visual style so save fires.
    await user.click(screen.getByRole("option", { name: "Anime" }));
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(mocks.updateProject).toHaveBeenCalled());
    const payload = mocks.updateProject.mock.calls[0][0];
    expect(payload).not.toHaveProperty("narration_style");
    expect(payload).toMatchObject({
      spine_template: "drama",
      visual_style: "anime",
      ethnicity: "Chinese",
    });
  });

  it("hides the reupload button once chapters are imported", async () => {
    // Imported state: chapters exist, no in-session upload -> previewStatus "completed".
    mocks.chaptersData = {
      total_chars: 10,
      count: 1,
      chapters: [{ number: 1, title: "第一章", char_count: 10 }],
    };

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    // The imported summary is shown (file card + preview)...
    expect(screen.getByText("第一章")).toBeInTheDocument();
    // ...but file replacement/destructive actions are gone once import succeeded.
    expect(screen.queryByRole("button", { name: "Reupload" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("loads the knowledge graph only after its result tab is opened", async () => {
    const user = userEvent.setup();
    mocks.chaptersData = {
      total_chars: 10,
      count: 1,
      chapters: [{ number: 1, title: "第一章", char_count: 10 }],
    };

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    expect(mocks.knowledgeGraphEnabled).toBe(false);
    await user.click(screen.getByRole("tab", { name: "Relationship Graph" }));

    expect(mocks.knowledgeGraphEnabled).toBe(true);
    expect(
      await screen.findByRole("heading", { name: "Knowledge Graph" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 nodes · 1 relationships")).toBeInTheDocument();
  });

  it("does not expose the graph for an upload-only chapter preview", () => {
    mocks.chaptersData = {
      total_chars: 10,
      count: 1,
      preview_only: true,
      chapters: [{ number: 1, title: "第一章", char_count: 10 }],
    };

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    expect(
      screen.queryByRole("tab", { name: "Relationship Graph" }),
    ).not.toBeInTheDocument();
    expect(mocks.knowledgeGraphEnabled).toBe(false);
  });

  it("refreshes chapters and invalidates the graph after ingestion completes", async () => {
    const refetchSpy = vi.spyOn(QueryClient.prototype, "refetchQueries");
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    expect(mocks.taskStreamOnComplete).not.toBeNull();
    await act(async () => {
      await mocks.taskStreamOnComplete?.();
    });

    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: ["projects", "demo", "chapters"],
      type: "active",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["projects", "demo", "knowledge-graph"],
    });

    refetchSpy.mockRestore();
    invalidateSpy.mockRestore();
  });

  it("falls back to chapter content title and legacy char count in preview", () => {
    mocks.chaptersData = {
      total_chars: 24,
      count: 2,
      chapters: [
        {
          number: 1,
          title: null,
          content: "第一章 启程\n秦王入宫。",
          word_count: 12,
        },
        {
          number: 2,
          title: "第二章 风起",
          char_count: 12,
        },
      ],
    };

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    expect(screen.getByText("第一章 启程")).toBeInTheDocument();
    expect(screen.getByText("第二章 风起")).toBeInTheDocument();
    expect(screen.getAllByText("12").length).toBeGreaterThanOrEqual(2);
  });

  it("starts ingest with NiceGUI-compatible rebuild enabled", async () => {
    const user = userEvent.setup();
    mocks.uploadNovel.mockResolvedValue({ filename: "novel.txt", size: 12 });
    mocks.startIngest.mockResolvedValue({
      taskType: "ingest_fast",
      taskId: "task-1",
      message: "queued",
    });

    const { container } = render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).not.toBeNull();
    await user.upload(
      fileInput!,
      new File(["Chapter 1"], "novel.txt", { type: "text/plain" }),
    );

    await user.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(mocks.startIngest).toHaveBeenCalledWith({
        filename: "novel.txt",
        rebuild: true,
        spine_template: "drama",
      }),
    );
  });

  it("shows the backend upload error instead of a generic failure", async () => {
    const user = userEvent.setup();
    mocks.uploadNovel.mockRejectedValue(new Error("解析章节失败: 文件编码不支持"));

    const { container } = render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).not.toBeNull();
    await user.upload(
      fileInput!,
      new File(["bad"], "broken.txt", { type: "text/plain" }),
    );

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("解析章节失败: 文件编码不支持"),
    );
  });

  it("keeps the ingest failure detail visible on the uploaded file card", async () => {
    const user = userEvent.setup();
    mocks.uploadNovel.mockResolvedValue({ filename: "novel.txt", size: 12 });
    mocks.startIngest.mockRejectedValue(new Error("知识图谱构建失败: provider error"));

    const { container } = render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).not.toBeNull();
    await user.upload(
      fileInput!,
      new File(["Chapter 1"], "novel.txt", { type: "text/plain" }),
    );

    await user.click(screen.getByRole("button", { name: /start import/i }));

    expect(
      await screen.findByText("知识图谱构建失败: provider error"),
    ).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith("知识图谱构建失败: provider error");
  });

  it("restores the import progress view on mount when an ingest_fast task is still running", async () => {
    // Bug: navigating away mid-import and back reset the local flags, so the
    // page fell back to the empty upload zone even though the server task was
    // still running (chapters not yet durably imported). Mount reconcile must
    // re-open the progress view.
    mocks.ingestTasks = [
      { task_type: "ingest_fast", episode: 0, status: "running" },
    ];

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    // Progress view: restored file card with the "Importing" status badge.
    // (Chapters aren't durably imported yet mid-import, so the structure
    // preview section stays empty — the point is we don't fall back to the
    // upload zone.)
    expect(await screen.findByText("Importing")).toBeInTheDocument();
    expect(screen.getByText("Imported novel")).toBeInTheDocument();
    // The empty upload zone must be gone.
    expect(
      screen.queryByText("Supports .txt / .md / .docx"),
    ).not.toBeInTheDocument();
  });

  it("does not restore the import view when no ingest task is active", () => {
    mocks.ingestTasks = [
      { task_type: "ingest_fast", episode: 0, status: "completed" },
    ];

    render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    // Completed (not active) → stays on the normal upload zone.
    expect(
      screen.getByText("Supports .txt / .md / .docx"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Importing")).not.toBeInTheDocument();
  });

  it("waits for tasks fetched after mount before reconciling (ignores stale cache)", async () => {
    // Stale-cache 竞态：tasks(project) 缓存全局共享(不含 episode、staleTime=0)，
    // 挂载时 React Query 会先同步吐旧缓存再后台 refetch。若拿挂载前的旧数据对账
    // 一次就把状态锁死，等真数据回来时已早退 → 恢复被永久错过。修复用
    // isFetchedAfterMount 只认本次挂载后刷到的新数据。
    mocks.ingestTasks = [
      { task_type: "ingest_fast", episode: 0, status: "running" },
    ];
    mocks.ingestTasksFetchedAfterMount = false;

    const { rerender } = render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );

    // 数据还是挂载前旧缓存 → 不得对账，仍停在上传区。
    expect(
      screen.getByText("Supports .txt / .md / .docx"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Importing")).not.toBeInTheDocument();

    // 挂载后的新鲜数据到位 → 这时才允许对账并恢复进度视图。
    mocks.ingestTasksFetchedAfterMount = true;
    rerender(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );
    expect(await screen.findByText("Importing")).toBeInTheDocument();
  });

  it("re-reconciles when the project changes (per-project reconcile state)", async () => {
    // reconcile 状态按 project 记账：组件跨项目复用时，切到有活跃导入的新项目要
    // 重新对账，不能被上一个项目的「已对账」布尔状态卡死。
    mocks.ingestTasks = []; // demo：无活跃任务

    const { rerender } = render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );
    expect(
      screen.getByText("Supports .txt / .md / .docx"),
    ).toBeInTheDocument();

    // 切到 other 项目，且它有活跃 ingest_fast。
    mocks.ingestTasks = [
      { task_type: "ingest_fast", episode: 0, status: "running" },
    ];
    rerender(
      <Wrapper>
        <IngestPageContent project="other" />
      </Wrapper>,
    );
    expect(await screen.findByText("Importing")).toBeInTheDocument();
  });

  it("clears leaked progress state when switching to a project without active ingest", async () => {
    // 反方向对账：组件跨项目复用时，A(活跃导入)→B(无活跃 ingest_fast) 必须清掉
    // A 残留的进度视图状态，否则 B 会错显「Importing」卡片并让 useTaskStream 去
    // 连一个不存在的 SSE。正常路由下父级会按 project remount 兜底，这里直接换
    // project prop 复现「被复用」的场景，验证 else 分支的防御性清理。
    mocks.ingestTasks = [
      { task_type: "ingest_fast", episode: 0, status: "running" },
    ];

    const { rerender } = render(
      <Wrapper>
        <IngestPageContent project="demo" />
      </Wrapper>,
    );
    // demo：活跃导入 → 进度视图恢复。
    expect(await screen.findByText("Importing")).toBeInTheDocument();

    // 切到 other 项目，且它没有活跃任务。
    mocks.ingestTasks = [];
    rerender(
      <Wrapper>
        <IngestPageContent project="other" />
      </Wrapper>,
    );

    // 残留的「Importing」必须被清掉，退回上传区。
    expect(
      await screen.findByText("Supports .txt / .md / .docx"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Importing")).not.toBeInTheDocument();
  });
});
