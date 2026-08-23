// Copyright (c) 2026 AI anime
import { useEffect, useRef } from 'react';

import {
  takeExternalFile,
  type ExternalFileChannel,
} from '../application/pendingExternalFiles';

interface ExternalFilePayload {
  nodeId: string;
  file?: File;
}

export function useExternalFileHandoff(
  channel: ExternalFileChannel,
  nodeId: string,
  subscribe: (
    handler: (payload: ExternalFilePayload) => void,
  ) => () => void,
  onFile: (file: File) => void,
): void {
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });

  useEffect(() => {
    const drain = (fallback?: File) => {
      const file = takeExternalFile(channel, nodeId) ?? fallback;
      if (file) onFileRef.current(file);
    };
    drain();
    return subscribe(({ nodeId: targetId, file }) => {
      if (targetId !== nodeId) return;
      drain(file);
    });
  }, [channel, nodeId, subscribe]);
}
