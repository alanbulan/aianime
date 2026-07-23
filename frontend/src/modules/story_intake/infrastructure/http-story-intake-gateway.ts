import { api } from "@/shared/api/transport";
import { jsonWithBackendError } from "@/shared/api/errors";
import { p } from "@/shared/api/path";
import type {
  StartedIngestion,
  StoryIntakeGateway,
} from "@/modules/story_intake/application/ports";
import type {
  ChaptersResult,
  FormatCheck,
  KnowledgeGraphSnapshot,
  UploadResult,
} from "@/modules/story_intake/domain/types";

interface ApiDataResponse<T> {
  ok: true;
  data: T;
}

interface ApiTaskResponse {
  ok: true;
  task_type: string;
  task_id?: string;
  task_key?: string;
  message: string;
  backend?: string;
  queue?: string | null;
}

interface ApiErrorResponse {
  ok: false;
  error: string;
  format_check?: FormatCheck;
}

function responseError(response: ApiErrorResponse): Error {
  return new Error(response.format_check?.summary || response.error);
}

function unwrapData<T>(response: ApiDataResponse<T> | ApiErrorResponse): T {
  if (!response.ok) throw responseError(response);
  return response.data;
}

function mapStartedIngestion(
  response: ApiTaskResponse | ApiErrorResponse,
): StartedIngestion {
  if (!response.ok) throw responseError(response);
  return {
    taskType: response.task_type,
    taskId: response.task_id,
    taskKey: response.task_key,
    message: response.message,
    backend: response.backend,
    queue: response.queue,
  };
}

export const httpStoryIntakeGateway: StoryIntakeGateway = {
  async uploadNovel(project, file) {
    const formData = new FormData();
    formData.append("file", file);
    return unwrapData(
      await jsonWithBackendError<
        ApiDataResponse<UploadResult> | ApiErrorResponse
      >(api.post(p`api/v1/projects/${project}/ingest/upload`, { body: formData })),
    );
  },

  async getChapters(project, signal) {
    return unwrapData(
      await jsonWithBackendError<
        ApiDataResponse<ChaptersResult> | ApiErrorResponse
      >(api.get(p`api/v1/projects/${project}/chapters`, { signal })),
    );
  },

  async getKnowledgeGraph(project, signal) {
    return unwrapData(
      await jsonWithBackendError<
        ApiDataResponse<KnowledgeGraphSnapshot> | ApiErrorResponse
      >(api.get(p`api/v1/projects/${project}/ingest/graph`, { signal })),
    );
  },

  async startIngestion(project, params) {
    return mapStartedIngestion(
      await jsonWithBackendError<ApiTaskResponse | ApiErrorResponse>(
        api.post(p`api/v1/projects/${project}/ingest/start`, {
          json: params,
          throwHttpErrors: false,
        }),
      ),
    );
  },
};
