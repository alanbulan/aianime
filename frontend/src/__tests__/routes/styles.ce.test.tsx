// Copyright (c) 2026 AI anime
import type { ComponentType } from "react";
import type { Style } from "@/modules/asset_world/public";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { TaskControllerProvider } from "@/modules/task_execution/public";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const runtimeState = vi.hoisted(() => ({ isCeRuntime: true }));
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const mutation = vi.hoisted(() => () => ({ mutateAsync: vi.fn(), isPending: false }));
const styleMutationMocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  analyze: vi.fn(),
  upload: vi.fn(),
}));
const styleAnalysisTaskState = vi.hoisted(() => ({
  enabled: false,
  onComplete: null as ((result: unknown) => void) | null,
  result: {} as Record<string, unknown>,
}));
const styleQueryState = vi.hoisted(() => ({
  list: [
    {
      id: "ink",
      name: "Ink",
      label: "Ink style",
      type: "preset",
    },
  ] as Style[],
  detail: {
    id: "ink",
    name: "Ink",
    label: "Ink style",
    type: "preset",
    style_instructions: "clean ink lines",
    avoid_instructions: "muddy colors",
    style_tag: "ink",
  } as Style,
}));

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => runtimeState.isCeRuntime,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useParams: () => ({ project: "demo" }),
  }),
}));

vi.mock("@/modules/asset_world/infrastructure/http-asset-world-gateway", () => ({
  httpAssetWorldGateway: {
    listStyles: vi.fn(async () => ({ ok: true, data: styleQueryState.list })),
    getStyle: vi.fn(async () => ({ ok: true, data: styleQueryState.detail })),
    createStyle: (...args: unknown[]) => styleMutationMocks.create(...args),
    deleteStyle: (...args: unknown[]) => styleMutationMocks.remove(...args),
    analyzeStyle: (...args: unknown[]) => styleMutationMocks.analyze(...args),
    uploadStylePreview: (...args: unknown[]) => styleMutationMocks.upload(...args),
  },
}));

vi.mock("@/modules/project_workspace/public", () => ({
  useProject: () => ({ data: { visual_style: "ink" } }),
  useUpdateProject: mutation,
}));

vi.mock("@/modules/task_execution/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  useCancelTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTasks: () => ({ data: { ok: true, data: [] } }),
}));

vi.mock("@/modules/task_execution/presentation/useTaskStream", () => ({
  useTaskStream: (options: {
    enabled?: boolean;
    onComplete?: (result: unknown) => void;
  }) => {
    styleAnalysisTaskState.enabled = options.enabled === true;
    styleAnalysisTaskState.onComplete = options.onComplete ?? null;
    return {
      status: "idle" as const,
      progress: 0,
      currentTask: "",
      result: null,
      error: null,
      logs: [],
    };
  },
}));

import { Route } from "@/routes/_app/projects.$project/styles";

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          nav: { styles: "Styles" },
          common: {
            refresh: "Refresh",
            refreshed: "Refreshed",
            loading: "Loading",
            save: "Save",
            cancel: "Cancel",
            error: "Error",
          },
          styles: {
            selectStyleHint: "Select a style.",
            createStyle: "Create style",
            projectDefault: "Project default",
            preset: "Preset",
            custom: "Custom",
            customPreviewUnavailable: "No preview",
            customPreviewHint: "Upload a preview.",
            labelField: "Label",
            labelPlaceholder: "Label",
            projectStyleSection: "Project style",
            styleDirective: "Style directive",
            avoidDirective: "Avoid directive",
            styleTag: "Style tag",
            styleTagHint: "Short tag",
            styleTagPlaceholder: "tag",
            jsonEdit: "JSON",
            save: "Save",
            alreadyDefault: "Already default",
            applyToProject: "Apply to project",
            delete: "Delete",
            createTitle: "Create style",
            createHint: "Create a new style.",
            styleId: "Style ID",
            nameField: "Name",
            namePlaceholder: "Name",
            aiAnalyze: "AI analyze",
            uploadRef: "Upload ref",
            reupload: "Reupload",
            unsupportedPreviewType: "Use PNG, JPEG, WebP, or GIF.",
            uploadedPreview: "Uploaded preview",
            uploadCover: "Upload style preview",
            replaceCover: "Replace style preview",
            uploadingCover: "Uploading...",
            previewUploaded: "Style preview updated",
            referenceUsageHint:
              "Preview only; remote generation sends text directives, not this image.",
            analyzingPreview: "Analyzing style preview...",
            styleIdRequiredBeforeUpload: "Enter a style ID first.",
          },
        },
      },
    },
  });
});

afterEach(() => cleanup());

