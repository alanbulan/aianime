// Copyright (c) 2026 AI anime
import { Component, type ErrorInfo, type ReactNode } from "react";

import i18n from "@/i18n";
import {
  AppUpdateRequired,
  isChunkLoadError,
} from "@/modules/platform_release/public";

interface AppErrorBoundaryProps {
  children: ReactNode;
  initialError?: unknown;
  onReload?: () => void;
}

interface AppErrorBoundaryState {
  error: unknown | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: this.props.initialError ?? null,
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Uncaught application render error", error, errorInfo);
  }

  private readonly reload = () => {
    if (this.props.onReload) {
      this.props.onReload();
      return;
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (isChunkLoadError(error)) return <AppUpdateRequired />;

    return (
      <main
        className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground"
        role="alert"
        aria-live="assertive"
      >
        <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
          <h1 className="text-lg font-semibold">
            {i18n.t("app.routeError.title")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {i18n.t("app.routeError.description")}
          </p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={this.reload}
          >
            {i18n.t("app.routeError.reload")}
          </button>
        </div>
      </main>
    );
  }
}
