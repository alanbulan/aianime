// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  projectNodeActionGenerationError,
  projectNodeActionStoryboardText,
  resolveNodeActionImageDownloadFilename,
} from "../application/nodeActionToolbarModel";
import type { CanvasNode } from "../domain/canvasNodeData";
import { isImageEditNode } from "../domain/canvasNodePredicates";
import { resolveCanvasNodeSourceImageUrl } from "../domain/canvasNodeImageSource";
import { resolveImageDisplayUrl } from "../domain/imageData";

import { downloadUrlAsFile } from "@/lib/browserDownload";

const COPY_FEEDBACK_DURATION_MS = 1100;

export interface NodeOutputToolbarSettingsStore {
  ignoreAtTagWhenCopyingAndGenerating: boolean;
}

export type NodeOutputToolbarSettingsStoreHook = <TSelected>(
  selector: (state: NodeOutputToolbarSettingsStore) => TSelected,
) => TSelected;

export interface NodeOutputToolbarControllerOptions {
  node: CanvasNode;
}

export function createUseNodeOutputToolbarController({
  useSettingsStore,
}: {
  useSettingsStore: NodeOutputToolbarSettingsStoreHook;
}) {
  return function useNodeOutputToolbarController({
    node,
  }: NodeOutputToolbarControllerOptions) {
    const { t, i18n } = useTranslation();
    const ignoreAtTagWhenCopyingAndGenerating = useSettingsStore(
      (state) => state.ignoreAtTagWhenCopyingAndGenerating,
    );
    const [isCopyTextSuccess, setIsCopyTextSuccess] = useState(false);
    const [isCopyErrorSuccess, setIsCopyErrorSuccess] = useState(false);
    const copyTextFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const copyErrorFeedbackTimerRef = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    const generationErrorFallback = t("ai.error");
    const generationErrorProjection = useMemo(
      () => projectNodeActionGenerationError(node, generationErrorFallback),
      [generationErrorFallback, node],
    );
    const storyboardTextProjection = useMemo(
      () =>
        projectNodeActionStoryboardText(
          node,
          ignoreAtTagWhenCopyingAndGenerating,
          (index, content) =>
            t("nodeToolbar.storyboardLine", { index, content }),
        ),
      [ignoreAtTagWhenCopyingAndGenerating, i18n.language, node, t],
    );
    const imageSource = useMemo(
      () =>
        isImageEditNode(node) ? null : resolveCanvasNodeSourceImageUrl(node),
      [node],
    );
    const imageDownloadFilename = useMemo(
      () => resolveNodeActionImageDownloadFilename(node),
      [node],
    );

    useEffect(() => {
      return () => {
        if (copyTextFeedbackTimerRef.current) {
          clearTimeout(copyTextFeedbackTimerRef.current);
        }
        if (copyErrorFeedbackTimerRef.current) {
          clearTimeout(copyErrorFeedbackTimerRef.current);
        }
      };
    }, []);

    const copyStoryboardText = useCallback(async () => {
      if (!storyboardTextProjection.text) return;

      setIsCopyTextSuccess(true);
      if (copyTextFeedbackTimerRef.current) {
        clearTimeout(copyTextFeedbackTimerRef.current);
      }
      copyTextFeedbackTimerRef.current = setTimeout(() => {
        setIsCopyTextSuccess(false);
        copyTextFeedbackTimerRef.current = null;
      }, COPY_FEEDBACK_DURATION_MS);

      try {
        await navigator.clipboard.writeText(storyboardTextProjection.text);
      } catch (error) {
        console.error("Failed to copy storyboard text", error);
      }
    }, [storyboardTextProjection.text]);

    const copyGenerationError = useCallback(async () => {
      if (!generationErrorProjection.canCopy) return;

      setIsCopyErrorSuccess(true);
      if (copyErrorFeedbackTimerRef.current) {
        clearTimeout(copyErrorFeedbackTimerRef.current);
      }
      copyErrorFeedbackTimerRef.current = setTimeout(() => {
        setIsCopyErrorSuccess(false);
        copyErrorFeedbackTimerRef.current = null;
      }, COPY_FEEDBACK_DURATION_MS);

      try {
        await navigator.clipboard.writeText(generationErrorProjection.report);
      } catch (error) {
        console.error("Failed to copy generation error report", error);
      }
    }, [generationErrorProjection]);

    const downloadImage = useCallback(async () => {
      if (!imageSource) return;
      try {
        await downloadUrlAsFile(
          resolveImageDisplayUrl(imageSource),
          imageDownloadFilename,
        );
      } catch (error) {
        console.error("Failed to download image", error);
      }
    }, [imageDownloadFilename, imageSource]);

    return {
      t,
      canCopyStoryboardText: storyboardTextProjection.canCopy,
      canCopyGenerationError: generationErrorProjection.canCopy,
      canDownloadImage: Boolean(imageSource),
      isCopyTextSuccess,
      isCopyErrorSuccess,
      copyStoryboardText,
      copyGenerationError,
      downloadImage,
    };
  };
}

export type NodeOutputToolbarController = ReturnType<
  ReturnType<typeof createUseNodeOutputToolbarController>
>;
