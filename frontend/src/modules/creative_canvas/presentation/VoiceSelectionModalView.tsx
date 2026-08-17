// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AudioWaveform,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';

import {
  VOICE_SELECTION_PAGE_SIZE,
  type VoiceSelectionPage,
  type VoiceSelectionRow,
} from "../application/voiceSelectionModel";
import { CANVAS_NODE_INPUT_PLACEHOLDER_CLASS } from "./canvasNodeFrameStyles";
import type { VoiceSelectionModalController } from "./useVoiceSelectionModalController";

export interface VoiceSelectionModalViewProps {
  controller: VoiceSelectionModalController;
}

export function VoiceSelectionModalView({
  controller,
}: VoiceSelectionModalViewProps) {
  const { open, onClose, tab, setTab } = controller;
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[620px] max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[10px] border border-border bg-popover/96 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-[15px] font-semibold text-popover-foreground">
            音色选择
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            data-ui-tooltip="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <TabsRow tab={tab} onChange={setTab} />

        {tab === 'library' ? (
          <LibraryTab controller={controller} />
        ) : (
          <MyVoicesTab controller={controller} />
        )}
      </div>
    </div>,
    document.body,
  );
}

interface TabsRowProps {
  tab: VoiceSelectionModalController['tab'];
  onChange: VoiceSelectionModalController['setTab'];
}

function TabsRow({ tab, onChange }: TabsRowProps) {
  const tabs = [
    { id: 'library' as const, label: '音色库' },
    { id: 'mine' as const, label: '我的音色' },
  ];
  return (
    <div className="flex items-center gap-2 px-5">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
            tab === item.id
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function LibraryTab({
  controller,
}: {
  controller: VoiceSelectionModalController;
}) {
  const {
    loading,
    error,
    onPick,
    libraryQuery,
    handleLibraryQueryChange,
    libraryPage,
    libraryRows,
    setLibraryPageNumber,
    libraryJumpValue,
    updateLibraryJumpValue,
    commitLibraryJump,
  } = controller;
  return (
    <>
      <ToolbarRow>
        <SearchBox
          value={libraryQuery}
          onChange={handleLibraryQueryChange}
          placeholder="搜索音色库"
        />
      </ToolbarRow>

      <VoiceList
        loading={loading}
        error={error}
        emptyText="暂无可用音色"
        rows={libraryRows}
        onPick={onPick}
      />

      <FooterPagination
        pagination={libraryPage}
        onChange={setLibraryPageNumber}
        jumpValue={libraryJumpValue}
        onJumpValueChange={updateLibraryJumpValue}
        onJumpCommit={commitLibraryJump}
      />
    </>
  );
}

function MyVoicesTab({
  controller,
}: {
  controller: VoiceSelectionModalController;
}) {
  const {
    loading,
    error,
    onPick,
    mineQuery,
    handleMineQueryChange,
    minePage,
    mineRows,
    setMinePageNumber,
    mineJumpValue,
    updateMineJumpValue,
    commitMineJump,
    uploading,
    fileInputRef,
    handleClone,
    handleFileChange,
    fileAccept,
  } = controller;
  return (
    <>
      <ToolbarRow>
        <button
          type="button"
          onClick={handleClone}
          disabled={uploading}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-3.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {uploading ? '上传中…' : '克隆新音色'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={fileAccept}
          className="hidden"
          onChange={handleFileChange}
        />
        <SearchBox
          value={mineQuery}
          onChange={handleMineQueryChange}
          placeholder="搜索我的音色"
        />
      </ToolbarRow>

      {loading || error || minePage.total > 0 ? (
        <VoiceList
          loading={loading}
          error={error}
          emptyText=""
          rows={mineRows}
          onPick={onPick}
        />
      ) : (
        <ListBody>
          <EmptyState onClone={handleClone} />
        </ListBody>
      )}

      {minePage.total > 0 && (
        <FooterPagination
          pagination={minePage}
          onChange={setMinePageNumber}
          jumpValue={mineJumpValue}
          onJumpValueChange={updateMineJumpValue}
          onJumpCommit={commitMineJump}
        />
      )}
    </>
  );
}

function ToolbarRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 pb-3 pt-4">{children}</div>
  );
}

interface SearchBoxProps {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}

function SearchBox({ value, onChange, placeholder }: SearchBoxProps) {
  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted/90" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors hover:border-foreground/25 focus:border-primary/45 ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
      />
    </div>
  );
}

