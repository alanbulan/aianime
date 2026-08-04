// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { ImageModelDefinition } from '../domain/imageModelDefinition';
import {
  createFixedResolutionPricing,
  createGrsaiPointsPricing,
  resolveModelPriceDisplay,
  resolvePriceDisplayCurrency,
} from './modelPriceDisplay';

function imageModel(
  pricing: ImageModelDefinition['pricing'],
): ImageModelDefinition {
  return {
    id: 'authorized-image',
    mediaType: 'image',
    displayName: 'Authorized Image',
    description: '',
    eta: '',
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    aspectRatios: [{ value: '1:1', label: '1:1' }],
    resolutions: [{ value: '1K', label: '1K' }],
    pricing,
    resolveRequest: () => ({
      requestModel: 'authorized-image',
      modeLabel: 'generate',
    }),
  };
}

describe('model price display', () => {
  it('uses the discounted fixed rate only when the setting enables it', () => {
    const pricing = createFixedResolutionPricing({
      currency: 'USD',
      standardRates: { '1K': 1 },
      discountedRates: { '1K': 0.75 },
    });

    expect(
      pricing.quote({
        resolution: '1K',
        settings: {
          displayCurrencyMode: 'usd',
          usdToCnyRate: 7.2,
          preferDiscountedPrice: true,
          grsaiCreditTierId: 'tier-10',
        },
      }),
    ).toEqual({
      amount: 0.75,
      currency: 'USD',
      originalAmount: 1,
      originalCurrency: 'USD',
    });
  });

  it('projects an authorized model quote into the selected display currency', () => {
    const pricing = createFixedResolutionPricing({
      currency: 'USD',
      standardRates: { '1K': 1 },
    });
    const display = resolveModelPriceDisplay(imageModel(pricing), {
      resolution: '1K',
      language: 'zh-CN',
      settings: {
        displayCurrencyMode: 'cny',
        usdToCnyRate: 7,
      },
    });

    expect(resolvePriceDisplayCurrency('zh-CN', 'auto')).toBe('CNY');
    expect(display?.label).toContain('7.00');
    expect(display?.nativeLabel).toContain('1.00');
  });

  it('keeps platform credit metadata in the price quote', () => {
    const pricing = createGrsaiPointsPricing(() => 1000);
    const quote = pricing.quote({
      resolution: '1K',
      settings: {
        displayCurrencyMode: 'cny',
        usdToCnyRate: 7.2,
        preferDiscountedPrice: false,
        grsaiCreditTierId: 'tier-20',
      },
    });

    expect(quote).toMatchObject({
      currency: 'CNY',
      pointsCost: 1000,
      metadata: { grsaiCreditTierId: 'tier-20' },
    });
  });
});
