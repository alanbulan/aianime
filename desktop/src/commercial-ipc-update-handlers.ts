// Copyright (c) 2026 AI anime

import { selectReleaseArtifactId } from "./commercial-contracts.js";
import {
  CommercialApiError,
  requiredIdentifier,
  requiredInteger,
} from "./commercial-api-client.js";
import type { CommercialIpcContext } from "./commercial-ipc-context.js";

export function registerCommercialUpdateHandlers(
  context: CommercialIpcContext,
): void {
  const { channels, client, options } = context;

  context.handle(channels.announcements, (input) =>
    client.announcements(
      input === undefined ? 20 : requiredInteger(input, "limit"),
    ),
  );
  context.handle(channels.checkRelease, async () =>
    selectReleaseArtifactId(
      await client.checkRelease({
        currentVersion: options.clientVersion,
        target: options.platform,
        arch: options.arch,
      }),
      options.platform,
      options.arch,
    ),
  );
  context.handle(channels.downloadUpdate, async (input) => {
    const artifactId = requiredIdentifier(input, "artifactId");
    if (!options.releaseUpdater) {
      throw new CommercialApiError("客户端尚未配置更新器");
    }
    return options.releaseUpdater.download(artifactId);
  });
  context.handle(channels.installUpdate, () => {
    if (!options.releaseUpdater) {
      throw new CommercialApiError("客户端尚未配置更新器");
    }
    options.releaseUpdater.install();
  });
}
