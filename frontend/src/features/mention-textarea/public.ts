export { MentionTextarea } from "@/features/mention-textarea/MentionTextarea";
export type {
  MentionTextareaProps,
} from "@/features/mention-textarea/MentionTextarea";
export {
  buildMentionSegments,
  detectMentionQuery,
  filterMentionLabels,
  findMentionTokenAtSelection,
  insertMentionText,
  mentionPreviewPosition,
  replaceMentionText,
} from "@/features/mention-textarea/domain/mention-text";
export type {
  MentionQuery,
  MentionRange,
  MentionSegment,
  MentionTextEdit,
  MentionToken,
} from "@/features/mention-textarea/domain/mention-text";
