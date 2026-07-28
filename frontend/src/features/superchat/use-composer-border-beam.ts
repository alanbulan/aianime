// Copyright (c) 2026 AI anime
import { useEffect, useRef } from "react";
import { attachBorderBeam, type BorderBeamController } from "border-beam-vanilla";

export function useComposerBorderBeam(active: boolean) {
  const composerShellRef = useRef<HTMLDivElement | null>(null);
  const composerBeamRef = useRef<BorderBeamController | null>(null);

  useEffect(() => {
    const shell = composerShellRef.current;
    if (!shell) return;
    const beam = attachBorderBeam(shell, {
      size: "md",
      colorVariant: "colorful",
      theme: "dark",
      active: false,
      borderRadius: 16,
      strength: 0.9,
      duration: 1.96,
    });
    composerBeamRef.current = beam;
    return () => {
      composerBeamRef.current = null;
      beam.destroy();
    };
  }, []);

  useEffect(() => {
    composerBeamRef.current?.setActive(active);
  }, [active]);

  return composerShellRef;
}
