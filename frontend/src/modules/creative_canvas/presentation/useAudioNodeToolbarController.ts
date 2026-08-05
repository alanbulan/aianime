// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  projectAudioNodeToolbar,
  resolveAudioNodeDownloadFilename,
  type AudioNodeToolbarFormat,
} from "../application/audioNodeToolbarModel";
import type { AudioNodeData } from "../domain/canvasNodeData";
import { resolveImageDisplayUrl } from "../domain/imageData";

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

export interface AudioNodeToolbarStore {
  updateNodeData: (
    id: string,
    patch: Partial<AudioNodeData>,
  ) => void;
}

export type AudioNodeToolbarStoreHook = <TSelected>(
  selector: (state: AudioNodeToolbarStore) => TSelected,
) => TSelected;

export interface AudioNodeToolbarControllerOptions {
  nodeId: string;
  data: AudioNodeData;
}

export function createUseAudioNodeToolbarController({
  useStore,
}: {
  useStore: AudioNodeToolbarStoreHook;
}) {
  return function useAudioNodeToolbarController({
    nodeId,
    data,
  }: AudioNodeToolbarControllerOptions) {
    const { t } = useTranslation();
    const updateNodeData = useStore((state) => state.updateNodeData);
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
  };
}

export type AudioNodeToolbarController = ReturnType<
  ReturnType<typeof createUseAudioNodeToolbarController>
>;
