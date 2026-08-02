// Copyright (c) 2026 AI anime

// Media drawn to an exported canvas must opt into CORS. Data and blob URLs
// are already local to the renderer and cannot taint the canvas.
export function mediaNeedsCrossOrigin(url: string): boolean {
  const lower = url.toLowerCase();
  return !lower.startsWith('data:') && !lower.startsWith('blob:');
}
