// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SkillNodeController } from './useSkillNodeController';
import { SkillNodeView } from './SkillNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key),
  }),
}));

vi.mock('./NodeHeader', () => ({
  NODE_HEADER_FLOATING_POSITION_CLASS: 'floating',
  NodeHeader: ({ titleText }: { titleText: string }) => (
    <div>title:{titleText}</div>
  ),
}));

vi.mock('./BackgroundCropperDialog', () => ({
  BackgroundCropperDialog: ({
    sourceLabel,
    onClose,
    onConfirmBlob,
    onCandidateSuccess,
    onError,
  }: {
    sourceLabel: string;
    onClose(): void;
    onConfirmBlob(blob: Blob, filename: string): void;
    onCandidateSuccess(): void;
    onError(message: string): void;
  }) => (
    <div>
      <span>crop:{sourceLabel}</span>
      <button type="button" onClick={onClose}>close-crop</button>
      <button
        type="button"
        onClick={() => onConfirmBlob(new Blob(), 'crop.png')}
      >
        confirm-crop
      </button>
      <button type="button" onClick={onCandidateSuccess}>crop-success</button>
      <button type="button" onClick={() => onError('crop-error')}>
        crop-error
      </button>
    </div>
  ),
}));

vi.mock('./ProviderModelPicker', () => ({
  ProviderModelPicker: () => <div>model-picker</div>,
}));

vi.mock('@/features/viewer-kit/public', () => ({
  ThreeDDirectorDialog: ({
    autoCommitDirectorCombined,
    onOpenChange,
    onSubmitDirectorCombined,
  }: {
    autoCommitDirectorCombined: boolean;
    onOpenChange(open: boolean): void;
    onSubmitDirectorCombined?: (blob: Blob, meta: unknown) => void;
  }) => (
    <div>
      <span>director:{String(autoCommitDirectorCombined)}</span>
      <button type="button" onClick={() => onOpenChange(false)}>
        close-director
      </button>
      {onSubmitDirectorCombined ? (
        <button
          type="button"
          onClick={() => onSubmitDirectorCombined(new Blob(), {})}
        >
          capture-director
        </button>
      ) : null}
    </div>
  ),
}));

function createController(): SkillNodeController {
  return {
    id: 'skill-a',
    data: {
      skill_id: 'freezone.set_director_combined',
      displayName: '技能节点',
      parameters: { enabled: false },
      generationError: null,
    },
    resolvedWidth: 420,
    skill: {
      id: 'freezone.set_director_combined',
      provider: 'tool',
      display_name: '导演合成',
      description: '合成当前镜头',
      inputs: [
        {
          role: 'beat_context',
          label: '镜头上下文',
          accepts: {},
          required: true,
          cardinality: 'single',
        },
      ],
      outputs: [
        {
          role: 'director_combined',
          label: '导演合成图',
          media_type: 'image',
          node_type: 'imageGenNode',
          pushable: true,
        },
      ],
      parameters: {
        enabled: { type: 'boolean', label: '启用', default: false },
      },
    },
    parameterEntries: [
      {
        key: 'enabled',
        label: '启用',
        type: 'boolean',
        options: [],
        value: false,
      },
    ],
    skillParameters: { enabled: false },
    incomingEdges: [
      {
        id: 'edge-context',
        source: 'context-a',
        target: 'skill-a',
        targetHandle: 'beat_context',
      },
    ],
    nodeById: new Map([
      [
        'context-a',
        {
          id: 'context-a',
          type: 'beatContextNode',
          position: { x: 0, y: 0 },
          data: { displayName: '镜头 1' },
        },
      ],
    ]),
    beatContextReferences: {
      identities: [],
      props: [],
      noCharacter: false,
      noProp: false,
    },
    inputHandleIds: ['beat_context'],
    referenceInputHandlesByRole: { identity: [], prop: [] },
    outputHandleIds: ['director_combined'],
    beatTarget: { episode: 1, beat: 2 },
    ready: true,
    isBusy: false,
    submitLabel: '提交',
    isLoading: false,
    loadError: null,
    localizedSkillName: '导演合成',
    localizedSkillDescription: '合成当前镜头',
    mainlineManaged: true,
    isSetSelectedBackgroundSkill: false,
    isSetDirectorCombinedSkill: true,
    directorEnvOnlyPreviewUrl: null,
    sourcePickerBusy: false,
    sourcePickerError: null,
    cropSource: null,
    directorStageOpen: true,
    directorStageManifest: null,
    directorWorldDestination: 'director_combined',
    selectNode: vi.fn(),
    changeParameter: vi.fn(),
    pickFlatSource: vi.fn(),
    openContextDirectorWorld: vi.fn(),
    submit: vi.fn(),
    closeCropSource: vi.fn(),
    uploadAndStageSelectedBackground: vi.fn(),
    clearSourcePickerError: vi.fn(),
    setSourcePickerError: vi.fn(),
    changeDirectorWorldOpen: vi.fn(),
    captureDirectorWorld: vi.fn(),
  } as unknown as SkillNodeController;
}

