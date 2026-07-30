// Copyright (c) 2026 AI anime
import { memo } from "react";

import { projectNodeActionToolbarShell } from "@/features/canvas/application/nodeActionToolbarShellModel";

import {
  NodeActionToolbarView,
  type NodeActionToolbarViewProps,
} from "./NodeActionToolbarView";

type NodeActionToolbarProps = Omit<
  NodeActionToolbarViewProps,
  "projection"
>;

export const NodeActionToolbar = memo((props: NodeActionToolbarProps) => {
  const projection = projectNodeActionToolbarShell(props.node);
  return <NodeActionToolbarView {...props} projection={projection} />;
});

NodeActionToolbar.displayName = "NodeActionToolbar";
