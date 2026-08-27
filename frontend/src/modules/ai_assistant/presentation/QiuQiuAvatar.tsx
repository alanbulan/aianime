// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";

import {
  qiuQiuEmotionName,
  type QiuQiuEmotionId,
} from "@/modules/ai_assistant/domain/qiuQiuEmotion";
import { cn } from "@/lib/utils";

const QIUQIU_RUNTIME_SCRIPTS = [
  "/vendor/emotion-ball/rings.js",
  "/vendor/emotion-ball/emotions.js",
  "/vendor/emotion-ball/ball.js",
  "/vendor/emotion-ball/engine.js",
] as const;

interface EmotionBallEngine {
  destroy: () => void;
  setActive: (active: boolean) => void;
  setEmotion: (emotionId: string) => boolean;
}

interface EmotionBallSdk {
  create: (
    target: HTMLElement,
    options: {
      autostart: boolean;
      emotion: string;
      eyeScale: number;
      fallbackId: string;
      idle: boolean;
      label: string;
      lite: boolean;
      shape: "blob";
    },
  ) => EmotionBallEngine;
}

declare global {
  interface Window {
    EmotionBall?: EmotionBallSdk;
  }
}

let qiuQiuRuntimePromise: Promise<EmotionBallSdk> | null = null;

function loadRuntimeScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = Array.from(
      document.querySelectorAll<HTMLScriptElement>("script[data-qiuqiu-runtime]"),
    ).find((script) => script.dataset.qiuqiuRuntime === src);
    if (existing?.dataset.qiuqiuLoaded === "true") {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.qiuqiuRuntime = src;
    script.addEventListener("load", () => {
      script.dataset.qiuqiuLoaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

export function loadQiuQiuRuntime(): Promise<EmotionBallSdk> {
  if (window.EmotionBall?.create) return Promise.resolve(window.EmotionBall);
  if (!qiuQiuRuntimePromise) {
    qiuQiuRuntimePromise = (async () => {
      for (const src of QIUQIU_RUNTIME_SCRIPTS) {
        await loadRuntimeScript(src);
      }
      if (!window.EmotionBall?.create) {
        throw new Error("Emotion Ball runtime did not initialize");
      }
      return window.EmotionBall;
    })();
  }
  return qiuQiuRuntimePromise;
}

export function QiuQiuAvatar({
  className,
  decorative = false,
  emotionId,
  label = "球球",
}: {
  className?: string;
  decorative?: boolean;
  emotionId: QiuQiuEmotionId;
  label?: string;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const engineRef = useRef<EmotionBallEngine | null>(null);
  const emotionRef = useRef(emotionId);
  const [ready, setReady] = useState(false);
  emotionRef.current = emotionId;
  const emotionName = qiuQiuEmotionName(emotionId);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let observer: IntersectionObserver | null = null;

    void loadQiuQiuRuntime().then((sdk) => {
      if (disposed) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const engine = sdk.create(host, {
        autostart: !reduceMotion,
        emotion: emotionRef.current,
        eyeScale: 1.5,
        fallbackId: "02",
        idle: false,
        label: `${label}：${qiuQiuEmotionName(emotionRef.current)}`,
        lite: true,
        shape: "blob",
      });
      engineRef.current = engine;
      host.dataset.qiuqiuReady = "true";
      setReady(true);

      if (!reduceMotion && "IntersectionObserver" in window) {
        observer = new IntersectionObserver(([entry]) => {
          engine.setActive(entry?.isIntersecting ?? false);
        });
        observer.observe(host);
      }
    }).catch(() => {
      if (!disposed) host.dataset.qiuqiuReady = "false";
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [label]);

  useEffect(() => {
    engineRef.current?.setEmotion(emotionId);
  }, [emotionId]);

  return (
    <span
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center overflow-visible",
        className,
      )}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${label}：${emotionName}`}
      data-qiuqiu-emotion={emotionId}
      data-qiuqiu-state={emotionName}
    >
      <span
        ref={hostRef}
        className="absolute inset-0 block overflow-visible [&>svg]:overflow-visible"
      />
      {!ready && (
        <span className="flex size-[78%] items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
          球
        </span>
      )}
    </span>
  );
}
