import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PromptMentionEditor } from './PromptMentionEditor';
import { isNativeTextEditingDrag } from './canvasInteractionTargets';

function EditorFixture({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <PromptMentionEditor value={value} candidates={[]} onChange={(next) => {
    setValue(next);
    onChange(next);
  }} />;
}

it('pastes multiline Chinese as plain text, commits state and keeps native undo/redo', async () => {
  const onChange = vi.fn();
  await render(<EditorFixture onChange={onChange} />);
  const editor = document.querySelector<HTMLElement>('.prompt-mention-editor')!;
  editor.focus();
  const data = new DataTransfer();
  const text = '中文提示词\n第二行文字';
  data.setData('text/plain', text);
  data.setData('text/html', '<span style="color:black">不应插入的富文本</span>');
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  await expect.poll(() => onChange.mock.lastCall?.[0]).toBe(text);
  expect(editor.querySelector('[style]')).toBeNull();
  expect(editor.textContent).not.toContain('不应插入');
  document.execCommand('undo');
  await expect.poll(() => onChange.mock.lastCall?.[0]).toBe('');
  document.execCommand('redo');
  await expect.poll(() => onChange.mock.lastCall?.[0]).toBe(text);
});

it('recognizes nested contenteditable text as native text-drop targets in Chromium', async () => {
  await render(<EditorFixture onChange={vi.fn()} />);
  const editor = document.querySelector<HTMLElement>('.prompt-mention-editor')!;
  const child = document.createElement('span');
  child.textContent = '已有提示词';
  editor.append(child);
  const transfer = new DataTransfer();
  transfer.setData('text/plain', '拖入中文');
  expect(child.isContentEditable).toBe(true);
  expect(isNativeTextEditingDrag({ target: child, dataTransfer: transfer })).toBe(true);
  transfer.items.add(new File(['video'], 'clip.mp4', { type: 'video/mp4' }));
  expect(isNativeTextEditingDrag({ target: child, dataTransfer: transfer })).toBe(false);
});