describe("styles page CE workflow", () => {
  beforeEach(() => {
    runtimeState.isCeRuntime = true;
    toastErrorMock.mockClear();
    toastSuccessMock.mockClear();
    styleAnalysisTaskState.enabled = false;
    styleAnalysisTaskState.onComplete = null;
    styleAnalysisTaskState.result = {};
    for (const mock of Object.values(styleMutationMocks)) mock.mockReset();
    styleMutationMocks.upload.mockResolvedValue({
      ok: true,
      data: { preview_path: "assets/styles/custom/reference.png" },
    });
    styleMutationMocks.analyze.mockResolvedValue({
      ok: true,
      task_type: "style_analysis",
      task_id: "task-style-analysis",
      task_key: "task:style_analysis:0",
      message: "Style analysis queued",
    });
    styleMutationMocks.create.mockResolvedValue({ ok: true, data: { id: "custom" } });
    styleQueryState.list = [
      { id: "ink", name: "Ink", label: "Ink style", type: "preset" },
    ];
    styleQueryState.detail = {
      id: "ink",
      name: "Ink",
      label: "Ink style",
      type: "preset",
      style_instructions: "clean ink lines",
      avoid_instructions: "muddy colors",
      style_tag: "ink",
    };
  });

  it("renders style controls", async () => {
    const Component = Route.options.component as ComponentType;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TaskControllerProvider>
            <Component />
          </TaskControllerProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Ink style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create style" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Preview only; remote generation sends text directives, not this image.",
      ),
    ).toBeInTheDocument();

  });

  it("rejects unsupported reference images before upload or analysis", async () => {
    const user = userEvent.setup();
    const Component = Route.options.component as ComponentType;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TaskControllerProvider>
            <Component />
          </TaskControllerProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Create style" }),
      ).toHaveLength(1),
    );
    await user.click(screen.getByRole("button", { name: "Create style" }));
    await user.type(screen.getByPlaceholderText("cyberpunk_v1"), "custom");
    const fileInput = container.ownerDocument.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["image"], "reference.avif", { type: "image/avif" })],
      },
    });

    expect(styleMutationMocks.upload).not.toHaveBeenCalled();
    expect(styleMutationMocks.analyze).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Use PNG, JPEG, WebP, or GIF.");
  });

  it("stops analysis when preview upload returns an error envelope", async () => {
    styleMutationMocks.upload.mockResolvedValue({
      ok: false,
      error: "Unsupported style preview image type",
    });
    const user = userEvent.setup();
    const Component = Route.options.component as ComponentType;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TaskControllerProvider>
            <Component />
          </TaskControllerProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Create style" }),
      ).toHaveLength(1),
    );
    await user.click(screen.getByRole("button", { name: "Create style" }));
    await user.type(screen.getByPlaceholderText("cyberpunk_v1"), "custom");
    const fileInput = container.ownerDocument.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["image"], "reference.png", { type: "image/png" })],
      },
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Unsupported style preview image type",
      ),
    );
    expect(styleMutationMocks.upload).toHaveBeenCalledTimes(1);
    expect(styleMutationMocks.analyze).not.toHaveBeenCalled();
  });

  it("creates an account style with the uploaded preview and complete analyzed config", async () => {
    styleAnalysisTaskState.result = {
      style_instructions: "Create clean cel animation with pastel light.",
      avoid_instructions: "FORBIDDEN: photorealism.",
      style_tag: "PASTEL CEL ANIME",
      style_family: "animation",
      animation_subtype: "2d",
      suggested_name: "Pastel School Anime",
      suggested_label: "青春校园日系动画",
    };
    const user = userEvent.setup();
    const Component = Route.options.component as ComponentType;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TaskControllerProvider>
            <Component />
          </TaskControllerProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Create style" }));
    await user.type(screen.getByPlaceholderText("cyberpunk_v1"), "school_anime");
    await user.type(screen.getByPlaceholderText("Name"), "School Anime");
    const fileInput = container.ownerDocument.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const file = new File(["image"], "reference.png", { type: "image/png" });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => expect(styleAnalysisTaskState.enabled).toBe(true));
    act(() => {
      styleAnalysisTaskState.onComplete?.(styleAnalysisTaskState.result);
    });

    expect(
      await screen.findByText("Create clean cel animation with pastel light."),
    ).toBeInTheDocument();
    const createButtons = screen.getAllByRole("button", { name: "Create style" });
    await user.click(createButtons[createButtons.length - 1]);

    await waitFor(() =>
      expect(styleMutationMocks.create).toHaveBeenCalledWith({
        id: "school_anime",
        name: "School Anime",
        config: {
          label: "青春校园日系动画",
          style_instructions: "Create clean cel animation with pastel light.",
          avoid_instructions: "FORBIDDEN: photorealism.",
          style_tag: "PASTEL CEL ANIME",
          style_family: "animation",
          animation_subtype: "2d",
        },
        preview_path: "assets/styles/custom/reference.png",
      }),
    );
  });

  it("renders the custom style preview in the list and detail panel", async () => {
    const previewUrl = "/api/v1/styles/custom/preview";
    styleQueryState.list = [
      {
        id: "custom",
        name: "Custom",
        label: "Custom style",
        type: "custom",
        preview_url: previewUrl,
      },
    ];
    styleQueryState.detail = {
      id: "custom",
      name: "Custom",
      label: "Custom style",
      type: "custom",
      style_instructions: "painted",
      avoid_instructions: "photo",
      style_tag: "custom",
      preview_url: previewUrl,
    };
    const Component = Route.options.component as ComponentType;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TaskControllerProvider>
            <Component />
          </TaskControllerProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen
          .getAllByRole("img")
          .filter((image) => image.getAttribute("src") === previewUrl),
      ).toHaveLength(2),
    );
  });

  it("uploads or replaces the preview image of an existing custom style", async () => {
    styleQueryState.list = [
      {
        id: "custom",
        name: "Custom",
        label: "Custom style",
        type: "custom",
      },
    ];
    styleQueryState.detail = {
      id: "custom",
      name: "Custom",
      label: "Custom style",
      type: "custom",
      style_instructions: "painted",
      avoid_instructions: "photo",
      style_tag: "custom",
    };
    const Component = Route.options.component as ComponentType;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TaskControllerProvider>
            <Component />
          </TaskControllerProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Upload style preview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Preview only; remote generation sends text directives, not this image.",
      ),
    ).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>(
      "input[data-style-preview-upload]",
    );
    expect(input).not.toBeNull();
    const file = new File(["image"], "reference.png", { type: "image/png" });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() =>
      expect(styleMutationMocks.upload).toHaveBeenCalledWith({
        file,
        styleId: "custom",
      }),
    );
    expect(await screen.findByRole("img", { name: "Custom preview" })).toHaveAttribute(
      "src",
      expect.stringContaining("/api/v1/styles/custom/preview"),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Style preview updated");
  });
});
