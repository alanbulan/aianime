// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");

describe("SuperChat boundaries", () => {
  it("keeps message cache persistence outside the controller hook", () => {
    const cache = readFileSync(
      resolve(SRC_ROOT, "features/superchat/message-cache.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/message-cache.test.ts"),
      "utf8",
    );

    expect(hook).toContain(
      'from "@/features/superchat/message-cache";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/message-cache";',
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

  it("keeps active turn persistence and status rules outside the controller hook", () => {
    const activeTurn = readFileSync(
      resolve(SRC_ROOT, "features/superchat/active-turn.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/active-turn.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/active-turn";');
    expect(tests).toContain('from "@/features/superchat/active-turn";');
    for (const ownedOperation of [
      "function activeTurnKey(",
      "function loadActiveTurn(",
      "export function saveActiveTurn(",
      "export function clearActiveTurn(",
      "export function activeTurnIsPending(",
      "export function loadPendingActiveTurn(",
      "export function currentTurnIsLive(",
    ]) {
      expect(activeTurn).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    expect(activeTurn).not.toContain("export function activeTurnKey(");
    expect(activeTurn).not.toContain("export function loadActiveTurn(");
    expect(activeTurn).toContain('const ACTIVE_TURN_PREFIX = "superchat:active-turn:";');
    expect(hook).not.toContain("ACTIVE_TURN_PREFIX");
    expect(hook).not.toContain("hasStructuredContent");
  });

  it("keeps local preference persistence outside the controller hook", () => {
    const storage = readFileSync(
      resolve(SRC_ROOT, "features/superchat/preferences-storage.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/preferences-storage.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/preferences-storage";');
    expect(tests).toContain('from "@/features/superchat/preferences-storage";');
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
      resolve(SRC_ROOT, "features/superchat/ingest-upload-storage.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "features/superchat/use-ingest-automation-controller.ts",
      ),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/ingest-upload-storage.test.ts",
      ),
      "utf8",
    );

    expect(controller).toContain(
      'from "@/features/superchat/ingest-upload-storage";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/ingest-upload-storage";',
    );
    for (const ownedOperation of [
      "function uploadedIngestFilesKey(",
      "function isUploadedIngestFile(",
      "export function loadUploadedIngestFiles(",
      "export function saveUploadedIngestFiles(",
      "export function mergeUploadedIngestFiles(",
      "export function uploadedIngestFileFromUpload(",
    ]) {
      expect(storage).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(storage).toContain(
      'const UPLOADED_INGEST_FILES_PREFIX = "superchat:ingest-uploads:";',
    );
    expect(panel).not.toContain("UPLOADED_INGEST_FILES_PREFIX");
    expect(panel).not.toContain("localStorage.");
  });

  it("keeps ingest automation rules outside the SuperChat panel", () => {
    const domain = readFileSync(
      resolve(SRC_ROOT, "features/superchat/ingest-automation-domain.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/ingest-automation-domain.test.ts",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/ingest-automation-domain";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/ingest-automation-domain";',
    );
    for (const ownedOperation of [
      "function extensionOf(",
      "function dataUrlToText(",
      "export function hasVideoCreationIntent(",
      "export function shouldReportUploadedFiles(",
      "export function isNovelAttachment(",
      "export function isAllowedScriptUpload(",
      "export function isAllowedScriptDragItem(",
      "export function isOverwriteChoice(",
      "export function isFinalOverwriteConfirmation(",
      "export function dataUrlToAttachmentBlob(",
      "export function buildUploadedFilesContext(",
      "export function buildReingestConfirmationContext(",
      "export function buildReingestCancelledContext(",
      "export function buildAttachmentAnalysisContext(",
      "export function appendIngestAutomationContext(",
      "export function appendAttachmentAnalysisContext(",
    ]) {
      expect(domain).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    for (const ownedConstant of [
      "VIDEO_CREATION_RE",
      "UPLOADED_FILES_QUERY_RE",
      "NOVEL_ATTACHMENT_EXTENSIONS",
      "INLINE_TEXT_ATTACHMENT_LIMIT",
    ]) {
      expect(domain).toContain(ownedConstant);
      expect(panel).not.toContain(ownedConstant);
    }
    expect(domain).not.toContain("toast.");
    expect(domain).not.toContain("uploadStoryDocument");
    expect(domain).not.toContain("startStoryIngestion");
    expect(domain).not.toContain("readPipelineStatus");
  });

  it("keeps ingest infrastructure calls outside the SuperChat panel", () => {
    const gateway = readFileSync(
      resolve(SRC_ROOT, "features/superchat/ingest-automation-gateway.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "features/superchat/use-ingest-automation-controller.ts",
      ),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/ingest-automation-gateway.test.ts",
      ),
      "utf8",
    );

    expect(controller).toContain(
      'from "@/features/superchat/ingest-automation-gateway";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/ingest-automation-gateway";',
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
  });

  it("keeps ingest application orchestration outside the SuperChat panel", () => {
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "features/superchat/use-ingest-automation-controller.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/use-ingest-automation-controller.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/use-ingest-automation-controller";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/use-ingest-automation-controller";',
    );
    for (const ownedOperation of [
      "function surfaceFormatCheckWarnings(",
      "async function uploadAttachmentsForIngest(",
      "export function useIngestAutomationController(",
      "const recordUploadedFiles = useCallback(",
    ]) {
      expect(controller).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controller).toContain(
      'from "@/features/superchat/ingest-automation-domain";',
    );
    expect(controller).toContain(
      'from "@/features/superchat/ingest-automation-gateway";',
    );
    expect(controller).toContain(
      'from "@/features/superchat/ingest-upload-storage";',
    );
    expect(panel).not.toContain("backendErrorToastMessage");
    expect(panel).not.toContain("reingestConfirmation");
    expect(panel).not.toContain("uploadedIngestFiles");
  });

  it("keeps timeline projection and interaction in a dedicated view", () => {
    const timeline = readFileSync(
      resolve(SRC_ROOT, "features/superchat/chat-timeline.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/chat-timeline.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/chat-timeline";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/chat-timeline";',
    );
    for (const ownedOperation of [
      "type TimelineTurn =",
      "function buildTimelineTurns(",
      "export function ChatTimeline(",
      "const updateScrollEdges = useCallback(",
      "const scrollToTurn = useCallback(",
      "const revealTimelineContext = useCallback(",
    ]) {
      expect(timeline).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(timeline).toContain(
      'from "@/features/superchat/timeline-scroll";',
    );
    expect(timeline).toContain('import { createPortal } from "react-dom";');
    expect(panel).not.toContain("calculateTimelineContextDelta");
  });

  it("keeps UiSpec media projection outside the SuperChat panel", () => {
    const projection = readFileSync(
      resolve(SRC_ROOT, "features/superchat/spec-media-projection.ts"),
      "utf8",
    );
    const gallery = readFileSync(
      resolve(SRC_ROOT, "features/superchat/spec-media-gallery.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/spec-media-projection.test.ts",
      ),
      "utf8",
    );

    expect(gallery).toContain(
      'from "@/features/superchat/spec-media-projection";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/spec-media-projection";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/spec-media-projection";',
    );
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
  });

  it("keeps UiSpec media gallery presentation outside the SuperChat panel", () => {
    const gallery = readFileSync(
      resolve(SRC_ROOT, "features/superchat/spec-media-gallery.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const messageView = readFileSync(
      resolve(SRC_ROOT, "features/superchat/chat-message-view.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/spec-media-gallery.test.tsx",
      ),
      "utf8",
    );

    expect(messageView).toContain(
      'from "@/features/superchat/spec-media-gallery";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/spec-media-gallery";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/spec-media-gallery";',
    );
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
      'from "@/features/superchat/spec-media-projection";',
    );
    expect(gallery).toContain(
      'from "@/features/superchat/spec-media-modals";',
    );
    expect(gallery).toContain('from "@/lib/media-url";');
    expect(gallery).not.toContain("useSuperChat");
  });

  it("keeps recursive structured JSON rendering in a dedicated view", () => {
    const jsonView = readFileSync(
      resolve(SRC_ROOT, "features/superchat/structured-json-view.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const messageView = readFileSync(
      resolve(SRC_ROOT, "features/superchat/chat-message-view.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/structured-json-view.test.tsx",
      ),
      "utf8",
    );

    expect(messageView).toContain(
      'from "@/features/superchat/structured-json-view";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/structured-json-view";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/structured-json-view";',
    );
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

  it("keeps chat message presentation in a dedicated view", () => {
    const messageView = readFileSync(
      resolve(SRC_ROOT, "features/superchat/chat-message-view.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/chat-message-view.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/chat-message-view";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/chat-message-view";',
    );
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
      expect(panel).not.toContain(ownedOperation);
    }
    expect(messageView).toContain(
      'from "@/features/superchat/message-presentation-rules";',
    );
    expect(messageView).toContain(
      'from "@/features/superchat/spec-media-gallery";',
    );
    expect(messageView).not.toContain("useSuperChat");
  });

  it("keeps chat header controls in a controller-independent view", () => {
    const controls = readFileSync(
      resolve(SRC_ROOT, "features/superchat/chat-control-bar.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/chat-control-bar.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/chat-control-bar";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/chat-control-bar";',
    );
    for (const ownedOperation of [
      "type ChatControlBarModel =",
      "export function ControlBar(",
      "export function HeaderControlPortal(",
    ]) {
      expect(controls).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(controls).toContain('import { createPortal } from "react-dom";');
    expect(controls).not.toContain("useSuperChat");
    expect(controls).not.toContain("ReturnType<");
  });

  it("keeps approval presentation outside the SuperChat panel", () => {
    const approvalCard = readFileSync(
      resolve(SRC_ROOT, "features/superchat/approval-card.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/approval-card.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/approval-card";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/approval-card";',
    );
    expect(approvalCard).toContain("export function ApprovalCard(");
    expect(panel).not.toContain("function ApprovalCard(");
    expect(approvalCard).toContain(
      'import type { ApprovalRequest } from "@/features/superchat/types";',
    );
    expect(approvalCard).not.toContain("useSuperChat");
  });

  it("keeps secondary panel views outside the SuperChat panel", () => {
    const searchBar = readFileSync(
      resolve(SRC_ROOT, "features/superchat/chat-search-bar.tsx"),
      "utf8",
    );
    const pinnedPanel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/pinned-messages-panel.tsx"),
      "utf8",
    );
    const detailPanel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/message-detail-panel.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/panel-secondary-views.test.tsx",
      ),
      "utf8",
    );

    for (const [moduleSource, importPath, ownedOperation] of [
      [searchBar, "chat-search-bar", "export function SearchBar("],
      [pinnedPanel, "pinned-messages-panel", "export function PinnedPanel("],
      [detailPanel, "message-detail-panel", "export function MessageDetailPanel("],
    ]) {
      expect(panel).toContain(
        `from "@/features/superchat/${importPath}";`,
      );
      expect(tests).toContain(
        `from "@/features/superchat/${importPath}";`,
      );
      expect(moduleSource).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation.replace("export ", ""));
      expect(moduleSource).not.toContain("useSuperChat");
    }
    expect(detailPanel).toContain(
      'from "@/features/superchat/chat-message-view";',
    );
    expect(detailPanel).toContain(
      'from "@/features/superchat/spec-extract";',
    );
  });

  it("keeps browser speech recognition in a dedicated controller", () => {
    const speechController = readFileSync(
      resolve(
        SRC_ROOT,
        "features/superchat/use-speech-input-controller.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/use-speech-input-controller.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/use-speech-input-controller";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/use-speech-input-controller";',
    );
    for (const ownedOperation of [
      "type SpeechRecognitionLike =",
      "function createSpeechRecognition(",
      "export function useSpeechInputController(",
      "const speechRef = useRef<SpeechRecognitionLike | null>(null);",
      "recognition.onresult =",
      "recognition.onend =",
    ]) {
      expect(speechController).toContain(ownedOperation);
      expect(panel).not.toContain(ownedOperation);
    }
    expect(speechController).not.toContain("useSuperChat");
    expect(panel).not.toContain("SpeechRecognition");
    expect(panel).not.toContain("speechRef");
    expect(panel).not.toContain("setRecording");
  });

  it("keeps panel message selection and render projection in a pure module", () => {
    const projection = readFileSync(
      resolve(SRC_ROOT, "features/superchat/panel-message-projection.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/panel-message-projection.test.ts",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/panel-message-projection";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/panel-message-projection";',
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
      'from "@/features/superchat/message-presentation-rules";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/message-presentation-rules";',
    );
    expect(projection).not.toContain('from "react"');
    expect(projection).not.toContain("document.");
    expect(projection).not.toContain("window.");
  });

  it("keeps task completion notification orchestration outside the SuperChat panel", () => {
    const controller = readFileSync(
      resolve(
        SRC_ROOT,
        "features/superchat/use-task-completion-notifications.ts",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/use-task-completion-notifications.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/use-task-completion-notifications";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/use-task-completion-notifications";',
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
      'from "@/task-center/event-bus-context";',
    );
    expect(controller).toContain(
      'from "@/features/superchat/task-notification-label";',
    );
    expect(panel).not.toContain(
      'from "@/task-center/event-bus-context";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/task-notification-label";',
    );
  });

  it("keeps spec media modal presentation outside the SuperChat panel", () => {
    const modals = readFileSync(
      resolve(SRC_ROOT, "features/superchat/spec-media-modals.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/spec-media-modals.test.tsx",
      ),
      "utf8",
    );

    expect(panel).toContain(
      'from "@/features/superchat/spec-media-modals";',
    );
    expect(tests).toContain(
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

  it("keeps scope mapping and matching outside the controller hook", () => {
    const scope = readFileSync(
      resolve(SRC_ROOT, "features/superchat/scope.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/scope.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/scope";');
    expect(tests).toContain('from "@/features/superchat/scope";');
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
      resolve(SRC_ROOT, "features/superchat/message-timeline.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/message-timeline.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/message-timeline";');
    expect(tests).toContain('from "@/features/superchat/message-timeline";');
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
      resolve(SRC_ROOT, "features/superchat/message-projection.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/message-projection.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/message-projection";');
    expect(tests).toContain('from "@/features/superchat/message-projection";');
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
      "function buildToolMessage(",
    ]) {
      expect(projection).toContain(privateRule);
      expect(hook).not.toContain(privateRule);
    }
    expect(projection).toContain(
      'const EXECUTABLE_HIDDEN_TOOL_NAMES = new Set(["freezone_emit_canvas_command"]);',
    );
    expect(hook).not.toContain("EXECUTABLE_HIDDEN_TOOL_NAMES");
  });

  it("keeps message presentation rules outside the SuperChat panel", () => {
    const rules = readFileSync(
      resolve(SRC_ROOT, "features/superchat/message-presentation-rules.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(SRC_ROOT, "features/superchat/superchat-panel.tsx"),
      "utf8",
    );
    const messageView = readFileSync(
      resolve(SRC_ROOT, "features/superchat/chat-message-view.tsx"),
      "utf8",
    );
    const panelProjection = readFileSync(
      resolve(SRC_ROOT, "features/superchat/panel-message-projection.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(
        SRC_ROOT,
        "__tests__/features/superchat/message-presentation-rules.test.ts",
      ),
      "utf8",
    );

    expect(messageView).toContain(
      'from "@/features/superchat/message-presentation-rules";',
    );
    expect(panelProjection).toContain(
      'from "@/features/superchat/message-presentation-rules";',
    );
    expect(panel).not.toContain(
      'from "@/features/superchat/message-presentation-rules";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/message-presentation-rules";',
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
      resolve(SRC_ROOT, "features/superchat/socket-session.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/socket-session.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/socket-session";');
    expect(tests).toContain('from "@/features/superchat/socket-session";');
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
      resolve(SRC_ROOT, "features/superchat/use-frame-controller.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/use-frame-controller.test.tsx"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/use-frame-controller";');
    expect(tests).toContain('from "@/features/superchat/use-frame-controller";');
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
      resolve(SRC_ROOT, "features/superchat/chat-commands.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/chat-commands.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/chat-commands";');
    expect(tests).toContain('from "@/features/superchat/chat-commands";');
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
