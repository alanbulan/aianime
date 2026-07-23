import {
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { clusterConfig } from "@/lib/cluster-config";
import { initObservability } from "@/lib/observability";
import { initRegionTabSync } from "@/lib/region-tab-sync";
import { authRequired } from "@/lib/runtime-config";
import { useAuthStore } from "@/modules/identity_access/public";
import {
  canonicalProjectRouteParam,
  useAllProjectSummaries,
} from "@/modules/project_workspace/public";
import { useAppStore } from "@/stores/app-store";
import { useRegionStore } from "@/stores/region-store";

export function useAppLayoutController() {
  const navigate = useNavigate();
  const username = useAuthStore((state) => state.username);
  const validateSession = useAuthStore((state) => state.validateSession);
  const refreshAvatar = useAuthStore((state) => state.refreshAvatar);
  const [validated, setValidated] = useState(false);
  const validatedUsernameRef = useRef<string | null>(null);
  const params = useParams({ strict: false }) as { project?: string };
  const routeProject = params.project ?? null;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projectSummaries = useAllProjectSummaries();
  const canonicalProject = routeProject
    ? canonicalProjectRouteParam(routeProject, projectSummaries.data)
    : null;
  const reducedMotion = useReducedMotion();
  const routeMatch = pathname.match(/^\/projects\/([^/]+)(?:\/([^/]+))?/);
  const routeTransitionKey = routeMatch
    ? `/projects/${routeMatch[1]}/${routeMatch[2] ?? ""}`
    : pathname;
  const isAssistantPage = /^\/projects\/[^/]+\/assistant$/.test(pathname);

  useEffect(() => {
    const clamp = useAppStore.getState().clampDimensionsToViewport;
    clamp();
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(clamp);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (username) void refreshAvatar();
  }, [username, refreshAvatar]);

  useEffect(() => {
    useRegionStore.getState().sanitizeAgainstConfig();
    if (clusterConfig.mode !== "multi-region") return;
    initObservability();
    return initRegionTabSync();
  }, []);

  useEffect(() => {
    if (!username) {
      if (authRequired()) {
        validatedUsernameRef.current = null;
        setValidated(false);
        navigate({ to: "/login" });
        return;
      }
      let cancelled = false;
      setValidated(false);
      void validateSession().then((ok) => {
        if (cancelled) return;
        if (!ok) {
          validatedUsernameRef.current = null;
          navigate({ to: "/login" });
          return;
        }
        validatedUsernameRef.current = useAuthStore.getState().username;
        setValidated(true);
      });
      return () => {
        cancelled = true;
      };
    }

    if (validatedUsernameRef.current === username) {
      setValidated(true);
      return;
    }
    let cancelled = false;
    setValidated(false);
    void validateSession().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        validatedUsernameRef.current = null;
        navigate({ to: "/login" });
        return;
      }
      validatedUsernameRef.current = username;
      setValidated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [username, navigate, validateSession]);

  useEffect(() => {
    if (
      routeProject &&
      !projectSummaries.isLoading &&
      canonicalProject === null
    ) {
      navigate({ to: "/", replace: true });
    }
  }, [canonicalProject, navigate, projectSummaries.isLoading, routeProject]);

  return {
    canonicalProject,
    isAssistantPage,
    loading:
      Boolean(routeProject && projectSummaries.isLoading) ||
      !username ||
      !validated,
    reducedMotion,
    routeTransitionKey,
  };
}

export type AppLayoutController = ReturnType<typeof useAppLayoutController>;
