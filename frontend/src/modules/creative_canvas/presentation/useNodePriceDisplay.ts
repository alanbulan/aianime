// Copyright (c) 2026 AI anime
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveModelPriceDisplay } from '../application/modelPriceDisplay';
import type { ImageModelDefinition } from '../domain/imageModelDefinition';
import type {
  GrsaiCreditTierId,
  PriceDisplayCurrencyMode,
} from '../domain/modelPricing';

interface NodePriceDisplayOptions {
  show: boolean;
  model: ImageModelDefinition | undefined;
  resolution: string;
  extraParams: Record<string, unknown>;
  displayCurrencyMode: PriceDisplayCurrencyMode;
  usdToCnyRate: number;
  preferDiscountedPrice: boolean;
  grsaiCreditTierId: GrsaiCreditTierId;
}

export function useNodePriceDisplay({
  show,
  model,
  resolution,
  extraParams,
  displayCurrencyMode,
  usdToCnyRate,
  preferDiscountedPrice,
  grsaiCreditTierId,
}: NodePriceDisplayOptions) {
  const { t, i18n } = useTranslation();
  const resolvedPriceDisplay = useMemo(
    () =>
      show && model
        ? resolveModelPriceDisplay(model, {
            resolution,
            extraParams,
            language: i18n.language,
            settings: {
              displayCurrencyMode,
              usdToCnyRate,
              preferDiscountedPrice,
              grsaiCreditTierId,
            },
          })
        : null,
    [
      displayCurrencyMode,
      extraParams,
      grsaiCreditTierId,
      i18n.language,
      model,
      preferDiscountedPrice,
      resolution,
      show,
      usdToCnyRate,
    ],
  );
  const resolvedPriceTooltip = useMemo(() => {
    if (!resolvedPriceDisplay) return undefined;
    const lines = [resolvedPriceDisplay.label];
    if (resolvedPriceDisplay.nativeLabel) {
      lines.push(
        t('pricing.nativePrice', {
          value: resolvedPriceDisplay.nativeLabel,
        }),
      );
    }
    if (resolvedPriceDisplay.originalLabel) {
      lines.push(
        t('pricing.originalPrice', {
          value: resolvedPriceDisplay.originalLabel,
        }),
      );
    }
    if (resolvedPriceDisplay.pointsCost) {
      lines.push(
        t('pricing.pointsCost', { count: resolvedPriceDisplay.pointsCost }),
      );
    }
    if (resolvedPriceDisplay.grsaiCreditTier) {
      lines.push(
        t('pricing.grsaiTier', {
          price: resolvedPriceDisplay.grsaiCreditTier.priceCny.toFixed(2),
          credits: resolvedPriceDisplay.grsaiCreditTier.credits.toLocaleString(
            i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US',
          ),
        }),
      );
    }
    return lines.join('\n');
  }, [i18n.language, resolvedPriceDisplay, t]);

  return { resolvedPriceDisplay, resolvedPriceTooltip };
}
