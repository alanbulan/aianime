// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { CONSTANTS, Viewer } from '@photo-sphere-viewer/core';

import { dataUrlToBlob } from '@/shared/media/data-url';
import {
  PANO_DIRECTION_OFFSETS,
  PANO_GRID_2X2_FRAMES,
  PANO_GRID_4X3_FRAMES,
  buildPanoCorrectionEntry,
  clampPanoPitch,
  resolvePanoCorrectionAxis,
  resolvePanoUpstreamSource,
  resolvePanoViewerNodeSize,
  type PanoCaptureFrameSpec,
  type PanoDirection,
} from '@/features/canvas/application/pano360ViewerNodeModel';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  CANVAS_NODE_TYPES,
  type Pano360ViewerNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import {
  uploadAndAutoCommitSelectedBackgroundCandidate,
  uploadLocalImageToBackend,
} from '@/features/canvas/composition';
import { useUpstreamNodes } from '@/features/canvas/hooks/useUpstreamGraph';
import {
  getFreezoneCanvasMetadata,
  resolveImageDisplayUrl,
} from '@/modules/creative_canvas/public';
import {
  PANO_DEGREES_TO_RADIANS,
  PANO_FOV_MAX,
  PANO_FOV_MIN,
  centeredPanoCropRect,
  clampPanoFov,
  normalizePanoDegrees,
  panoFovToFocal,
  panoFovToZoom,
  panoZoomToFov,
  waitPanoFrames,
} from '@/features/viewer-kit/public';

const {
  ROTATE_UP,
  ROTATE_DOWN,
  ROTATE_LEFT,
  ROTATE_RIGHT,
  ZOOM_IN,
  ZOOM_OUT,
} = CONSTANTS.ACTIONS;

interface PanoLivePosition {
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
}

interface PanoPlanetBackup {
  fov: number;
  yawDeg: number;
  pitchDeg: number;
}

export interface Pano360ViewerNodeControllerOptions {
  projectId: string;
  id: string;
  data: Pano360ViewerNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}

async function cropDataUrlTo16x9(
  dataUrl: string,
  width: number,
  height: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const crop = centeredPanoCropRect(width, height, 16 / 9);
  const output = document.createElement('canvas');
  output.width = crop.width;
  output.height = crop.height;
  const context = output.getContext('2d');
  if (!context) return { dataUrl, width, height };
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('image load failed'));
  });
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );
  return {
    dataUrl: output.toDataURL('image/png'),
    width: crop.width,
    height: crop.height,
  };
}

