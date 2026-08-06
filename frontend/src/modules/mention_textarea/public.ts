export { MentionTextarea } from "@/modules/mention_textarea/MentionTextarea";
export type {
  MentionTextareaProps,
} from "@/modules/mention_textarea/MentionTextarea";
export {
  buildMentionSegments,
  detectMentionQuery,
  filterMentionLabels,
  findMentionTokenAtSelection,
  insertMentionText,
  mentionPreviewPosition,
  replaceMentionText,
} from "@/modules/mention_textarea/domain/mention-text";
export type {
  MentionQuery,
  MentionRange,
  MentionSegment,
  MentionTextEdit,
  MentionToken,
} from "@/modules/mention_textarea/domain/mention-text";
