// Copyright (c) 2026 AI anime
import { memo } from "react";

import {
  BeatCardView,
  createBeatCardController,
  type BeatCardControllerOptions,
} from "@/modules/narrative_planning/public";

function BeatCardAdapter(props: BeatCardControllerOptions) {
  return <BeatCardView controller={createBeatCardController(props)} />;
}

export const BeatCard = memo(BeatCardAdapter);