describe('SkillNodeView', () => {
  it('renders the skill contract and forwards parameter, submit, and director commands', () => {
    const controller = createController();
    render(<SkillNodeView controller={controller} />);

    fireEvent.click(screen.getByText('title:导演合成'));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: /viewer\.threeD\.directorWorld/,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'close-director' }));
    fireEvent.click(screen.getByRole('button', { name: 'capture-director' }));

    expect(controller.selectNode).toHaveBeenCalled();
    expect(controller.changeParameter).toHaveBeenCalledWith('enabled', true);
    expect(controller.submit).toHaveBeenCalled();
    expect(controller.openContextDirectorWorld).toHaveBeenCalledWith(
      'director_combined',
    );
    expect(controller.changeDirectorWorldOpen).toHaveBeenCalledWith(false);
    expect(controller.captureDirectorWorld).toHaveBeenCalled();
    expect(screen.getAllByText('handle:beat_context')).toHaveLength(2);
    expect(screen.getByText('handle:director_combined')).toBeInTheDocument();
    expect(screen.getByText('director:true')).toBeInTheDocument();
  });

  it('renders selected-background crop controls and forwards crop lifecycle events', () => {
    const controller = createController();
    controller.data.skill_id = 'freezone.set_selected_background';
    controller.isSetSelectedBackgroundSkill = true;
    controller.isSetDirectorCombinedSkill = false;
    controller.cropSource = {
      url: '/environment.png',
      label: 'director_background',
    };
    controller.directorEnvOnlyPreviewUrl = '/environment.png';
    render(<SkillNodeView controller={controller} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /viewer\.threeD\.cropDirectorBackground/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /viewer\.threeD\.cropMaster/ }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /viewer\.threeD\.cropReverse/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'close-crop' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-crop' }));
    fireEvent.click(screen.getByRole('button', { name: 'crop-success' }));
    fireEvent.click(screen.getByRole('button', { name: 'crop-error' }));

    expect(controller.pickFlatSource).toHaveBeenNthCalledWith(
      1,
      'director_background',
    );
    expect(controller.pickFlatSource).toHaveBeenNthCalledWith(2, 'master');
    expect(controller.pickFlatSource).toHaveBeenNthCalledWith(3, 'reverse');
    expect(controller.closeCropSource).toHaveBeenCalled();
    expect(controller.uploadAndStageSelectedBackground).toHaveBeenCalledWith(
      expect.any(Blob),
      'crop.png',
      'viewer.threeD.selectedBackgroundOutputLabel',
    );
    expect(controller.clearSourcePickerError).toHaveBeenCalled();
    expect(controller.setSourcePickerError).toHaveBeenCalledWith('crop-error');
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      '/environment.png',
    );
  });
});
