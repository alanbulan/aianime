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
