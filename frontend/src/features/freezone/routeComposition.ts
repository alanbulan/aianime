// Copyright (c) 2026 AI anime
import { createElement } from "react";

import { useFreezoneProjectPageController } from "./hooks/useFreezoneProjectPageController";
import { FreezoneProjectPageView } from "./presentation/FreezoneProjectPageView";

export interface FreezoneProjectPageProps {
  projectId: string;
}

export function FreezoneProjectPage({ projectId }: FreezoneProjectPageProps) {
  const controller = useFreezoneProjectPageController(projectId);
  return createElement(FreezoneProjectPageView, { controller });
}
