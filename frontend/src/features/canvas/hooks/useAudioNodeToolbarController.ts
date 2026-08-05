// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { projectAudioNodeToolbar, resolveAudioNodeDownloadFilename, type AudioNodeToolbarFormat, resolveImageDisplayUrl, type AudioNodeData } from "@/modules/creative_canvas/public";
import { useCanvasStore } from "@/features/canvas/canvasStore";
;
import {
  downloadBlobAsFile,
  downloadUrlAsFile,
} from "@/lib/browserDownload";
import {
  AUDIO_DOWNLOAD_FORMATS,
  canProduceFormat,
  getAudioExtFromUrl,
  isAudioFormatPassthrough,
  transcodeAudio,
} from "@/lib/audioTranscode";

export interface AudioNodeToolbarControllerOptions {
  nodeId: string;
  data: AudioNodeData;
}

export function useAudioNodeToolbarController({
  nodeId,
  data,
}: AudioNodeToolbarControllerOptions) {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const projection = useMemo(
    () => projectAudioNodeToolbar(nodeId, data),
    [data, nodeId],
  );
  const sourceExt = projection.audioUrl
    ? getAudioExtFromUrl(projection.audioUrl)
    : "";
  const formatOptions = useMemo(
    () =>
      AUDIO_DOWNLOAD_FORMATS.map((format) => ({
        format,
        available: canProduceFormat(format, sourceExt),
      })),
    [sourceExt],
  );

  const download = useCallback(
    async (format: AudioNodeToolbarFormat) => {
      const { audioUrl, baseFilename, hasAudio, isConverting } = projection;
      if (!hasAudio || !audioUrl || isConverting) return;
      if (!canProduceFormat(format, sourceExt)) {
        toast.error(t("nodeToolbar.audio.m4aSourceOnly"));
        return;
      }

      const filename = resolveAudioNodeDownloadFilename(baseFilename, format);
      const resolvedUrl = resolveImageDisplayUrl(audioUrl);
      if (isAudioFormatPassthrough(format, sourceExt)) {
        try {
          await downloadUrlAsFile(resolvedUrl, filename);
        } catch (error) {
          console.error("[audio-download] passthrough failed", error);
          toast.error(t("nodeToolbar.audio.downloadFailed"));
        }
        return;
      }

      updateNodeData(nodeId, { convertingAudioFormat: format });
      try {
        const response = await fetch(resolvedUrl);
        if (!response.ok) {
          throw new Error(`fetch failed: ${response.status}`);
        }
        const sourceBlob = await response.blob();
        const outputBlob = await transcodeAudio(
          sourceBlob,
          sourceExt,
          format,
        );
        downloadBlobAsFile(outputBlob, filename);
      } catch (error) {
        console.error("[audio-download] transcode failed", error);
        toast.error(t("nodeToolbar.audio.downloadFailed"));
      } finally {
        updateNodeData(nodeId, { convertingAudioFormat: null });
      }
    },
    [nodeId, projection, sourceExt, t, updateNodeData],
  );

  return {
    ...projection,
    t,
    formatOptions,
    download,
  };
}

export type AudioNodeToolbarController = ReturnType<
  typeof useAudioNodeToolbarController
>;
