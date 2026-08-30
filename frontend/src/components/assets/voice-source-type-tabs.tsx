// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VOICE_SOURCE_TYPES } from "@/shared/voice-source/voice-source";

export function VoiceSourceTypeTabs() {
  const { t } = useTranslation();

  return (
    <TabsList className="grid w-full grid-cols-3 rounded-full bg-muted p-1">
      {VOICE_SOURCE_TYPES.map((sourceType) => (
        <TabsTrigger
          key={sourceType}
          value={sourceType}
          className="rounded-full text-sm"
        >
          {t(`voiceSourceTypes.${sourceType}`)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
