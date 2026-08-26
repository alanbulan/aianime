// Copyright (c) 2026 AI anime
import type { TFunction } from "i18next";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  appendAttachmentAnalysisContext,
  buildAttachmentAnalysisContext,
  buildProductionSourceContext,
  buildReingestCancelledContext,
  buildReingestConfirmationContext,
  buildUploadedFilesContext,
  dataUrlToAttachmentBlob,
  hasVideoCreationIntent,
  isFinalOverwriteConfirmation,
  isNovelAttachment,
  isOverwriteChoice,
  mergeUploadedIngestFiles,
  shouldReportUploadedFiles,
  uploadedIngestFileFromUpload,
  type PreparedIngestAttachment,
  type ReingestConfirmation,
  type AttachmentBlob,
  type UploadedIngestFile,
} from "@/modules/ai_assistant/domain/ingestAutomation";
import type { ChatAttachment } from "@/modules/ai_assistant/domain/contracts";
import { backendErrorToastMessage } from "@/shared/api/errors";
import type {
  FormatCheck,
  StartedIngestion,
  UploadResult,
} from "@/modules/story_intake/public";

type FormatCheckDetails = {
  formatCheck: FormatCheck;
  filename: string;
};

type SendChatMessage = (
  text: string,
  attachments: ChatAttachment[],
  transportText?: string,
) => boolean;

export type UseIngestAutomationControllerOptions = {
  project?: string;
  sendChatMessage: SendChatMessage;
  t: TFunction;
};

export type IngestAutomationPorts = {
  loadUploadedIngestFiles: (project?: string) => UploadedIngestFile[];
  saveUploadedIngestFiles: (
    project: string | undefined,
    files: UploadedIngestFile[],
  ) => void;
  projectHasIngestedContent: (project: string) => Promise<boolean>;
  startNovelIngest: (
    project: string,
    filename: string,
    options?: { rebuild?: boolean },
  ) => Promise<StartedIngestion>;
  uploadNovelForIngest: (
    project: string,
    file: AttachmentBlob,
  ) => Promise<UploadResult>;
};

// Upload already succeeded when a format warning is returned, so warnings are
// surfaced without blocking the ingest flow.
function surfaceFormatCheckWarnings(
  prepared: PreparedIngestAttachment[],
  t: TFunction,
  onViewDetails: (formatCheck: FormatCheck, filename: string) => void,
): void {
  for (const item of prepared) {
    const formatCheck = item.upload?.format_check;
    if (!formatCheck || formatCheck.level !== "warning") continue;
    const filename = item.upload?.filename || item.original.fileName || "";
    toast.warning(formatCheck.summary, {
      action: {
        label: t("aiAssistant.formatCheck.viewDetails"),
        onClick: () => onViewDetails(formatCheck, filename),
      },
    });
  }
}

async function uploadAttachmentsForIngest(
  project: string,
  attachments: ChatAttachment[],
  t: TFunction,
  uploadNovelForIngest: IngestAutomationPorts["uploadNovelForIngest"],
): Promise<PreparedIngestAttachment[]> {
  const prepared: PreparedIngestAttachment[] = [];

  for (const attachment of attachments) {
    const file = isNovelAttachment(attachment)
      ? dataUrlToAttachmentBlob(attachment)
      : null;

    if (!file) {
      prepared.push({ attachment, original: attachment });
      continue;
    }

    try {
      toast.info(
        t("aiAssistant.attachmentAnalysisUploading", { filename: file.filename }),
      );
      const upload = await uploadNovelForIngest(project, file);
      const {
        content: _content,
        path: _path,
        url: _url,
        ...attachmentMetadata
      } = attachment;
      prepared.push({
        upload,
        original: attachment,
        attachment: {
          ...attachmentMetadata,
          fileName: upload.filename,
          fileSize: upload.size,
        },
      });
    } catch (error) {
      const message = backendErrorToastMessage(error, t);
      const { content: _content, ...attachmentMetadata } = attachment;
      prepared.push({
        original: attachment,
        attachment: attachmentMetadata,
        error: message,
      });
    }
  }

  return prepared;
}

