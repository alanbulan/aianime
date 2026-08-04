// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  imageModelDefinitions,
  selectImageModel,
} from './imageModelCatalogProjection';

describe('commercial image model definitions', () => {
  it('keeps the catalog code as the only request model and maps JSON Schema controls', () => {
    const models = imageModelDefinitions([{
      id: 'cloud-image-standard',
      apiModel: 'cloud-image-standard',
      label: 'Cloud Image Standard',
      capabilities: {
        aspectRatios: ['1:1', '16:9'],
        resolutions: ['1K', '2K'],
        defaultAspectRatio: '16:9',
        defaultResolution: '2K',
      },
      parameterSchema: {
        properties: {
          quality: {
            type: 'string',
            enum: ['low', 'high'],
            default: 'high',
          },
          prompt: { type: 'string' },
        },
      },
    }]);

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: 'cloud-image-standard',
      displayName: 'Cloud Image Standard',
      defaultAspectRatio: '16:9',
      defaultResolution: '2K',
      defaultExtraParams: { quality: 'high' },
    });
    expect(models[0]?.resolveRequest({ referenceImageCount: 1 })).toEqual({
      requestModel: 'cloud-image-standard',
      modeLabel: 'edit',
    });
    expect(models[0]?.extraParamsSchema?.map((item) => item.key)).toEqual([
      'quality',
    ]);
  });

  it('selects only a catalog entry and returns undefined for an empty catalog', () => {
    const models = imageModelDefinitions([{
      id: 'authorized-sku',
      apiModel: 'authorized-sku',
      label: 'Authorized',
    }]);

    expect(selectImageModel(models, 'removed-local-model')?.id).toBe(
      'authorized-sku',
    );
    expect(selectImageModel([], 'removed-local-model')).toBeUndefined();
  });

  it('keeps only models authorized for the requested image role', () => {
    const catalog = [
      {
        id: 'generation-only',
        apiModel: 'generation-only',
        label: 'Generation',
        imageModes: ['generation'] as const,
      },
      {
        id: 'edit-only',
        apiModel: 'edit-only',
        label: 'Edit',
        imageModes: ['edit'] as const,
      },
      {
        id: 'legacy-unspecified',
        apiModel: 'legacy-unspecified',
        label: 'Legacy',
      },
    ];

    expect(imageModelDefinitions(catalog, 'generation').map((item) => item.id))
      .toEqual(['generation-only', 'legacy-unspecified']);
    expect(imageModelDefinitions(catalog, 'edit').map((item) => item.id))
      .toEqual(['edit-only', 'legacy-unspecified']);
  });
});
