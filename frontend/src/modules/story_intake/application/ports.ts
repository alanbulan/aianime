import type { ErrorResponse, OkResponse, TaskResponse } from "@/types/api";
import type {
  ChaptersResult,
  KnowledgeGraphSnapshot,
  StartIngestionParams,
  UploadResult,
} from "@/modules/story_intake/domain/types";

export interface StoryIntakeGateway {
  uploadNovel(
    project: string,
    file: File,
  ): Promise<OkResponse<UploadResult> | ErrorResponse>;
  getChapters(
    project: string,
    signal?: AbortSignal,
  ): Promise<OkResponse<ChaptersResult>>;
  getKnowledgeGraph(
    project: string,
    signal?: AbortSignal,
  ): Promise<OkResponse<KnowledgeGraphSnapshot>>;
  startIngestion(
    project: string,
    params: StartIngestionParams,
  ): Promise<TaskResponse | ErrorResponse>;
}

export interface ImportPreviewPreference {
  read(project: string): boolean;
  write(project: string, hidden: boolean): void;
}
