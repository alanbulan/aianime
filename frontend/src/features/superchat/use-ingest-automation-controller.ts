// Copyright (c) 2026 AI anime
import type { TFunction } from "i18next";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  appendAttachmentAnalysisContext,
  appendIngestAutomationContext,
  buildAttachmentAnalysisContext,
  buildReingestCancelledContext,
  buildReingestConfirmationContext,
  buildUploadedFilesContext,
  dataUrlToAttachmentBlob,
  hasVideoCreationIntent,
  isFinalOverwriteConfirmation,
  isNovelAttachment,
  isOverwriteChoice,
  shouldReportUploadedFiles,
  type PreparedIngestAttachment,
  type ReingestConfirmation,
} from "@/features/superchat/ingest-automation-domain";
import {
  projectHasIngestedContent,
  startNovelIngest,
  uploadNovelForIngest,
} from "@/features/superchat/ingest-automation-gateway";
import {
  loadUploadedIngestFiles,
  mergeUploadedIngestFiles,
  saveUploadedIngestFiles,
  uploadedIngestFileFromUpload,
  type UploadedIngestFile,
} from "@/features/superchat/ingest-upload-storage";
import type { ChatAttachment } from "@/features/superchat/types";
import { backendErrorToastMessage } from "@/shared/api/errors";
import type { FormatCheck } from "@/modules/story_intake/public";

type FormatCheckDetails = {
  formatCheck: FormatCheck;
  filename: string;
};

type SendChatMessage = (
  text: string,
  attachments: ChatAttachment[],
  transportText?: string,
) => boolean;

type UseIngestAutomationControllerOptions = {
  project?: string;
  sendChatMessage: SendChatMessage;
  t: TFunction;
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

export function useIngestAutomationController({
  project,
  sendChatMessage,
  t,
}: UseIngestAutomationControllerOptions) {
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
  }, [project]);

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
    [uploadedIngestFiles],
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

        setPreparingSend(true);
        try {
          const started = await startNovelIngest(
            reingestConfirmation.project,
            reingestConfirmation.filename,
            { rebuild: true },
          );
          nextText = appendIngestAutomationContext(text, {
            filename: reingestConfirmation.filename,
            taskType: started.taskType,
            taskKey: started.taskKey,
            message: started.message,
            rebuild: true,
          });
          toast.success(
            t("aiAssistant.ingestAutomationStarted", {
              filename: reingestConfirmation.filename,
            }),
          );
          setReingestConfirmation(null);
          return sendChatMessage(text, [], nextText);
        } catch (error) {
          const message = backendErrorToastMessage(error, t);
          toast.error(t("aiAssistant.ingestAutomationFailed", { message }));
          return false;
        } finally {
          setPreparingSend(false);
        }
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
            const pending: ReingestConfirmation = {
              stage: "choose_overwrite",
              filename: uploaded.filename,
              project: targetProject,
            };
            setReingestConfirmation(pending);
            nextText = appendAttachmentAnalysisContext(
              text,
              buildReingestConfirmationContext(pending),
            );
            return sendChatMessage(text, transportAttachments, nextText);
          }
          const started = await startNovelIngest(
            targetProject,
            uploaded.filename,
          );
          nextText = appendIngestAutomationContext(text, {
            filename: uploaded.filename,
            taskType: started.taskType,
            taskKey: started.taskKey,
            message: started.message,
            rebuild: false,
          });
          toast.success(
            t("aiAssistant.ingestAutomationStarted", {
              filename: uploaded.filename,
            }),
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
            };
            setReingestConfirmation(pending);
            nextText = appendAttachmentAnalysisContext(
              text,
              buildReingestConfirmationContext(pending),
            );
            return sendChatMessage(text, [], nextText);
          }
          const started = await startNovelIngest(
            targetProject,
            uploaded.filename,
          );
          nextText = appendIngestAutomationContext(text, {
            filename: uploaded.filename,
            taskType: started.taskType,
            taskKey: started.taskKey,
            message: started.message,
            rebuild: false,
          });
          toast.success(
            t("aiAssistant.ingestAutomationStarted", {
              filename: uploaded.filename,
            }),
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
      recordUploadedFiles,
      reingestConfirmation,
      sendChatMessage,
      t,
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