function VoiceList({
  loading,
  error,
  emptyText,
  rows,
  onPick,
}: {
  loading: boolean;
  error: string | null;
  emptyText: string;
  rows: VoiceSelectionRow[];
  onPick: VoiceSelectionModalController['onPick'];
}) {
  return (
    <ListBody>
      {loading && (
        <CenteredHint>
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </CenteredHint>
      )}
      {!loading && error && (
        <CenteredHint className="text-destructive">{error}</CenteredHint>
      )}
      {!loading && !error && rows.length === 0 && emptyText && (
        <CenteredHint>{emptyText}</CenteredHint>
      )}
      {!loading &&
        !error &&
        rows.map((row) => (
          <VoiceRow
            key={row.key}
            title={row.title}
            language={row.language}
            gender={row.gender}
            isActive={row.isActive}
            onSelect={() => onPick(row.pick)}
          />
        ))}
    </ListBody>
  );
}

function ListBody({ children }: { children: ReactNode }) {
  return (
    <div className="ui-scrollbar flex-1 overflow-y-auto px-5 pb-2">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function CenteredHint({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-2 py-12 text-[13px] text-text-muted ${
        className ?? ''
      }`}
    >
      {children}
    </div>
  );
}

interface VoiceRowProps {
  title: string;
  language: string | null;
  gender: string | null;
  isActive: boolean;
  onSelect: () => void;
}

function VoiceRow({
  title,
  language,
  gender,
  isActive,
  onSelect,
}: VoiceRowProps) {
  return (
    <div className="flex h-[52px] items-center gap-3 rounded-[10px] border border-border bg-card px-3 transition-colors hover:border-foreground/25 hover:bg-muted">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-muted">
        <AudioWaveform className="h-4 w-4 text-text-muted/90" />
      </div>
      <div className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
        {title}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-[12px] text-text-muted">
        {language && (
          <span className="rounded bg-muted px-1.5 py-0.5">{language}</span>
        )}
        {gender && (
          <span className="rounded bg-muted px-1.5 py-0.5">{gender}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onSelect}
        disabled={isActive}
        className={`ml-1 inline-flex h-7 shrink-0 items-center justify-center rounded-full px-4 text-[12px] font-medium transition-colors ${
          isActive
            ? 'cursor-default bg-muted text-muted-foreground'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {isActive ? '已选' : '选择'}
      </button>
    </div>
  );
}

function EmptyState({ onClone }: { onClone: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[13px] text-text-muted">
      <div className="flex h-16 w-20 items-center justify-center rounded-md bg-muted">
        <FolderOpen className="h-8 w-8 text-text-muted/70" strokeWidth={1.5} />
      </div>
      <span>暂无可用音色，快去克隆你的新音色吧～</span>
      <button
        type="button"
        onClick={onClone}
        className="inline-flex h-8 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-3 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20"
      >
        <Plus className="h-3 w-3" />
        克隆新音色
      </button>
    </div>
  );
}

interface FooterPaginationProps {
  pagination: VoiceSelectionPage;
  onChange: (page: number) => void;
  jumpValue: string;
  onJumpValueChange: (value: string) => void;
  onJumpCommit: () => void;
}

function FooterPagination({
  pagination,
  onChange,
  jumpValue,
  onJumpValueChange,
  onJumpCommit,
}: FooterPaginationProps) {
  const { page, totalPages, total, pages } = pagination;
  if (total === 0) return null;
  return (
    <footer className="flex items-center justify-between px-5 py-3 text-[12px] text-text-muted">
      <div className="flex items-center gap-1">
        <PaginationButton
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          {'<'}
        </PaginationButton>
        {pages.map((current, index) =>
          current === 'ellipsis' ? (
            <span key={`e-${index}`} className="px-1 text-text-muted/70">
              …
            </span>
          ) : (
            <PaginationButton
              key={current}
              active={current === page}
              onClick={() => onChange(current)}
            >
              {current}
            </PaginationButton>
          ),
        )}
        <PaginationButton
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          {'>'}
        </PaginationButton>
        <span className="ml-3 inline-flex h-7 items-center rounded-full border border-border bg-background px-2.5 text-[12px] text-foreground">
          {VOICE_SELECTION_PAGE_SIZE} 条/页
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span>跳至</span>
        <PaginationJump
          page={page}
          value={jumpValue}
          onValueChange={onJumpValueChange}
          onCommit={onJumpCommit}
        />
        <span>页</span>
        <span className="ml-3">共 {total} 条</span>
      </div>
    </footer>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded-full px-1.5 text-[12px] transition-colors ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-foreground/85 hover:bg-muted hover:text-foreground'
      } ${disabled ? 'cursor-not-allowed opacity-40 hover:bg-transparent' : ''}`}
    >
      {children}
    </button>
  );
}

function PaginationJump({
  page,
  value,
  onValueChange,
  onCommit,
}: {
  page: number;
  value: string;
  onValueChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit();
      }}
      onBlur={onCommit}
      placeholder={String(page)}
      className="h-7 w-12 rounded-full border border-border bg-background px-2 text-center text-[12px] text-foreground outline-none focus:border-primary/45"
    />
  );
}
