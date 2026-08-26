// Copyright (c) 2026 AI anime
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");

describe("SuperChat boundaries", () => {
  it("keeps message cache persistence outside the controller hook", () => {
    const cache = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/infrastructure/messageCache.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const composition = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/composition.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/infrastructure/messageCache.dom.test.ts",
      ),
      "utf8",
    );

    expect(composition).toContain(
      'from "@/modules/ai_assistant/infrastructure/messageCache";',
    );
    expect(hook).not.toContain("/infrastructure/");
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    for (const ownedOperation of [
      "function denestRaw(",
      "export function sanitizeMessagesForCache(",
      "export function loadCachedMessages(",
      "export function saveCachedMessages(",
      "export function pruneOldMessageCaches(",
      "registerStorageReclaimer(",
    ]) {
      expect(cache).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    expect(cache).toContain('const MESSAGE_CACHE_PREFIX = "superchat:messages:v2:";');
    expect(hook).not.toContain("MESSAGE_CACHE_PREFIX");
  });

  it("keeps active turn status rules in domain and persistence in infrastructure", () => {
    const statusRules = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/domain/activeTurn.ts"),
      "utf8",
    );
    const storage = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/infrastructure/activeTurnStorage.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const frameController = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/useFrameController.ts"),
      "utf8",
    );
    const statusTests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/domain/activeTurn.test.ts"),
      "utf8",
    );
    const storageTests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/infrastructure/activeTurnStorage.dom.test.ts",
      ),
      "utf8",
    );

    expect(hook).toContain(
      'from "@/modules/ai_assistant/domain/activeTurn";',
    );
    expect(frameController).toContain(
      'from "@/modules/ai_assistant/domain/activeTurn";',
    );
    expect(statusTests).toContain('from "@/modules/ai_assistant/public";');
    expect(storageTests).toContain('from "@/modules/ai_assistant/public";');
    for (const ownedRule of [
      "export function activeTurnIsPending(",
      "export function currentTurnIsLive(",
    ]) {
      expect(statusRules).toContain(ownedRule);
      expect(hook).not.toContain(ownedRule);
      expect(frameController).not.toContain(ownedRule);
    }
    for (const ownedStorageOperation of [
      "function activeTurnKey(",
      "function loadActiveTurn(",
      "export function saveActiveTurn(",
      "export function clearActiveTurn(",
      "export function loadPendingActiveTurn(",
    ]) {
      expect(storage).toContain(ownedStorageOperation);
      expect(hook).not.toContain(ownedStorageOperation);
    }
    expect(storage).not.toContain("export function activeTurnKey(");
    expect(storage).not.toContain("export function loadActiveTurn(");
    expect(storage).toContain('const ACTIVE_TURN_PREFIX = "superchat:active-turn:";');
    expect(storage).toContain(
      'from "@/modules/ai_assistant/domain/activeTurn";',
    );
    expect(statusRules).not.toContain("localStorage");
    expect(hook).not.toContain("ACTIVE_TURN_PREFIX");
    expect(hook).not.toContain("hasStructuredContent");
  });

  it("keeps local preference persistence outside the controller hook", () => {
    const storage = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/infrastructure/preferencesStorage.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const composition = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/composition.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/infrastructure/preferencesStorage.dom.test.ts",
      ),
      "utf8",
    );

    expect(composition).toContain(
      'from "@/modules/ai_assistant/infrastructure/preferencesStorage";',
    );
    expect(hook).not.toContain("/infrastructure/");
    expect(tests).toContain('from "@/modules/ai_assistant/public";');
    for (const ownedOperation of [
      "function messageSetKey(",
      "export function loadSuperChatSettings(",
      "export function saveSuperChatSettings(",
      "export function loadScopedMessageIds(",
      "export function saveScopedMessageIds(",
    ]) {
      expect(storage).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    expect(storage).not.toContain("export function messageSetKey(");
    expect(hook).not.toContain("SETTINGS_KEY");
    expect(hook).not.toContain("safeLocalStorageSet");
    expect(hook).not.toContain("localStorage.");
    expect(hook).not.toContain("persistMessageSet");
  });

  it("keeps ingest upload persistence outside the SuperChat panel", () => {
    const storage = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/infrastructure/ingestUploadStorage.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const controller = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/composition.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/infrastructure/ingestUploadStorage.dom.test.ts",
      ),
      "utf8",
    );

    expect(controller).toContain(
      'from "@/modules/ai_assistant/infrastructure/ingestUploadStorage";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/infrastructure/ingestUploadStorage";',
    );
    for (const ownedOperation of [
      "function uploadedIngestFilesKey(",
      "function isUploadedIngestFile(",
      "export function loadUploadedIngestFiles(",
      "export function saveUploadedIngestFiles(",
    ]) {
      expect(storage).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(storage).toContain(
      'const UPLOADED_INGEST_FILES_PREFIX = "superchat:ingest-uploads:";',
    );
    expect(storage).toContain(
      'from "@/modules/ai_assistant/domain/ingestAutomation";',
    );
    expect(panel).not.toContain("UPLOADED_INGEST_FILES_PREFIX");
    expect(panel).not.toContain("localStorage.");
  });

  it("keeps ingest automation rules outside the SuperChat panel", () => {
    const domain = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/domain/ingestAutomation.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const attachmentsController = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useComposerAttachmentsController.ts",
      ),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/domain/ingestAutomation.test.ts",
      ),
      "utf8",
    );

    expect(attachmentsController).toContain(
      'from "@/modules/ai_assistant/domain/ingestAutomation";',
    );
    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/useComposerAttachmentsController";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/domain/ingestAutomation";',
    );
    for (const ownedOperation of [
      "function extensionOf(",
      "function dataUrlToText(",
      "export function hasVideoCreationIntent(",
      "export function shouldReportUploadedFiles(",
      "export function isNovelAttachment(",
      "export function isAllowedScriptUpload(",
      "export function isAllowedScriptDragItem(",
      "export function isAllowedChatUpload(",
      "export function isAllowedChatDragItem(",
      "export function isOverwriteChoice(",
      "export function isFinalOverwriteConfirmation(",
      "export function dataUrlToAttachmentBlob(",
      "export function buildUploadedFilesContext(",
      "export function buildReingestConfirmationContext(",
      "export function buildReingestCancelledContext(",
      "export function buildAttachmentAnalysisContext(",
      "export function appendIngestAutomationContext(",
      "export function appendAttachmentAnalysisContext(",
      "export function mergeUploadedIngestFiles(",
      "export function uploadedIngestFileFromUpload(",
    ]) {
      expect(domain).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    for (const ownedConstant of [
      "VIDEO_CREATION_RE",
      "UPLOADED_FILES_QUERY_RE",
      "NOVEL_ATTACHMENT_EXTENSIONS",
      "CHAT_IMAGE_ATTACHMENT_EXTENSIONS",
      "INLINE_TEXT_ATTACHMENT_LIMIT",
    ]) {
      expect(domain).toContain(ownedConstant);
      expect(panel).not.toContain(ownedConstant);
    }
    expect(domain).not.toContain("toast.");
    expect(domain).not.toContain("uploadStoryDocument");
    expect(domain).not.toContain("startStoryIngestion");
    expect(domain).not.toContain("readPipelineStatus");
    expect(domain).not.toContain("localStorage");
    expect(domain).not.toContain("ingestUploadStorage");
  });

  it("keeps ingest infrastructure calls outside the SuperChat panel", () => {
    const gateway = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/infrastructure/ingestAutomationGateway.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const controller = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/composition.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/infrastructure/ingestAutomationGateway.test.ts",
      ),
      "utf8",
    );

    expect(controller).toContain(
      'from "@/modules/ai_assistant/infrastructure/ingestAutomationGateway";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/infrastructure/ingestAutomationGateway";',
    );
    for (const operation of [
      "export async function uploadNovelForIngest(",
      "export async function startNovelIngest(",
      "export async function projectHasIngestedContent(",
    ]) {
      expect(gateway).toContain(operation);
      expect(panel).not.toContain(operation);
    }
    for (const infrastructureCall of [
      "uploadStoryDocument",
      "startStoryIngestion",
      "readPipelineStatus",
    ]) {
      expect(gateway).toContain(infrastructureCall);
      expect(panel).not.toContain(infrastructureCall);
    }
    expect(gateway).not.toContain("toast.");
    expect(gateway).not.toContain("TFunction");
    expect(gateway).not.toContain("backendErrorToastMessage");
    expect(gateway).toContain(
      'from "@/modules/ai_assistant/domain/ingestAutomation";',
    );
  });

  it("keeps ingest application orchestration outside the SuperChat panel", () => {
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useIngestAutomationController.ts",
      ),
      "utf8",
    );
    const composition = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/composition.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useIngestAutomationController.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/composition";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/application/useIngestAutomationController";',
    );
    for (const ownedOperation of [
      "function surfaceFormatCheckWarnings(",
      "async function uploadAttachmentsForIngest(",
      "export function useIngestAutomationControllerWithPorts(",
      "const recordUploadedFiles = useCallback(",
    ]) {
      expect(controller).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controller).toContain(
      'from "@/modules/ai_assistant/domain/ingestAutomation";',
    );
    expect(controller).not.toContain("/infrastructure/");
    expect(composition).toContain(
      'from "@/modules/ai_assistant/infrastructure/ingestAutomationGateway";',
    );
    expect(composition).toContain(
      'from "@/modules/ai_assistant/infrastructure/ingestUploadStorage";',
    );
    expect(composition).toContain("const ingestAutomationPorts:");
    expect(composition).toContain("useIngestAutomationControllerWithPorts({");
    expect(panel).not.toContain("backendErrorToastMessage");
    expect(panel).not.toContain("reingestConfirmation");
    expect(panel).not.toContain("uploadedIngestFiles");
  });

  it("keeps timeline projection and interaction in a dedicated view", () => {
    const timeline = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatTimeline.tsx"),
      "utf8",
    );
    const scrollRule = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/timelineScroll.ts"),
      "utf8",
    );
    const messageArea = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageArea.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatTimeline.test.tsx",
      ),
      "utf8",
    );
    const scrollTests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/timelineScroll.test.ts",
      ),
      "utf8",
    );

    expect(messageArea).toContain(
      'from "@/modules/ai_assistant/presentation/ChatTimeline";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-timeline";',
    );
    expect(tests).toContain('from "./ChatTimeline";');
    for (const ownedOperation of [
      "type TimelineTurn =",
      "function buildTimelineTurns(",
      "export function ChatTimeline(",
      "const updateScrollEdges = useCallback(",
      "const scrollToTurn = useCallback(",
      "const revealTimelineContext = useCallback(",
    ]) {
      expect(timeline).toContain(ownedOperation);
      expect(messageArea).not.toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(timeline).toContain(
      'from "@/modules/ai_assistant/presentation/timelineScroll";',
    );
    expect(timeline).not.toContain('from "@/modules/ai_assistant/public";');
    expect(scrollTests).toContain('from "@/modules/ai_assistant/public";');
    expect(scrollRule).toContain("export function calculateTimelineContextDelta(");
    expect(scrollRule).not.toContain('from "react"');
    expect(scrollRule).not.toContain("document.");
    expect(scrollRule).not.toContain("window.");
    expect(timeline).toContain('import { createPortal } from "react-dom";');
    expect(messageArea).not.toContain("calculateTimelineContextDelta");
    expect(panel).not.toContain("calculateTimelineContextDelta");
  });

  it("keeps UiSpec media projection outside the SuperChat panel", () => {
    const projection = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/domain/specMediaProjection.ts",
      ),
      "utf8",
    );
    const gallery = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/SpecMediaGallery.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/domain/specMediaProjection.test.ts",
      ),
      "utf8",
    );

    expect(gallery).toContain(
      'from "@/modules/ai_assistant/domain/specMediaProjection";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/spec-media-projection";',
    );
    expect(gallery).not.toContain(
      'from "@/features/superchat/spec-media-projection";',
    );
    expect(tests).toContain('from "./specMediaProjection";');
    for (const ownedOperation of [
      "function elementProps(",
      "function textProp(",
      "function numberProp(",
      "function specElementOrder(",
      "export function extractUnifiedMediaItems(",
      "export function extractKeyframeVideoPreviewItems(",
      "export function extractPendingKeyframeVideoItem(",
    ]) {
      expect(projection).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(projection).not.toContain('from "react"');
    expect(projection).not.toContain("document.");
    expect(projection).not.toContain("window.");
    expect(projection).not.toContain('from "@/modules/ai_assistant/public";');
  });

  it("keeps UiSpec media gallery presentation outside the SuperChat panel", () => {
    const gallery = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/SpecMediaGallery.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const messageView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageView.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/SpecMediaGallery.test.tsx",
      ),
      "utf8",
    );

    expect(messageView).toContain(
      'from "@/modules/ai_assistant/presentation/SpecMediaGallery";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/spec-media-gallery";',
    );
    expect(messageView).not.toContain(
      'from "@/features/superchat/spec-media-gallery";',
    );
    expect(tests).toContain('from "./SpecMediaGallery";');
    for (const ownedOperation of [
      "function resolveSpecMediaUrl(",
      "function useResolvedSpecUrl(",
      "function useVideoFirstFrame(",
      "function KeyframeVideoPreviewCard(",
      "function UnifiedMediaCard(",
      "function UnifiedMediaGrid(",
      "function KeyframeVideoPreview(",
      "export function UiSpecRenderer(",
    ]) {
      expect(gallery).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(gallery).toContain(
      'from "@/modules/ai_assistant/domain/specMediaProjection";',
    );
    expect(gallery).toContain(
      'from "@/modules/ai_assistant/presentation/SpecMediaModals";',
    );
    expect(gallery).toContain('from "@/lib/media-url";');
    expect(gallery).not.toContain('from "@/modules/ai_assistant/public";');
    expect(gallery).not.toContain("useSuperChat");
  });

  it("keeps recursive structured JSON rendering in a dedicated view", () => {
    const jsonView = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/StructuredJsonView.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const messageView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageView.tsx"),
      "utf8",
    );
    const gallery = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/SpecMediaGallery.tsx",
      ),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/StructuredJsonView.test.tsx",
      ),
      "utf8",
    );

    expect(messageView).toContain(
      'from "@/modules/ai_assistant/presentation/StructuredJsonView";',
    );
    expect(gallery).toContain(
      'from "@/modules/ai_assistant/presentation/StructuredJsonView";',
    );
    for (const consumer of [messageView, gallery, panel]) {
      expect(consumer).not.toContain(
        'from "@/features/superchat/structured-json-view";',
      );
    }
    expect(tests).toContain('from "./StructuredJsonView";');
    for (const ownedOperation of [
      "function renderJsonScalar(",
      "export function JsonNode(",
    ]) {
      expect(jsonView).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(jsonView).not.toContain("UiSpec");
    expect(jsonView).not.toContain("StructuredBlock");
    expect(jsonView).not.toContain("useSuperChat");
  });

  it("keeps the shared AI avatar source in AI Assistant presentation", () => {
    const avatarSource = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useAiAvatarUrl.ts",
      ),
      "utf8",
    );
    const publicApi = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/public.ts"),
      "utf8",
    );
    const messageView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageView.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatMessageView.test.tsx",
      ),
      "utf8",
    );

    expect(publicApi).toContain(
      'from "@/modules/ai_assistant/presentation/useAiAvatarUrl";',
    );
    expect(messageView).toContain(
      'from "@/modules/ai_assistant/presentation/useAiAvatarUrl";',
    );
    expect(messageView).toContain(
      'import { useAiAvatarUrl } from "@/modules/ai_assistant/presentation/useAiAvatarUrl";',
    );
    expect(tests).toContain(
      'vi.mock("@/modules/ai_assistant/presentation/useAiAvatarUrl"',
    );
    expect(avatarSource).toContain("export function loadAiAvatarUrl(");
    expect(avatarSource).toContain("export function useAiAvatarUrl(");
    expect(avatarSource).toContain("let avatarUrlPromise:");
    expect(avatarSource).toContain("indexedDB.open(DB_NAME, 1)");
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/ai-avatar.ts")),
    ).toBe(false);
  });

  it("keeps chat message presentation in a dedicated view", () => {
    const messageView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageView.tsx"),
      "utf8",
    );
    const messageArea = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageArea.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatMessageView.test.tsx",
      ),
      "utf8",
    );

    expect(messageArea).toContain(
      'from "@/modules/ai_assistant/presentation/ChatMessageView";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-message-view";',
    );
    expect(tests).toContain('from "./ChatMessageView";');
    for (const ownedOperation of [
      "function PlainMessageText(",
      "function MarkdownMessageText(",
      "function MessageText(",
      "function HighlightedErrorText(",
      "function HighlightedCompletionText(",
      "export function DotsIndicator(",
      "function ChatAvatarFrame(",
      "export function StructuredRenderer(",
      "export const MessageBubble = memo(",
      "function AttachmentList(",
      "function AttachmentChip(",
      "function shouldRenderAttachmentChip(",
      "function isImageAttachment(",
      "function isVideoAttachment(",
    ]) {
      expect(messageView).toContain(ownedOperation);
      expect(messageArea).not.toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(messageView).not.toContain('from "@/modules/ai_assistant/public";');
    expect(messageView).toContain(
      'from "@/modules/ai_assistant/domain/messagePresentationRules";',
    );
    expect(messageView).not.toContain(
      'from "@/features/superchat/spec-media-gallery";',
    );
    expect(messageView).not.toContain("useSuperChat");
  });

  it("keeps chat header controls in a controller-independent view", () => {
    const controls = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatControlBar.tsx"),
      "utf8",
    );
    const header = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatPanelHeader.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatControlBar.test.tsx",
      ),
      "utf8",
    );

    expect(header).toContain(
      'from "@/modules/ai_assistant/presentation/ChatControlBar";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-control-bar";',
    );
    expect(tests).toContain('from "./ChatControlBar";');
    for (const ownedOperation of [
      "export type ChatControlBarModel =",
      "export function ControlBar(",
      "export function HeaderControlPortal(",
    ]) {
      expect(controls).toContain(ownedOperation);
      expect(header).not.toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controls).toContain('import { createPortal } from "react-dom";');
    expect(controls).not.toContain("useSuperChat");
    expect(controls).not.toContain("ReturnType<");
  });

  it("keeps complete chat panel header presentation outside the panel", () => {
    const header = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatPanelHeader.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const panelView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanelView.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelHeader.test.tsx",
      ),
      "utf8",
    );

    expect(panelView).toContain(
      'from "@/modules/ai_assistant/presentation/ChatPanelHeader";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-panel-header";',
    );
    expect(tests).toContain('from "./ChatPanelHeader";');
    expect(header).toContain("export function ChatPanelHeader(");
    for (const ownedPresentation of [
      "<HeaderControlPortal",
      "<ControlBar",
      't("freezone.chat.title")',
      't("freezone.chat.close")',
      't("aiAssistant.reconnecting")',
      '<X className="size-4" />',
    ]) {
      expect(header).toContain(ownedPresentation);
      expect(panel).not.toContain(ownedPresentation);
    }
    expect(header).not.toContain("useSuperChat");
    expect(header).not.toContain("ReturnType<");
  });

  it("keeps approval presentation outside the SuperChat panel", () => {
    const approvalCard = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ApprovalCard.tsx"),
      "utf8",
    );
    const contextViews = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelContextViews.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ApprovalCard.test.tsx",
      ),
      "utf8",
    );

    expect(contextViews).toContain(
      'from "@/modules/ai_assistant/presentation/ApprovalCard";',
    );
    expect(contextViews).not.toContain(
      'from "@/features/superchat/approval-card";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/approval-card";',
    );
    expect(tests).toContain('from "./ApprovalCard";');
    expect(approvalCard).toContain("export function ApprovalCard(");
    expect(panel).not.toContain("function ApprovalCard(");
    expect(approvalCard).toContain(
      'import type { ApprovalRequest } from "@/modules/ai_assistant/domain/contracts";',
    );
    expect(approvalCard).not.toContain("useSuperChat");
  });

  it("keeps secondary panel views outside the SuperChat panel", () => {
    const searchBar = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SearchBar.tsx"),
      "utf8",
    );
    const pinnedPanel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/PinnedPanel.tsx"),
      "utf8",
    );
    const searchTests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SearchBar.test.tsx"),
      "utf8",
    );
    const pinnedTests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/PinnedPanel.test.tsx"),
      "utf8",
    );
    const detailPanel = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/MessageDetailPanel.tsx",
      ),
      "utf8",
    );
    const contextViews = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelContextViews.tsx",
      ),
      "utf8",
    );
    const detailOverlays = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelDetailOverlays.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/MessageDetailPanel.test.tsx",
      ),
      "utf8",
    );

    for (const [moduleSource, moduleTests, component, importPath, ownedOperation] of [
      [searchBar, searchTests, "SearchBar", "chat-search-bar", "export function SearchBar("],
      [pinnedPanel, pinnedTests, "PinnedPanel", "pinned-messages-panel", "export function PinnedPanel("],
    ]) {
      expect(contextViews).toContain(
        `from "@/modules/ai_assistant/presentation/${component}";`,
      );
      expect(contextViews).not.toContain(
        `from "@/features/superchat/${importPath}";`,
      );
      expect(panel).not.toContain(
        `from "@/features/superchat/${importPath}";`,
      );
      expect(moduleTests).toContain(`from "./${component}";`);
      expect(moduleSource).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation.replace("export ", ""));
      expect(moduleSource).not.toContain("useSuperChat");
    }
    expect(detailOverlays).toContain(
      'from "@/modules/ai_assistant/presentation/MessageDetailPanel";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/message-detail-panel";',
    );
    expect(tests).toContain('from "./MessageDetailPanel";');
    expect(detailPanel).toContain("export function MessageDetailPanel(");
    expect(panel).not.toContain("function MessageDetailPanel(");
    expect(detailPanel).not.toContain("useSuperChat");
    expect(detailPanel).toContain(
      'from "@/modules/ai_assistant/presentation/ChatMessageView";',
    );
    expect(detailPanel).not.toContain('from "@/modules/ai_assistant/public";');
  });

  it("keeps panel context presentation outside the SuperChat panel", () => {
    const contextViews = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelContextViews.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const panelView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanelView.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelContextViews.test.tsx",
      ),
      "utf8",
    );

    expect(panelView).toContain(
      'from "@/modules/ai_assistant/presentation/ChatPanelContextViews";',
    );
    expect(panelView).not.toContain(
      'from "@/features/superchat/chat-panel-context-views";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-panel-context-views";',
    );
    expect(tests).toContain('from "./ChatPanelContextViews";');
    expect(contextViews).toContain("export function ChatPanelContextViews(");
    for (const ownedPresentation of [
      "border-destructive/20 bg-destructive/8",
      "approvals.map((approval)",
      "<ApprovalCard",
      "<PinnedPanel",
      "searchOpen &&",
      "<SearchBar",
    ]) {
      expect(contextViews).toContain(ownedPresentation);
      expect(panel).not.toContain(ownedPresentation);
    }
    expect(contextViews).not.toContain("useSuperChat");
    expect(contextViews).not.toContain("ReturnType<");
    expect(contextViews).not.toContain(
      'from "@/modules/ai_assistant/public";',
    );
  });

  it("keeps local speech recording and transcription in dedicated adapters", () => {
    const speechController = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useSpeechInputController.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useSpeechInputController.test.tsx",
      ),
      "utf8",
    );
    const gateway = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/infrastructure/localSpeechTranscriptionGateway.ts",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/useSpeechInputController";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    for (const ownedOperation of [
      'type SpeechInputStatus = "idle" | "recording" | "transcribing";',
      "type SpeechInputDependencies =",
      "export function useSpeechInputController(",
      "const recorderRef = useRef<VoiceRecorder | null>(null);",
      ".transcribe(recording.dataUrl)",
      "recorderRef.current?.stop();",
    ]) {
      expect(speechController).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(speechController).toContain(
      'from "@/modules/ai_assistant/composition";',
    );
    expect(gateway).toContain('api/v1/chat/speech/transcribe');
    expect(gateway).toContain("dataUrlToBlob(dataUrl)");
    expect(gateway).not.toContain("fetch(dataUrl)");
    expect(speechController).not.toContain("useSuperChat");
    expect(panel).not.toContain("SpeechRecognition");
    expect(panel).not.toContain("speechRef");
    expect(panel).not.toContain("setRecording");
  });

  it("keeps panel message selection and render projection in a pure module", () => {
    const projection = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/panelMessageProjection.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/panelMessageProjection.test.ts",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/application/panelMessageProjection";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    expect(projection).toContain("type PanelMessageProjectionOptions =");
    expect(projection).toContain("export function projectPanelMessages(");
    for (const ownedRule of [
      "const searchQuery =",
      "const lastConversationalMessage =",
      "const activeTurnHasAssistantReply =",
      "const lastUserHasAssistantReply =",
      "const currentStreamingAssistantId =",
      "const showWaitingIndicator =",
    ]) {
      expect(projection).toContain(ownedRule);
      expect(panel).not.toContain(ownedRule);
    }
    expect(projection).toContain(
      'from "@/modules/ai_assistant/domain/messagePresentationRules";',
    );
    expect(panel).not.toContain(
      "messagePresentationRules",
    );
    expect(projection).not.toContain('from "react"');
    expect(projection).not.toContain("document.");
    expect(projection).not.toContain("window.");
  });

  it("keeps task completion notification orchestration outside the SuperChat panel", () => {
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useTaskCompletionNotifications.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
        resolve(
          SRC_ROOT,
          "modules/ai_assistant/presentation/useTaskCompletionNotifications.test.tsx",
        ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/useTaskCompletionNotifications";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    expect(controller).toContain(
      "export function useTaskCompletionNotifications(",
    );
    for (const ownedOperation of [
      "const notifiedTaskKeysRef = useRef<Set<string>>(new Set());",
      'return taskEventBus.on("*", (event) => {',
      'event.type !== "task_complete" && event.type !== "task_failed"',
      "const taskProject =",
      "const dedupeKey =",
      "buildChatTaskLabel(event.task, t)",
      "void appendNotification(text)",
    ]) {
      expect(controller).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controller).toContain(
      'from "@/modules/task_execution/public";',
    );
    expect(controller).toContain(
      'from "@/modules/ai_assistant/presentation/taskNotificationLabel";',
    );
    expect(panel).not.toContain(
      'from "@/modules/task_execution/public";',
    );
    expect(panel).not.toContain(
      'from "@/modules/ai_assistant/presentation/taskNotificationLabel";',
    );
    expect(
      existsSync(
        resolve(SRC_ROOT, "features/superchat/use-task-completion-notifications.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(resolve(SRC_ROOT, "features/superchat/task-notification-label.ts")),
    ).toBe(false);
  });

  it("keeps message-area scrolling orchestration outside the SuperChat panel", () => {
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useChatScrollController.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useChatScrollController.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/useChatScrollController";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    expect(controller).toContain("export function useChatScrollController(");
    for (const ownedOperation of [
      "const [showScrollToBottom, setShowScrollToBottom] = useState(false);",
      "const scrollRef = useRef<HTMLDivElement | null>(null);",
      "const messageListRef = useRef<HTMLDivElement | null>(null);",
      "const shouldStickToBottomRef = useRef(true);",
      "const historyScrollKeyRef = useRef<string | null>(null);",
      "const scrollToChatBottom = useCallback(",
      'element.addEventListener("scroll", updateStickiness',
      "const observer = new ResizeObserver(",
      "const firstTimeout = window.setTimeout(scrollToChatBottom, 120);",
    ]) {
      expect(controller).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controller).not.toContain("useSuperChat");
  });

  it("keeps queued-message state transitions outside the SuperChat panel", () => {
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatQueueController.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatQueueController.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/application/useChatQueueController";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    expect(controller).toContain("export function useChatQueueController(");
    for (const ownedOperation of [
      "type QueuedSendItem =",
      "const [queuedMessages, setQueuedMessages] = useState<QueuedSendItem[]>([]);",
      "const [selectedQueuedMessageId, setSelectedQueuedMessageId] = useState<string | null>(null);",
      // Functional update, not a pre-await snapshot: draining must not revive a
      // message the user deleted while the send was in flight.
      "current.filter((message) => message.id !== nextMessage.id)",
      "void sendMessage(nextMessage.text, nextMessage.attachments)",
      "const enqueueMessage = useCallback(",
      "const removeQueuedMessage = useCallback(",
      "const selectQueuedMessageByOffset = useCallback(",
    ]) {
      expect(controller).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controller).not.toContain("useSuperChat");
    expect(controller).not.toContain("sendWithIngestAutomation");
  });

  it("keeps Composer border-beam lifecycle outside the SuperChat panel", () => {
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useComposerBorderBeam.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useComposerBorderBeam.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/useComposerBorderBeam";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    expect(hook).toContain("export function useComposerBorderBeam(");
    for (const ownedOperation of [
      'from "border-beam-vanilla";',
      "const composerBeamRef = useRef<BorderBeamController | null>(null);",
      "const beam = attachBorderBeam(shell, {",
      'theme: "dark"',
      "composerBeamRef.current?.setActive(active)",
      "beam.destroy()",
    ]) {
      expect(hook).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
  });

  it("keeps Composer history navigation outside the SuperChat panel", () => {
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useComposerHistoryNavigation.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useComposerHistoryNavigation.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/useComposerHistoryNavigation";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    expect(hook).toContain("export function useComposerHistoryNavigation(");
    for (const ownedOperation of [
      "const [selectedHistoryMessageIndex, setSelectedHistoryMessageIndex] = useState<number | null>(null);",
      "const restoreDraftFocusRef = useRef(false);",
      "useLayoutEffect(() => {",
      "textarea.setSelectionRange(end, end)",
      "const resetHistorySelection = useCallback(",
      "const selectHistoryMessage = useCallback(",
    ]) {
      expect(hook).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(hook).not.toContain("useSuperChat");
  });

  it("keeps queued-message presentation outside the SuperChat panel", () => {
    const view = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/QueuedMessagesPanel.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const composer = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatComposer.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/QueuedMessagesPanel.test.tsx",
      ),
      "utf8",
    );

    expect(composer).toContain(
      'from "@/modules/ai_assistant/presentation/QueuedMessagesPanel";',
    );
    expect(composer).not.toContain(
      'from "@/features/superchat/queued-messages-panel";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/queued-messages-panel";',
    );
    expect(tests).toContain('from "./QueuedMessagesPanel";');
    expect(view).toContain("export function QueuedMessagesPanel(");
    for (const ownedPresentation of [
      't("aiAssistant.queuedCount"',
      "const showSelectedState =",
      'aria-label={t("aiAssistant.selectQueuedMessage")}',
      't("aiAssistant.queuedAttachments"',
      'aria-label={t("aiAssistant.removeQueuedMessage")}',
    ]) {
      expect(view).toContain(ownedPresentation);
      expect(panel).not.toContain(ownedPresentation);
    }
    expect(view).not.toContain("useChatQueueController");
    expect(view).not.toContain("setQueuedMessages");
  });

  it("keeps Composer attachment and drag state outside the SuperChat panel", () => {
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useComposerAttachmentsController.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/useComposerAttachmentsController.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/useComposerAttachmentsController";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    expect(controller).toContain(
      "export function useComposerAttachmentsController(",
    );
    for (const ownedOperation of [
      "function eventHasFiles(",
      "function resolveDragFileState(",
      "const [attachments, setAttachments] = useState<ChatAttachment[]>([]);",
      "const [dragFileState, setDragFileState] = useState<DragFileState>(null);",
      "const dragDepthRef = useRef(0);",
      "const reader = new FileReader();",
      "const handleComposerDragEnter = useCallback(",
      "const handleComposerDragOver = useCallback(",
      "const handleComposerDragLeave = useCallback(",
      "const handleComposerDrop = useCallback(",
    ]) {
      expect(controller).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controller).toContain(
      'from "@/modules/ai_assistant/domain/ingestAutomation";',
    );
    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/useComposerAttachmentsController";',
    );
    expect(controller).not.toContain("useSuperChat");
  });

  it("keeps Composer submission orchestration outside the SuperChat panel", () => {
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useComposerSubmitController.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useComposerSubmitController.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/application/useComposerSubmitController";',
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    expect(controller).toContain(
      "export function useComposerSubmitController(",
    );
    for (const ownedOperation of [
      "const hasCurrentContent =",
      'toast.error(t("aiAssistant.waiting"))',
      "resetHistorySelection();",
      't("aiAssistant.attachmentOnlyPrompt")',
      "const queuedAttachments = attachments.map(",
      "enqueueMessage(text, queuedAttachments);",
      "void sendMessage(text, queuedAttachments).then(",
    ]) {
      expect(controller).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controller).not.toContain("useSuperChat");
    expect(controller).not.toContain("useChatQueueController");
    expect(controller).not.toContain("useIngestAutomationController");
  });

  it("keeps complete Composer presentation outside the SuperChat panel", () => {
    const view = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatComposer.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const panelView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanelView.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatComposer.test.tsx",
      ),
      "utf8",
    );

    expect(panelView).toContain(
      'from "@/modules/ai_assistant/presentation/ChatComposer";',
    );
    expect(panelView).not.toContain(
      'from "@/features/superchat/chat-composer";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-composer";',
    );
    expect(tests).toContain('from "./ChatComposer";');
    expect(view).toContain("type ChatComposerProps =");
    expect(view).toContain("export function ChatComposer(");
    for (const ownedPresentation of [
      "<ComposerWaitingStatus",
      "<QueuedMessagesPanel",
      "<Textarea",
      "const handleComposerKeyDown =",
      't("aiAssistant.removeAttachment")',
      't("aiAssistant.listening")',
      't("aiAssistant.disclaimer")',
      'aria-label={busy ? t("aiAssistant.stop") : t("aiAssistant.send")}',
    ]) {
      expect(view).toContain(ownedPresentation);
      expect(panel).not.toContain(ownedPresentation);
    }
    expect(panel).not.toContain('from "@/components/ui/textarea";');
    expect(panel).not.toContain(
      'from "@/features/superchat/composer-waiting-status";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/queued-messages-panel";',
    );
    expect(view).not.toContain(
      'from "@/features/superchat/composer-waiting-status";',
    );
    expect(view).not.toContain(
      'from "@/features/superchat/queued-messages-panel";',
    );
    expect(view).not.toContain('from "@/modules/ai_assistant/public";');
    expect(view).not.toContain("useSuperChat");
    expect(view).not.toContain("useChatQueueController");
    expect(view).not.toContain("useComposerAttachmentsController");
    expect(view).not.toContain("ReturnType<");
  });

  it("keeps complete message-area presentation outside the SuperChat panel", () => {
    const view = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageArea.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const panelView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanelView.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageArea.test.tsx"),
      "utf8",
    );

    expect(panelView).toContain(
      'from "@/modules/ai_assistant/presentation/ChatMessageArea";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-message-area";',
    );
    expect(tests).toContain('from "./ChatMessageArea";');
    expect(view).toContain("type ChatMessageAreaProps =");
    expect(view).toContain("export function ChatMessageArea(");
    for (const ownedPresentation of [
      "const isChatInitializing =",
      "<DotsIndicator",
      "<MessageBubble",
      "<ChatTimeline",
      't("aiAssistant.emptyTitle")',
      'aria-label="回到底部"',
      'id: "streaming"',
    ]) {
      expect(view).toContain(ownedPresentation);
      expect(panel).not.toContain(ownedPresentation);
    }
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-message-view";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-timeline";',
    );
    expect(view).not.toContain("useSuperChat");
    expect(view).not.toContain("useChatScrollController");
    expect(view).not.toContain("ReturnType<");
    expect(view).not.toContain('from "@/modules/ai_assistant/public";');
  });

  it("keeps spec media modal presentation outside the SuperChat panel", () => {
    const modals = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/SpecMediaModals.tsx",
      ),
      "utf8",
    );
    const detailOverlays = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelDetailOverlays.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/SpecMediaModals.test.tsx",
      ),
      "utf8",
    );

    expect(detailOverlays).toContain(
      '} from "@/modules/ai_assistant/presentation/SpecMediaModals";',
    );
    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/SpecMediaModals";',
    );
    expect(panel).not.toContain("SpecMediaDetailModal");
    expect(tests).toContain('from "./SpecMediaModals";');
    expect(detailOverlays).not.toContain(
      'from "@/features/superchat/spec-media-modals";',
    );
    for (const ownedOperation of [
      "type SpecMediaDetailSection =",
      "export type SpecMediaDetail =",
      "function triggerDownload(",
      "export function VideoDetailModal(",
      "export function SpecMediaDetailModal(",
    ]) {
      expect(modals).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(modals).toContain('from "@/components/ui/dialog";');
    expect(modals).not.toContain("extractUnifiedMediaItems");
    expect(modals).not.toContain("useSuperChat");
    expect(panel).not.toContain('from "@/components/ui/dialog";');
  });

  it("keeps panel detail overlays outside the SuperChat panel", () => {
    const detailOverlays = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelDetailOverlays.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const panelView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanelView.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/ChatPanelDetailOverlays.test.tsx",
      ),
      "utf8",
    );

    expect(panelView).toContain(
      'from "@/modules/ai_assistant/presentation/ChatPanelDetailOverlays";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/chat-panel-detail-overlays";',
    );
    expect(tests).toContain(
      'from "./ChatPanelDetailOverlays";',
    );
    expect(detailOverlays).toContain(
      "export function ChatPanelDetailOverlays(",
    );
    for (const ownedPresentation of [
      "<MessageDetailPanel",
      "<SpecMediaDetailModal",
      "<FormatCheckDetailsDialog",
      "if (!next) onClearFormatCheckDetails();",
    ]) {
      expect(detailOverlays).toContain(ownedPresentation);
      expect(panel).not.toContain(ownedPresentation);
    }
    expect(detailOverlays).not.toContain("useSuperChat");
    expect(detailOverlays).not.toContain("ReturnType<");
  });

  it("keeps complete panel layout outside the SuperChat controller", () => {
    const view = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanelView.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/presentation/SuperChatPanelView.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/modules/ai_assistant/presentation/SuperChatPanelView";',
    );
    expect(tests).toContain(
      'from "./SuperChatPanelView";',
    );
    expect(view).toContain("export type SuperChatPanelViewProps =");
    expect(view).toContain("export function SuperChatPanelView(");
    for (const ownedPresentation of [
      "relative flex h-full min-h-0 overflow-hidden bg-background",
      '<section className="relative z-10 flex min-w-0 flex-1 flex-col">',
      "<ChatPanelHeader",
      "<ChatPanelContextViews",
      "<ChatMessageArea",
      "<ChatComposer",
      "<ChatPanelDetailOverlays",
      'src="/images/bg-chat-buttom.png"',
    ]) {
      expect(view).toContain(ownedPresentation);
      expect(panel).not.toContain(ownedPresentation);
    }
    expect(view).not.toContain("useSuperChat");
    expect(view).not.toContain("useChatScrollController");
    expect(view).not.toContain("ReturnType<");
    expect(view).not.toContain('from "@/modules/ai_assistant/public";');
    expect(panel).not.toContain('from "@/lib/utils";');
  });

  it("keeps scope mapping and matching outside the controller hook", () => {
    const scope = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/domain/scope.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/domain/scope.test.ts"),
      "utf8",
    );

    expect(hook).toContain("@/modules/ai_assistant/domain/scope");
    expect(tests).toContain('from "@/modules/ai_assistant/public";');
    for (const ownedOperation of [
      "export function scopeForProject(",
      "export function scopeSessionKey(",
      "export function scopeMatches(",
      "export function isChatScope(",
    ]) {
      expect(scope).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    expect(hook).not.toContain("function scopeForProject(");
    expect(hook).not.toContain("function scopeSessionKey(");
    expect(hook).not.toContain("function scopeMatches(");
    expect(hook).not.toContain("function isChatScope(");
  });

  it("keeps message timeline reconciliation outside the controller hook", () => {
    const timeline = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/messageTimeline.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/messageTimeline.test.ts"),
      "utf8",
    );

    expect(hook).toContain(
      'from "@/modules/ai_assistant/application/messageTimeline";',
    );
    expect(tests).toContain('from "@/modules/ai_assistant/public";');
    expect(tests).not.toContain('from "@/features/superchat/use-superchat";');
    for (const ownedOperation of [
      "export function normalizeHistory(",
      "export function sortMessages(",
      "export function turnCompletedInHistory(",
      "export function mergeHistorySnapshot(",
    ]) {
      expect(timeline).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    for (const privateRule of [
      "function normalizedText(",
      "function assistantTextEquivalent(",
      "function hasEquivalentHistoryMessage(",
      "function hasCompletedTurnInHistory(",
    ]) {
      expect(timeline).toContain(privateRule);
      expect(hook).not.toContain(privateRule);
    }
  });

  it("keeps assistant and tool message projection outside the controller hook", () => {
    const projection = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/messageProjection.ts"),
      "utf8",
    );
    const toolMessage = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/domain/toolMessage.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/messageProjection.test.ts"),
      "utf8",
    );

    expect(hook).toContain(
      'from "@/modules/ai_assistant/application/messageProjection";',
    );
    expect(tests).toContain('from "@/modules/ai_assistant/public";');
    for (const ownedOperation of [
      "export function upsertAssistantMessage(",
      "export function upsertServerAssistantMessage(",
      "export function appendToolMessage(",
      "export function shouldPreserveToolMessage(",
      "export function upsertToolMessage(",
    ]) {
      expect(projection).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    for (const privateRule of [
      "function resultText(",
      "export function buildToolMessage(",
    ]) {
      expect(toolMessage).toContain(privateRule);
      expect(hook).not.toContain(privateRule);
    }
    expect(projection).toContain(
      'const EXECUTABLE_HIDDEN_TOOL_NAMES = new Set(["freezone_emit_canvas_command"]);',
    );
    expect(hook).not.toContain("EXECUTABLE_HIDDEN_TOOL_NAMES");
  });

  it("keeps message presentation rules outside the SuperChat panel", () => {
    const rules = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/domain/messagePresentationRules.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/SuperChatPanel.tsx"),
      "utf8",
    );
    const messageView = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/presentation/ChatMessageView.tsx"),
      "utf8",
    );
    const panelProjection = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/panelMessageProjection.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/domain/messagePresentationRules.test.ts",
      ),
      "utf8",
    );

    expect(messageView).toContain(
      'from "@/modules/ai_assistant/domain/messagePresentationRules";',
    );
    expect(panelProjection).toContain(
      'from "@/modules/ai_assistant/domain/messagePresentationRules";',
    );
    expect(panel).not.toContain(
      "messagePresentationRules",
    );
    expect(tests).toContain(
      'from "@/modules/ai_assistant/public";',
    );
    for (const ownedRule of [
      "const ASSISTANT_ERROR_TEXT_PATTERNS",
      "const ASSISTANT_COMPLETION_TEXT_PATTERN",
      "export function isToolMessage(",
      "export function isHistoricalToolMessage(",
      "export function normalizeMessageText(",
      "export function isAssistantErrorReply(",
      "export function assistantCompletionTextEnd(",
      "export function isAssistantCompletionNotice(",
      "export function errorTextRanges(",
    ]) {
      expect(rules).toContain(ownedRule);
      expect(panel).not.toContain(ownedRule);
    }
    expect(rules).not.toContain('from "react"');
    expect(rules).not.toContain("document.");
    expect(rules).not.toContain("window.");
  });

  it("keeps WebSocket lifecycle infrastructure outside the controller hook", () => {
    const socketSession = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/infrastructure/socketSession.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const composition = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/composition.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/infrastructure/socketSession.dom.test.ts",
      ),
      "utf8",
    );

    expect(composition).toContain(
      'from "@/modules/ai_assistant/infrastructure/socketSession";',
    );
    expect(hook).not.toContain("/infrastructure/");
    expect(tests).toContain('from "@/modules/ai_assistant/public";');
    expect(socketSession).toContain(
      'from "@/modules/ai_assistant/domain/contracts";',
    );
    expect(socketSession).toContain("export function createSuperChatSocketSession(");
    expect(hook).not.toContain("function createSuperChatSocketSession(");
    for (const transportDetail of [
      "function resolveChatWsUrl(",
      "new WebSocket(",
      ".onopen =",
      ".onmessage =",
      ".onerror =",
      ".onclose =",
      "RECONNECT_DELAY_MS",
    ]) {
      expect(socketSession).toContain(transportDetail);
      expect(hook).not.toContain(transportDetail);
    }
    for (const removedRef of [
      "wsRef",
      "reconnectRef",
      "closedRef",
      "authRejectedRef",
      "connectionIdRef",
    ]) {
      expect(hook).not.toContain(removedRef);
    }
  });

  it("keeps server frame state transitions in a dedicated controller", () => {
    const frameController = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/useFrameController.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/application/useFrameController.test.tsx"),
      "utf8",
    );

    expect(hook).toContain(
      'from "@/modules/ai_assistant/application/useFrameController";',
    );
    expect(tests).toContain('from "@/modules/ai_assistant/public";');
    expect(frameController).toContain("export function useSuperChatFrameController(");
    expect(hook).not.toContain("function useSuperChatFrameController(");
    expect(frameController).toContain("switch (frame.type)");
    expect(hook).not.toContain("switch (frame.type)");
    for (const frameType of [
      "scope.changed",
      "chat.busy",
      "chat.ping",
      "thread.started",
      "assistant.delta",
      "assistant.message",
      "tool.call",
      "tool.result",
      "chat.done",
      "project.created",
      "error",
    ]) {
      expect(frameController).toContain(`case "${frameType}"`);
      expect(hook).not.toContain(`case "${frameType}"`);
    }
  });

  it("keeps notification and cancellation HTTP commands outside the controller hook", () => {
    const commands = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/infrastructure/chatCommands.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(
        SRC_ROOT,
        "modules/ai_assistant/application/useChatSessionController.ts",
      ),
      "utf8",
    );
    const composition = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/composition.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "modules/ai_assistant/infrastructure/chatCommands.test.ts"),
      "utf8",
    );

    expect(composition).toContain(
      'from "@/modules/ai_assistant/infrastructure/chatCommands";',
    );
    expect(hook).not.toContain("/infrastructure/");
    expect(tests).toContain('from "@/modules/ai_assistant/public";');
    expect(commands).toContain(
      'from "@/modules/ai_assistant/domain/message";',
    );
    for (const operation of [
      "export async function appendChatNotification(",
      "export async function cancelChatBestEffort(",
    ]) {
      expect(commands).toContain(operation);
      expect(hook).not.toContain(operation);
    }
    expect(commands).toContain('from "@/shared/api/transport";');
    expect(commands).toContain("type ChatNotificationResponse =");
    expect(hook).not.toContain('from "@/shared/api/transport";');
    expect(hook).not.toContain("ChatNotificationResponse");
    expect(hook).not.toContain('api.post("api/v1/chat/cancel")');
    expect(hook).not.toContain('.post("api/v1/chat/notifications"');
  });
});
