// Copyright (c) 2026 AI anime
import { Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  buildAssetShareUrl,
} from "@/modules/asset_world/application/useAssetsDeepLink";
import type { AssetRefType } from "@/modules/asset_world/domain/character";
import { writeTextToClipboard } from "@/shared/platform/text-clipboard";

export function CopyAssetLinkButton({
  type,
  id,
  className,
}: {
  type: AssetRefType;
  id: string;
  className?: string;
}) {
  const { t } = useTranslation();

  async function handleCopy() {
    try {
      await writeTextToClipboard(buildAssetShareUrl(type, id));
      toast.success(t("assets.common.linkCopied"));
    } catch {
      toast.error(t("common.error"));
    }
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={handleCopy}
      aria-label={t("assets.common.copyLink")}
      data-ui-tooltip={t("assets.common.copyLink")}
      className={className}
    >
      <Link2 className="size-3.5" />
    </Button>
  );
}
