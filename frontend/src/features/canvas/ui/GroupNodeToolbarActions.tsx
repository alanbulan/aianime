// Copyright (c) 2026 AI anime
import { memo } from "react";

import { useGroupNodeToolbarController } from "@/features/canvas/hooks/useGroupNodeToolbarController";

import { GroupNodeToolbarActionsView } from "./GroupNodeToolbarActionsView";

export interface GroupNodeToolbarActionsProps {
  nodeId: string;
  backgroundColor: string | null;
}

export const GroupNodeToolbarActions = memo(
  ({ nodeId, backgroundColor }: GroupNodeToolbarActionsProps) => {
    const controller = useGroupNodeToolbarController({
      nodeId,
      backgroundColor,
    });
    return <GroupNodeToolbarActionsView controller={controller} />;
  },
);

GroupNodeToolbarActions.displayName = "GroupNodeToolbarActions";
