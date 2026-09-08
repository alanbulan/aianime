// Copyright (c) 2026 AI anime
import { lazy, Suspense, type ComponentProps } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useViewerImmersiveBody } from "./useViewerImmersiveBody";

const LazyThreeDDirectorDialog = lazy(() => import("./three-d/ThreeDDirectorDialog")
  .then((module) => ({ default: module.ThreeDDirectorDialog })));
const LazyPanoCaptureDialog = lazy(() => import("./pano/PanoCaptureDialog")
  .then((module) => ({ default: module.PanoCaptureDialog })));

function ViewerLoading({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  useViewerImmersiveBody(true);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>加载取景器</DialogTitle>
        <DialogDescription>正在准备画面，请稍候…</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

export function ThreeDDirectorDialog(props: ComponentProps<typeof LazyThreeDDirectorDialog>) {
  if (!props.open) return null;
  return (
    <Suspense fallback={<ViewerLoading onOpenChange={props.onOpenChange} />}>
      <LazyThreeDDirectorDialog {...props} />
    </Suspense>
  );
}

export function PanoCaptureDialog(props: ComponentProps<typeof LazyPanoCaptureDialog>) {
  if (!props.open) return null;
  return (
    <Suspense fallback={<ViewerLoading onOpenChange={props.onOpenChange} />}>
      <LazyPanoCaptureDialog {...props} />
    </Suspense>
  );
}