export function useIngestAutomationControllerWithPorts({
  project,
  sendChatMessage,
  t,
  ports,
}: UseIngestAutomationControllerOptions & { ports: IngestAutomationPorts }) {
  const {
    loadUploadedIngestFiles,
    projectHasIngestedContent,
    saveUploadedIngestFiles,
    uploadNovelForIngest,
  } = ports;
  const [uploadedIngestFiles, setUploadedIngestFiles] = useState<
    UploadedIngestFile[]
  >(() => loadUploadedIngestFiles(project?.trim()));
  const [reingestConfirmation, setReingestConfirmation] =
    useState<ReingestConfirmation | null>(null);
  const [formatCheckDetails, setFormatCheckDetails] =
    useState<FormatCheckDetails | null>(null);
  const [preparingSend, setPreparingSend] = useState(false);

  useEffect(() => {
    setUploadedIngestFiles(loadUploadedIngestFiles(project?.trim()));
    setReingestConfirmation(null);
  }, [loadUploadedIngestFiles, project]);

  const recordUploadedFiles = useCallback(
    (
      targetProject: string | undefined,
      prepared: PreparedIngestAttachment[],
    ): UploadedIngestFile[] => {
      const additions = prepared
        .map((item) =>
          item.upload
            ? uploadedIngestFileFromUpload(item.upload, item.original.fileName)
            : null,
        )
        .filter((item): item is UploadedIngestFile => Boolean(item));
      if (additions.length === 0) return uploadedIngestFiles;

      const next = mergeUploadedIngestFiles(uploadedIngestFiles, additions);
      setUploadedIngestFiles(next);
      saveUploadedIngestFiles(targetProject, next);
      return next;
    },
    [saveUploadedIngestFiles, uploadedIngestFiles],
  );

  const sendWithIngestAutomation = useCallback(
    async (text: string, messageAttachments: ChatAttachment[]): Promise<boolean> => {
      let nextText = text;
      let transportAttachments = messageAttachments;
      let contextUploadedFiles = uploadedIngestFiles;
      const targetProject = project?.trim();
      const videoIntent = hasVideoCreationIntent(text);
      const hasNovelAttachments = messageAttachments.some(isNovelAttachment);

      if (reingestConfirmation) {
        if (reingestConfirmation.stage === "choose_overwrite") {
          if (!isOverwriteChoice(text)) {
            const pending = reingestConfirmation;
            setReingestConfirmation(null);
            return sendChatMessage(
              text,
              [],
              appendAttachmentAnalysisContext(
                text,
                buildReingestCancelledContext(pending),
              ),
            );
          }

          const nextPending = {
            ...reingestConfirmation,
            stage: "confirm_clear" as const,
          };
          setReingestConfirmation(nextPending);
          return sendChatMessage(
            text,
            [],
            appendAttachmentAnalysisContext(
              text,
              buildReingestConfirmationContext(nextPending),
            ),
          );
        }

        if (!isFinalOverwriteConfirmation(text)) {
          const pending = reingestConfirmation;
          setReingestConfirmation(null);
          return sendChatMessage(
            text,
            [],
            appendAttachmentAnalysisContext(
              text,
              buildReingestCancelledContext(pending),
            ),
          );
        }

        const pending = reingestConfirmation;
        setReingestConfirmation(null);
        nextText = appendAttachmentAnalysisContext(
          text,
          buildProductionSourceContext(
            pending.project,
            pending.source,
            true,
          ),
        );
        return sendChatMessage(text, [], nextText);
      }

      if (videoIntent && hasNovelAttachments) {
        if (!targetProject) {
          toast.error(t("aiAssistant.ingestAutomationNoProject"));
          return false;
        }

        setPreparingSend(true);
        try {
          const prepared = await uploadAttachmentsForIngest(
            targetProject,
            messageAttachments,
            t,
            uploadNovelForIngest,
          );
          surfaceFormatCheckWarnings(prepared, t, (formatCheck, filename) =>
            setFormatCheckDetails({ formatCheck, filename }),
          );
          transportAttachments = prepared.map((item) => item.attachment);
          contextUploadedFiles = recordUploadedFiles(targetProject, prepared);
          const uploaded = prepared.find((item) => item.upload)?.upload;
          if (!uploaded) {
            const error = prepared.find((item) => item.error)?.error;
            throw new Error(
              error || t("aiAssistant.ingestAutomationMissingFile"),
            );
          }
          if (await projectHasIngestedContent(targetProject)) {
            const source = uploadedIngestFileFromUpload(
              uploaded,
              prepared.find((item) => item.upload === uploaded)?.original.fileName,
            );
            const pending: ReingestConfirmation = {
              stage: "choose_overwrite",
              filename: uploaded.filename,
              project: targetProject,
              source,
            };
            setReingestConfirmation(pending);
            nextText = appendAttachmentAnalysisContext(
              text,
              buildReingestConfirmationContext(pending),
            );
            return sendChatMessage(text, transportAttachments, nextText);
          }
          nextText = appendAttachmentAnalysisContext(
            text,
            buildProductionSourceContext(
              targetProject,
              uploadedIngestFileFromUpload(
                uploaded,
                prepared.find((item) => item.upload === uploaded)?.original.fileName,
              ),
              false,
            ),
          );
        } catch (error) {
          const message = backendErrorToastMessage(error, t);
          toast.error(t("aiAssistant.ingestAutomationFailed", { message }));
          return false;
        } finally {
          setPreparingSend(false);
        }
      } else if (
        videoIntent &&
        !hasNovelAttachments &&
        uploadedIngestFiles.length > 0
      ) {
        if (!targetProject) {
          toast.error(t("aiAssistant.ingestAutomationNoProject"));
          return false;
        }

        setPreparingSend(true);
        try {
          const uploaded = uploadedIngestFiles[uploadedIngestFiles.length - 1];
          if (await projectHasIngestedContent(targetProject)) {
            const pending: ReingestConfirmation = {
              stage: "choose_overwrite",
              filename: uploaded.filename,
              project: targetProject,
              source: uploaded,
            };
            setReingestConfirmation(pending);
            nextText = appendAttachmentAnalysisContext(
              text,
              buildReingestConfirmationContext(pending),
            );
            return sendChatMessage(text, [], nextText);
          }
          nextText = appendAttachmentAnalysisContext(
            text,
            buildProductionSourceContext(targetProject, uploaded, false),
          );
        } catch (error) {
          const message = backendErrorToastMessage(error, t);
          toast.error(t("aiAssistant.ingestAutomationFailed", { message }));
          return false;
        } finally {
          setPreparingSend(false);
        }
      } else if (messageAttachments.length > 0) {
        setPreparingSend(true);
        try {
          const prepared = targetProject
            ? await uploadAttachmentsForIngest(
                targetProject,
                messageAttachments,
                t,
                uploadNovelForIngest,
              )
            : messageAttachments.map((attachment) => ({
                attachment,
                original: attachment,
              }));
          surfaceFormatCheckWarnings(prepared, t, (formatCheck, filename) =>
            setFormatCheckDetails({ formatCheck, filename }),
          );
          transportAttachments = prepared.map((item) => item.attachment);
          contextUploadedFiles = recordUploadedFiles(targetProject, prepared);
          nextText = appendAttachmentAnalysisContext(
            text,
            buildAttachmentAnalysisContext(targetProject, prepared),
          );
        } finally {
          setPreparingSend(false);
        }
      }

      if (shouldReportUploadedFiles(text)) {
        nextText = appendAttachmentAnalysisContext(
          nextText,
          buildUploadedFilesContext(targetProject, contextUploadedFiles),
        );
      }

      return sendChatMessage(text, transportAttachments, nextText);
    },
    [
      project,
      projectHasIngestedContent,
      recordUploadedFiles,
      reingestConfirmation,
      sendChatMessage,
      t,
      uploadNovelForIngest,
      uploadedIngestFiles,
    ],
  );

  const clearFormatCheckDetails = useCallback(() => {
    setFormatCheckDetails(null);
  }, []);

  return {
    clearFormatCheckDetails,
    formatCheckDetails,
    preparingSend,
    sendWithIngestAutomation,
  };
}
