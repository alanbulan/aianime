// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import '@/index.css';
import { TaskProgress } from '@/components/task-progress';
import { TaskRow } from '@/components/task-center/task-row';
import { StageProgressPanel } from '@/components/stage-progress-panel';
import { NodeGenerationOverlay } from '@/modules/creative_canvas/presentation/NodeGenerationOverlay';
import { useTaskCenterStore } from '@/modules/task_execution/public';
import { sampleTask } from '@/__mocks__/msw/handlers/tasks';

const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  lng: 'zh', initAsync: false,
  resources: { zh: { translation: {
    taskProgress: { estimated: '预计 {{percent}}%', elapsed: '已用 {{time}}', reconnecting: '连接中断，正在重连…', processing: '仍在处理，请稍候' },
    common: { stop: '停止', preparing: '准备中' },
    canvas: { generationProgress: '视频生成进度' },
  } } },
});

beforeEach(() => { useTaskCenterStore.getState().reset(); useTaskCenterStore.getState().setHealth('connected'); });
afterEach(() => { vi.restoreAllMocks(); useTaskCenterStore.getState().reset(); });

it('keeps task progress legible in narrow cards and stops on authoritative completion', async () => {
  await page.viewport(740, 660);
  let now = Date.parse('2026-09-03T12:05:00Z');
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const task = sampleTask({ task_id: 'progress-demo', task_key: 'progress-demo', created_at: '2026-09-03T12:00:00Z', updated_at: '2026-09-03T12:05:00Z', progress: 0.4, display_name: '分镜视频生成', current_task: '正在生成分镜视频' });
  useTaskCenterStore.getState().hydrate([task]);
  const stop = vi.fn();
  await render(
    <I18nextProvider i18n={i18n}>
      <main className="flex min-h-screen gap-6 bg-background p-6 text-foreground">
        <div className="w-80 space-y-6">
          <h1>任务进度</h1>
          <TaskProgress task={task} aria-label="任务详情" />
          <TaskProgress local task={{ status: 'completed', progress: 1 }} aria-label="已完成" />
          <div data-testid="task-row" className="h-[52px] w-80"><TaskRow task={task} selected={false} onClick={vi.fn()} /></div>
          <StageProgressPanel title="视频合成" currentTask="正在生成分镜视频" progress={task.progress} task={task} logs={[]} onStop={stop} />
        </div>
        <div data-testid="node" className="relative h-72 w-36 rounded-xl bg-muted">
          <NodeGenerationOverlay generation={{ generationTaskKey: task.task_key, generationStartedAt: Date.parse(task.created_at) }} progress={task.progress} />
        </div>
      </main>
    </I18nextProvider>,
  );
  const node = document.querySelector('[data-testid="node"]') as HTMLElement;
  const bar = node.querySelector('[role="progressbar"]')!;
  const value = () => Number(bar.getAttribute('aria-valuenow'));
  expect(value()).toBe(75);
  const indicator = node.querySelector('[data-slot="progress-indicator"]')!;
  expect(getComputedStyle(indicator, '::after').animationName).toBe('task-progress-shimmer');
  expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth);
  const row = document.querySelector('[data-testid="task-row"]') as HTMLElement;
  expect(row.scrollHeight).toBeLessThanOrEqual(row.clientHeight);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  expect(stop).toHaveBeenCalledOnce();

  useTaskCenterStore.getState().setHealth('reconnecting');
  await expect.poll(() => node.textContent).toContain('正在重连');
  const frozen = value();
  now += 60_000;
  await expect.poll(() => node.textContent).toContain('已用 6:00');
  expect(value()).toBe(frozen);
  expect(node.textContent).toContain('正在重连');
  expect(row.scrollHeight).toBeLessThanOrEqual(row.clientHeight);
  useTaskCenterStore.getState().upsert({ ...task, status: 'completed', progress: 1, updated_at: new Date(now).toISOString(), completed_at: new Date(now).toISOString() });
  await expect.poll(value).toBe(100);
  expect(bar.hasAttribute('data-active')).toBe(false);
});
