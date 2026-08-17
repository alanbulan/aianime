import type { SpineTemplate } from "@/modules/project_workspace/public";

export interface Chapter {
  number: number;
  title?: string | null;
  start_line?: number;
  end_line?: number;
  content?: string;
  word_count?: number;
  char_count?: number;
}

export interface FormatCheckIssue {
  code: string;
  line: number | null;
  message: string;
  fix: string;
}

export interface FormatCheck {
  level: "ok" | "warning" | "blocking";
  summary: string;
  issues?: FormatCheckIssue[];
  metrics?: Record<string, number>;
}

export interface UploadResult {
  filename: string;
  size: number;
  total_chars?: number;
  billable_chars?: number;
  count?: number;
  chapters?: Chapter[];
  format_check?: FormatCheck;
}

export interface ChaptersResult {
  chapters: Chapter[];
  total_chars: number;
  billable_chars?: number;
  count?: number;
  preview_only?: boolean;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: string;
  degree: number;
  properties: Record<string, unknown>;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  properties: Record<string, unknown>;
}

export interface KnowledgeGraphSnapshot {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  total_nodes: number;
  total_edges: number;
  truncated: boolean;
}

export interface StartIngestionParams {
  filename: string;
  rebuild?: boolean;
  spine_template?: SpineTemplate;
}
