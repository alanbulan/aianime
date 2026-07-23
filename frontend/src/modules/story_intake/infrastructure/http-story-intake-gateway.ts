import { api } from "@/shared/api/transport";
import { jsonWithBackendError } from "@/shared/api/errors";
import { p } from "@/shared/api/path";
import type { ErrorResponse, OkResponse, TaskResponse } from "@/types/api";
import type { StoryIntakeGateway } from "@/modules/story_intake/application/ports";
import type {
  ChaptersResult,
  KnowledgeGraphSnapshot,
  UploadResult,
} from "@/modules/story_intake/domain/types";

export const httpStoryIntakeGateway: StoryIntakeGateway = {
  async uploadNovel(project, file) {
    const formData = new FormData();
    formData.append("file", file);
    return jsonWithBackendError<OkResponse<UploadResult> | ErrorResponse>(
      api.post(p`api/v1/projects/${project}/ingest/upload`, { body: formData }),
    );
  },

  getChapters(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/chapters`, { signal })
      .json<OkResponse<ChaptersResult>>();
  },

  getKnowledgeGraph(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/ingest/graph`, { signal })
      .json<OkResponse<KnowledgeGraphSnapshot>>();
  },

  startIngestion(project, params) {
    return jsonWithBackendError<TaskResponse | ErrorResponse>(
      api.post(p`api/v1/projects/${project}/ingest/start`, {
        json: params,
        throwHttpErrors: false,
      }),
    );
  },
};
