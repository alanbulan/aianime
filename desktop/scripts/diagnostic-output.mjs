// Copyright (c) 2026 AI anime

export function createDiagnosticWriter(stream) {
  let pipeClosed = false;

  stream.on("error", (error) => {
    if (error?.code === "EPIPE") {
      pipeClosed = true;
      return;
    }
    throw error;
  });

  return (message) => {
    if (pipeClosed || stream.destroyed || !stream.writable) return;
    try {
      stream.write(message);
    } catch (error) {
      if (error?.code === "EPIPE") {
        pipeClosed = true;
        return;
      }
      throw error;
    }
  };
}
