// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SCENE_ENVIRONMENT_SECTIONS,
  type SceneEnvironmentSectionKey,
  type SceneEnvironmentSections,
} from "@/modules/asset_world/domain/scene-environment";

export function SceneEnvironmentPromptFields({
  sections,
  onChange,
  textareaClassName,
}: {
  sections: SceneEnvironmentSections;
  onChange: (key: SceneEnvironmentSectionKey, value: string) => void;
  textareaClassName?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      {SCENE_ENVIRONMENT_SECTIONS.map((section) => (
        <div key={section.key} className="grid gap-1.5">
          <Label className="text-xs font-normal text-muted-foreground">
            {t(section.i18nKey)}
          </Label>
          <Textarea
            rows={2}
            value={sections[section.key] ?? ""}
            onChange={(event) => onChange(section.key, event.target.value)}
            className={textareaClassName}
          />
        </div>
      ))}
    </div>
  );
}
