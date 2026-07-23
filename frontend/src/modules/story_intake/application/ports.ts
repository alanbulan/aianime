import type {
  ChaptersResult,
  KnowledgeGraphSnapshot,
  StartIngestionParams,
  UploadResult,
} from "@/modules/story_intake/domain/types";

export interface StartedIngestion {
  taskType: string;
  taskId?: string;
  taskKey?: string;
  message: string;
  backend?: string;
  queue?: string | null;
}

export interface StoryIntakeGateway {
  uploadNovel(project: string, file: File): Promise<UploadResult>;
  getChapters(
    project: string,
    signal?: AbortSignal,
  ): Promise<ChaptersResult>;
  getKnowledgeGraph(
    project: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeGraphSnapshot>;
  startIngestion(
    project: string,
    params: StartIngestionParams,
  ): Promise<StartedIngestion>;
}

export interface ImportPreviewPreference {
  read(project: string): boolean;
  write(project: string, hidden: boolean): void;
}