export function usePano360ViewerNodeController({
  projectId,
  id,
  data,
  selected,
  width,
  height,
}: Pano360ViewerNodeControllerOptions) {
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addPanoCaptureGroup = useCanvasStore(
    (state) => state.addPanoCaptureGroup,
  );
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const upstreamNodes = useUpstreamNodes(id);

  const isActive = Boolean(selected) && selectedNodeId === id;
  const size = useMemo(
    () => resolvePanoViewerNodeSize(width, height),
    [height, width],
  );
  const upstreamPano = useMemo(
    () => resolvePanoUpstreamSource(upstreamNodes),
    [upstreamNodes],
  );
  const title = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.pano360Viewer, data),
    [data],
  );
  const displayUrl = useMemo(
    () => (data.imageUrl ? resolveImageDisplayUrl(data.imageUrl) : null),
    [data.imageUrl],
  );

  const viewerHostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const selectedRef = useRef(isActive);
  selectedRef.current = isActive;
  const isFullscreenRef = useRef(false);

  const [status, setStatus] = useState('');
  const [viewerError, setViewerError] = useState('');
  const [livePosition, setLivePosition] = useState<PanoLivePosition>({
    yawDeg: 0,
    pitchDeg: 0,
    fovDeg: data.fovDeg,
  });
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [planetBackup, setPlanetBackup] =
    useState<PanoPlanetBackup | null>(null);

  useEffect(() => {
    if (upstreamPano) {
      if (
        upstreamPano.url !== data.imageUrl ||
        upstreamPano.nodeId !== (data.sourceNodeId ?? null)
      ) {
        updateNodeData(id, {
          imageUrl: upstreamPano.url,
          sourceNodeId: upstreamPano.nodeId,
        });
      }
      return;
    }
    if (data.sourceNodeId) {
      updateNodeData(id, { imageUrl: null, sourceNodeId: null });
    }
  }, [data.imageUrl, data.sourceNodeId, id, updateNodeData, upstreamPano]);

  const applyCorrectionOn = useCallback((viewer: Viewer) => {
    if (!viewer.state.ready) return;
    const { roll, pitch, yaw } = dataRef.current.sphereCorrectionDeg;
    viewer.setOption('sphereCorrection', {
      pan: yaw * PANO_DEGREES_TO_RADIANS,
      tilt: pitch * PANO_DEGREES_TO_RADIANS,
      roll: roll * PANO_DEGREES_TO_RADIANS,
    });
  }, []);

  const applyFovOn = useCallback((viewer: Viewer, fovDeg: number) => {
    if (!viewer.state.ready) return;
    viewer.zoom(panoFovToZoom(fovDeg));
  }, []);

  const applyCorrection = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer) applyCorrectionOn(viewer);
  }, [applyCorrectionOn]);

  const applyFov = useCallback(
    (fovDeg: number) => {
      const viewer = viewerRef.current;
      if (viewer) applyFovOn(viewer, fovDeg);
    },
    [applyFovOn],
  );

  useEffect(() => {
    const host = viewerHostRef.current;
    if (!host) return;
    if (!displayUrl) {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      setStatus('');
      setViewerError('');
      return;
    }

    const fovDeg = clampPanoFov(dataRef.current.fovDeg || 70);
    let cancelled = false;
    let viewer: Viewer | null = null;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        viewer = new Viewer({
          container: host,
          defaultZoomLvl: panoFovToZoom(fovDeg),
          navbar: false,
          minFov: PANO_FOV_MIN,
          maxFov: PANO_FOV_MAX,
          mousemove: isActive,
          mousewheel: isActive,
          keyboard: 'fullscreen',
          keyboardActions: {
            ArrowUp: ROTATE_UP,
            ArrowDown: ROTATE_DOWN,
            ArrowLeft: ROTATE_LEFT,
            ArrowRight: ROTATE_RIGHT,
            w: ROTATE_UP,
            W: ROTATE_UP,
            s: ROTATE_DOWN,
            S: ROTATE_DOWN,
            a: ROTATE_LEFT,
            A: ROTATE_LEFT,
            d: ROTATE_RIGHT,
            D: ROTATE_RIGHT,
            PageUp: ZOOM_IN,
            PageDown: ZOOM_OUT,
            '+': ZOOM_IN,
            '-': ZOOM_OUT,
          },
          defaultTransition: null as unknown as undefined,
          rendererParameters: { preserveDrawingBuffer: true },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Photo Sphere Viewer 初始化失败: ${String(error)}`;
        setViewerError(message);
        setStatus(message);
        return;
      }

      viewerRef.current = viewer;
      setViewerError('');
      const activeViewer = viewer;
      activeViewer.addEventListener('ready', () => {
        if (cancelled) return;
        setStatus('就绪');
        applyCorrectionOn(activeViewer);
        applyFovOn(
          activeViewer,
          clampPanoFov(dataRef.current.fovDeg || 70),
        );
      });
      activeViewer.addEventListener('panorama-loaded', () => {
        if (!cancelled) setStatus('已加载');
      });
      activeViewer.addEventListener('panorama-error', (event: unknown) => {
        if (cancelled) return;
        const payload = event as {
          error?: Error | string;
          panorama?: string;
        } | null;
        const error = payload?.error;
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : '加载失败';
        setStatus(message);
        setViewerError(message);
      });
      activeViewer.addEventListener(
        'position-updated',
        ({ position }: { position: { yaw: number; pitch: number } }) => {
          if (cancelled) return;
          setLivePosition((current) => ({
            ...current,
            yawDeg: position.yaw / PANO_DEGREES_TO_RADIANS,
            pitchDeg: position.pitch / PANO_DEGREES_TO_RADIANS,
          }));
        },
      );
      activeViewer.addEventListener(
        'zoom-updated',
        ({ zoomLevel }: { zoomLevel: number }) => {
          if (cancelled) return;
          setLivePosition((current) => ({
            ...current,
            fovDeg: panoZoomToFov(zoomLevel),
          }));
        },
      );
      activeViewer.addEventListener(
        'fullscreen',
        ({ fullscreenEnabled }: { fullscreenEnabled: boolean }) => {
          isFullscreenRef.current = fullscreenEnabled;
          const enabled = fullscreenEnabled || selectedRef.current;
          activeViewer.setOption('mousemove', enabled);
          activeViewer.setOption('mousewheel', enabled);
        },
      );

      setStatus('加载中...');
      activeViewer
        .setPanorama(displayUrl, { showLoader: false, transition: false })
        .then(() => {
          if (cancelled) return;
          setStatus('已加载');
          applyCorrectionOn(activeViewer);
          applyFovOn(
            activeViewer,
            clampPanoFov(dataRef.current.fovDeg || 70),
          );
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message =
            error instanceof Error
              ? error.message
              : `加载失败: ${String(error)}`;
          setStatus(message);
          setViewerError(message);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (viewer) {
        if (viewerRef.current === viewer) viewerRef.current = null;
        viewer.destroy();
      }
    };
    // Viewer identity is intentionally bound only to the displayed panorama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyCorrectionOn, applyFovOn, displayUrl]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const enabled = isFullscreenRef.current || isActive;
    viewer.setOption('mousemove', enabled);
    viewer.setOption('mousewheel', enabled);
  }, [displayUrl, isActive]);

  useEffect(() => {
    const host = viewerHostRef.current;
    if (!host) return;
    let dragging = false;

    const radiansPerPixel = () => {
      const fovRadians =
        clampPanoFov(dataRef.current.fovDeg || 70) *
        PANO_DEGREES_TO_RADIANS;
      return fovRadians / (host.clientHeight || 1);
    };
    const rotateBy = (deltaX: number, deltaY: number) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const factor = radiansPerPixel();
      const position = viewer.getPosition();
      viewer.rotate({
        yaw: position.yaw - deltaX * factor,
        pitch: position.pitch + deltaY * factor,
      });
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!isFullscreenRef.current && !selectedRef.current) return;
      if ((event.target as HTMLElement | null)?.closest('.nodrag, .psv-navbar')) {
        return;
      }
      dragging = true;
      const fullscreenElement = (
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement ||
        null
      ) as HTMLElement | null;
      const target = fullscreenElement ?? host;
      try {
        const result = target.requestPointerLock?.() as unknown;
        if (
          result &&
          typeof (result as Promise<void>).catch === 'function'
        ) {
          (result as Promise<void>).catch(() => {});
        }
      } catch {
        // Photo Sphere Viewer retains its bounded drag fallback.
      }
    };
    const handleMouseMove = (event: MouseEvent) => {
      const lockedElement = document.pointerLockElement as HTMLElement | null;
      if (!lockedElement) return;
      if (lockedElement !== host && !host.contains(lockedElement)) return;
      if (!dragging) {
        document.exitPointerLock();
        return;
      }
      event.preventDefault();
      rotateBy(event.movementX, event.movementY);
    };
    const handleMouseUp = () => {
      dragging = false;
      if (document.pointerLockElement) document.exitPointerLock();
    };

    host.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      host.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, size.height, size.width, updateNodeInternals]);

  const updateCorrectionAxis = useCallback(
    (axis: 'roll' | 'pitch' | 'yaw', next: number) => {
      const current = dataRef.current.sphereCorrectionDeg;
      updateNodeData(id, {
        sphereCorrectionDeg: {
          ...current,
          [axis]: resolvePanoCorrectionAxis(axis, next),
        },
      });
      requestAnimationFrame(() => applyCorrection());
    },
    [applyCorrection, id, updateNodeData],
  );

  const resetCorrection = useCallback(() => {
    updateNodeData(id, {
      sphereCorrectionDeg: { roll: 0, pitch: 0, yaw: 0 },
    });
    requestAnimationFrame(() => applyCorrection());
  }, [applyCorrection, id, updateNodeData]);

  const resetView = useCallback(() => {
    viewerRef.current?.rotate({ yaw: 0, pitch: 0 });
  }, []);

  const toggleFullscreen = useCallback(() => {
    viewerRef.current?.toggleFullscreen();
  }, []);

  const lockCurrentView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const position = viewer.getPosition();
    const current = dataRef.current.sphereCorrectionDeg;
    const yaw = normalizePanoDegrees(
      current.yaw + position.yaw / PANO_DEGREES_TO_RADIANS,
    );
    const pitch = clampPanoPitch(
      current.pitch + position.pitch / PANO_DEGREES_TO_RADIANS,
    );
    updateNodeData(id, {
      sphereCorrectionDeg: { roll: current.roll, pitch, yaw },
    });
    requestAnimationFrame(() => {
      applyCorrection();
      viewer.rotate({ yaw: 0, pitch: 0 });
    });
  }, [applyCorrection, id, updateNodeData]);

  const setFrontYawFromView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const yawDeg = normalizePanoDegrees(
      viewer.getPosition().yaw / PANO_DEGREES_TO_RADIANS,
    );
    updateNodeData(id, { frontYawDeg: yawDeg });
    setStatus(`已设当前视角为 Front: ${yawDeg.toFixed(1)}°`);
  }, [id, updateNodeData]);

  const setFrontYaw = useCallback(
    (next: number) => {
      updateNodeData(id, { frontYawDeg: normalizePanoDegrees(next) });
    },
    [id, updateNodeData],
  );

  const setFovDeg = useCallback(
    (next: number) => {
      const clamped = clampPanoFov(next);
      updateNodeData(id, { fovDeg: clamped });
      applyFov(clamped);
    },
    [applyFov, id, updateNodeData],
  );

  const rotateToDirection = useCallback((direction: PanoDirection) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const yaw = normalizePanoDegrees(
      dataRef.current.frontYawDeg + PANO_DIRECTION_OFFSETS[direction],
    );
    viewer.rotate({
      yaw: yaw * PANO_DEGREES_TO_RADIANS,
      pitch: 0,
    });
  }, []);

  const enterPlanet = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const position = viewer.getPosition();
    setPlanetBackup({
      fov: dataRef.current.fovDeg,
      yawDeg: position.yaw / PANO_DEGREES_TO_RADIANS,
      pitchDeg: position.pitch / PANO_DEGREES_TO_RADIANS,
    });
    setFovDeg(160);
    viewer.rotate({ yaw: 0, pitch: -Math.PI / 2 });
  }, [setFovDeg]);

  const exitPlanet = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !planetBackup) return;
    setFovDeg(planetBackup.fov);
    viewer.rotate({
      yaw: planetBackup.yawDeg * PANO_DEGREES_TO_RADIANS,
      pitch: planetBackup.pitchDeg * PANO_DEGREES_TO_RADIANS,
    });
    setPlanetBackup(null);
  }, [planetBackup, setFovDeg]);

  const copyCorrectionJson = useCallback(async () => {
    const entry = buildPanoCorrectionEntry(dataRef.current);
    updateNodeData(id, { lastExportedEntry: entry });
    const text = JSON.stringify(entry, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('校正 JSON 已复制到剪贴板');
    } catch (error) {
      console.warn('[pano360] clipboard write failed', error);
      setStatus('已生成校正 JSON（剪贴板不可用，见控制台）');
      console.info('[pano360] correction JSON:\n' + text);
    }
  }, [id, updateNodeData]);

  const getViewerCanvas = useCallback((): HTMLCanvasElement | null => {
    return viewerHostRef.current?.querySelector('canvas') ?? null;
  }, []);

  const snapCurrent = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer || !data.imageUrl) return;
    setIsCapturing(true);
    try {
      await waitPanoFrames();
      const canvas = getViewerCanvas();
      if (!canvas) return;
      const cropped = await cropDataUrlTo16x9(
        canvas.toDataURL('image/png'),
        canvas.width,
        canvas.height,
      );
      const uploadedUrl = await uploadLocalImageToBackend(
        projectId,
        cropped.dataUrl,
        `pano-${id}-${Date.now()}.png`,
      );
      const nodeId = addPanoCaptureGroup(id, [
        { ...cropped, uploadedUrl, label: '当前视角' },
      ]);
      setStatus(nodeId ? '已生成当前视角截图' : '截图失败');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`截图失败: ${message}`);
    } finally {
      setIsCapturing(false);
    }
  }, [addPanoCaptureGroup, data.imageUrl, getViewerCanvas, id, projectId]);

  const snapAsBackgroundAnchor = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer || !data.imageUrl) return;
    const canvasMetadata = getFreezoneCanvasMetadata();
    const preset = (canvasMetadata?.preset as
      | { episode?: number; beat?: number }
      | undefined) ?? undefined;
    const episode = typeof preset?.episode === 'number' ? preset.episode : null;
    const beat = typeof preset?.beat === 'number' ? preset.beat : null;
    if (episode === null || beat === null) {
      setStatus('当前不在镜头上下文中,无法设为背景源');
      return;
    }
    setIsCapturing(true);
    try {
      await waitPanoFrames();
      const canvas = getViewerCanvas();
      if (!canvas) return;
      const cropped = await cropDataUrlTo16x9(
        canvas.toDataURL('image/png'),
        canvas.width,
        canvas.height,
      );
      const blob = dataUrlToBlob(cropped.dataUrl);
      await uploadAndAutoCommitSelectedBackgroundCandidate(
        projectId,
        { episode, beat },
        blob,
        `background_pano360_${Date.now()}.png`,
        {
          sourceNodeId: id,
          label: '当前背景',
          successMessage: '已设置当前背景',
        },
      );
      setStatus('已生成当前背景候选并提交');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`设置失败: ${message}`);
    } finally {
      setIsCapturing(false);
    }
  }, [data.imageUrl, getViewerCanvas, projectId]);

  const captureFrame = useCallback(
    async (yawDeg: number, pitchDeg: number, fovDeg: number) => {
      const viewer = viewerRef.current;
      if (!viewer) throw new Error('viewer not ready');
      viewer.zoom(panoFovToZoom(fovDeg));
      viewer.rotate({
        yaw: yawDeg * PANO_DEGREES_TO_RADIANS,
        pitch: pitchDeg * PANO_DEGREES_TO_RADIANS,
      });
      await waitPanoFrames(3);
      const canvas = getViewerCanvas();
      if (!canvas) throw new Error('canvas not found');
      return {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      };
    },
    [getViewerCanvas],
  );

  const captureToGroup = useCallback(
    async (
      columns: number,
      frames: readonly PanoCaptureFrameSpec[],
      fov: number,
      groupName: string,
    ) => {
      const viewer = viewerRef.current;
      if (!viewer || !data.imageUrl) return;
      setIsCapturing(true);
      const savedPosition = viewer.getPosition();
      const savedFov = dataRef.current.fovDeg;
      try {
        setStatus(`截图中（${frames.length} 张）…`);
        const frontYaw = dataRef.current.frontYawDeg;
        const captures: {
          dataUrl: string;
          width: number;
          height: number;
          label: string;
          uploadedUrl?: string;
        }[] = [];
        for (const frame of frames) {
          const yaw = normalizePanoDegrees(frontYaw + frame.yawOffset);
          const shot = await captureFrame(yaw, frame.pitch, fov);
          const cropped = await cropDataUrlTo16x9(
            shot.dataUrl,
            shot.width,
            shot.height,
          );
          captures.push({ ...cropped, label: frame.label });
        }
        viewer.rotate(savedPosition);
        applyFov(savedFov);
        setStatus(`上传中（${captures.length} 张）…`);
        await Promise.all(
          captures.map(async (capture, index) => {
            capture.uploadedUrl = await uploadLocalImageToBackend(
              projectId,
              capture.dataUrl,
              `pano-${id}-${Date.now()}-${index}.png`,
            );
          }),
        );
        const groupId = addPanoCaptureGroup(id, captures, {
          cols: columns,
          groupName,
        });
        setStatus(
          groupId ? `已生成 ${captures.length} 张截图` : '截图失败',
        );
      } catch (error) {
        viewer.rotate(savedPosition);
        applyFov(savedFov);
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`截图失败: ${message}`);
      } finally {
        setIsCapturing(false);
      }
    },
    [addPanoCaptureGroup, applyFov, captureFrame, data.imageUrl, id, projectId],
  );

  const snap2x2 = useCallback(
    () =>
      captureToGroup(
        2,
        PANO_GRID_2X2_FRAMES,
        90,
        '全景截图组 (4 张)',
      ),
    [captureToGroup],
  );
  const snap4x3 = useCallback(
    () =>
      captureToGroup(
        4,
        PANO_GRID_4X3_FRAMES,
        75,
        '全景截图组 (12 张)',
      ),
    [captureToGroup],
  );

  const zoomViewportBy = useCallback(
    (deltaFov: number) => {
      const baseFov =
        dataRef.current.fovDeg || livePosition.fovDeg || 70;
      setFovDeg(baseFov + deltaFov);
    },
    [livePosition.fovDeg, setFovDeg],
  );

  const rotateViewportBy = useCallback(
    (yawDeltaDeg: number, pitchDeltaDeg: number) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const position = viewer.getPosition();
      viewer.rotate({
        yaw:
          position.yaw +
          yawDeltaDeg * PANO_DEGREES_TO_RADIANS,
        pitch:
          clampPanoPitch(
            position.pitch / PANO_DEGREES_TO_RADIANS + pitchDeltaDeg,
          ) * PANO_DEGREES_TO_RADIANS,
      });
    },
    [],
  );

  const liveFov = livePosition.fovDeg || data.fovDeg;
  const focal = Number.isFinite(liveFov)
    ? panoFovToFocal(clampPanoFov(liveFov))
    : null;

  return {
    id,
    data,
    selected,
    isActive,
    size,
    title,
    status,
    viewerError,
    livePosition,
    liveFov,
    focal,
    isPanelOpen,
    isCapturing,
    planetBackup,
    viewerHostRef,
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    togglePanel: () => setIsPanelOpen((current) => !current),
    updateCorrectionAxis,
    resetCorrection,
    resetView,
    toggleFullscreen,
    lockCurrentView,
    setFrontYawFromView,
    setFrontYaw,
    setFovDeg,
    rotateToDirection,
    enterPlanet,
    exitPlanet,
    copyCorrectionJson,
    snapCurrent,
    snapAsBackgroundAnchor,
    snap2x2,
    snap4x3,
    zoomViewportBy,
    rotateViewportBy,
  };
}

export type Pano360ViewerNodeController = ReturnType<
  typeof usePano360ViewerNodeController
>;
