// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Bell,
  Bolt,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Languages,
  LogOut,
  Mail,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarUploadDialog } from "@/components/avatar-upload-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreditBalanceBadge } from "@/components/layout/credit-balance-badge";
import { NotificationDrawer } from "@/components/notification-drawer";
import { BRAND_NAME, BrandMark } from "@/components/brand";
import { SettingsDialog } from "@/components/settings-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  logoutAllSessions,
  useAuthStore,
  useCommercialAuthStore,
} from "@/modules/identity_access/public";
import { useAppStore } from "@/modules/project_workspace/public";
import { authRequired, isCeRuntime } from "@/lib/runtime-config";
import { resetUserSessionState } from "@/lib/reset-region-state";
import { useModelGatewayConfig } from "@/modules/model_usage/public";
import {
  useCommercialAnnouncements,
  useCommercialRelease,
} from "@/modules/platform_release/public";
import {
  ProjectHeaderNavigation,
  ProjectSwitcher,
  ProjectWorkspaceMenu,
} from "@/components/layout/project-header-navigation";
const ACCOUNT_PANEL_TRANSITION_MS = 350;

export function Header() {
  const { t, i18n } = useTranslation();
  const params = useParams({ strict: false }) as { project?: string };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [accountPanelVisible, setAccountPanelVisible] = useState(false);
  const [settingsWarningBubbleDismissed, setSettingsWarningBubbleDismissed] = useState(false);
  const [desktopActionsHost, setDesktopActionsHost] = useState<HTMLElement | null>(null);
  const [accountPanelPosition, setAccountPanelPosition] = useState<{ top: number; right: number }>({
    top: 56,
    right: 16,
  });
  const accountCloseTimerRef = useRef<number | null>(null);
  const accountUnmountTimerRef = useRef<number | null>(null);
  const accountOpenFrameRef = useRef<number | null>(null);
  const accountAnchorRef = useRef<HTMLDivElement | null>(null);
  const settingsAnchorRef = useRef<HTMLDivElement | null>(null);
  const { username } = useAuthStore();
  const commercialSession = useCommercialAuthStore((state) => state.session);
  const queryClient = useQueryClient();
  // 退出登录是 SPA 内部跳转（不刷新页面），必须一并清掉 React Query 缓存和
  // 用户级 zustand/localStorage 状态，否则换账号登录后 projectSummaries 等
  // 查询还在 staleTime 内，新账号会直接看到上一个账号的项目列表。
  const handleLogout = async () => {
    await logoutAllSessions();
    resetUserSessionState({ queryClient });
  };
  const localAvatarUrl = useAuthStore((s) => s.avatarUrl);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const showLogout = authRequired();
  const ceRuntime = isCeRuntime();
  const commercialUser = ceRuntime ? commercialSession?.user : null;
  const displayName =
    commercialUser?.nickname || commercialUser?.username || username || "User";
  const accountUsername = commercialUser?.username || username || null;
  const accountEmail = commercialUser?.email || null;
  const accountTenant = ceRuntime ? commercialSession?.tenant.name ?? null : null;
  const avatarUrl = commercialUser?.avatar || localAvatarUrl;
  const avatarInitial = displayName.slice(0, 1).toUpperCase();
  const activeLanguage = (i18n.resolvedLanguage ?? i18n.language).startsWith("zh")
    ? "zh"
    : "en";
  const modelGatewayConfig = useModelGatewayConfig(ceRuntime);
  const commercialEnabled = Boolean(window.aiAnimeDesktop?.commercial);
  const commercialAnnouncements = useCommercialAnnouncements(commercialEnabled);
  const commercialRelease = useCommercialRelease(commercialEnabled);
  const hasUnreadNotification =
    (commercialAnnouncements.data?.items.length ?? 0) > 0 ||
    Boolean(commercialRelease.data?.available);
  const gatewayConfig = modelGatewayConfig.data?.data;
  const hasSettingsWarning = Boolean(
    ceRuntime &&
      gatewayConfig &&
      gatewayConfig.effective.configured === false,
  );
  const settingsWarningBubble = useFloatingBubblePosition(
    settingsAnchorRef,
    hasSettingsWarning && !settingsOpen && !settingsWarningBubbleDismissed,
  );
  const project = params.project ?? null;
  const isDesktop = Boolean(window.aiAnimeDesktop);

  useEffect(() => {
    return () => {
      clearAccountCloseTimer();
      clearAccountUnmountTimer();
      clearAccountOpenFrame();
    };
  }, []);

  useEffect(() => {
    setDesktopActionsHost(
      isDesktop ? document.getElementById("desktop-title-bar-actions") : null,
    );
  }, [isDesktop]);


  useEffect(() => {
    if (!hasSettingsWarning) {
      setSettingsWarningBubbleDismissed(false);
    }
  }, [hasSettingsWarning]);

  const clearAccountCloseTimer = () => {
    if (accountCloseTimerRef.current === null) return;
    window.clearTimeout(accountCloseTimerRef.current);
    accountCloseTimerRef.current = null;
  };

  const clearAccountUnmountTimer = () => {
    if (accountUnmountTimerRef.current === null) return;
    window.clearTimeout(accountUnmountTimerRef.current);
    accountUnmountTimerRef.current = null;
  };

  const clearAccountOpenFrame = () => {
    if (accountOpenFrameRef.current === null) return;
    window.cancelAnimationFrame(accountOpenFrameRef.current);
    accountOpenFrameRef.current = null;
  };

  const closeAccountPanelNow = () => {
    clearAccountCloseTimer();
    clearAccountOpenFrame();
    clearAccountUnmountTimer();
    setAccountPanelVisible(false);
    setAccountPanelOpen(false);
  };

  const openAccountPanel = () => {
    clearAccountCloseTimer();
    clearAccountUnmountTimer();
    clearAccountOpenFrame();
    const rect = accountAnchorRef.current?.getBoundingClientRect();
    if (rect) {
      setAccountPanelPosition({
        top: Math.round(rect.bottom + 8),
        right: Math.round(window.innerWidth - rect.right),
      });
    }
    setAccountPanelOpen(true);
    accountOpenFrameRef.current = window.requestAnimationFrame(() => {
      setAccountPanelVisible(true);
      accountOpenFrameRef.current = null;
    });
  };

  const scheduleCloseAccountPanel = () => {
    clearAccountCloseTimer();
    accountCloseTimerRef.current = window.setTimeout(() => {
      setAccountPanelVisible(false);
      clearAccountUnmountTimer();
      accountUnmountTimerRef.current = window.setTimeout(() => {
        setAccountPanelOpen(false);
        accountUnmountTimerRef.current = null;
      }, ACCOUNT_PANEL_TRANSITION_MS);
      accountCloseTimerRef.current = null;
    }, 120);
  };

  const switchLanguage = (lang: "zh" | "en") => {
    void i18n.changeLanguage(lang);
    setLanguage(lang);
  };

  const openNotifications = () => {
    closeAccountPanelNow();
    setNotificationOpen(true);
  };

  const openAvatarDialog = () => {
    closeAccountPanelNow();
    setAvatarDialogOpen(true);
  };

  const actions = (
    <div
      className={`flex items-center justify-end gap-1 ${
        isDesktop ? "h-full shrink-0" : "min-w-0 flex-1 shrink-0"
      }`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="relative size-[32px] text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
        aria-label={t("header.notifications")}
        aria-expanded={notificationOpen}
        onClick={openNotifications}
      >
        <Bell className="size-[17px]" />
        {hasUnreadNotification ? (
          <span
            className="absolute right-[7px] top-[7px] size-1.5 rounded-full bg-destructive"
            aria-hidden="true"
          />
        ) : null}
      </Button>
      {ceRuntime ? (
        <div ref={settingsAnchorRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative size-[32px] text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
            aria-label={
              hasSettingsWarning ? t("header.settingsWithWarning") : t("header.settings")
            }
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <Bolt className="size-[17px]" />
            {hasSettingsWarning ? (
              <span
                className="absolute right-[5px] top-[5px] flex size-[11px] items-center justify-center rounded-full bg-warning text-warning-foreground shadow-sm"
                aria-hidden="true"
              >
                <AlertTriangle className="size-[8px]" strokeWidth={3} />
              </span>
            ) : null}
          </Button>
        </div>
      ) : null}
      <CreditBalanceBadge />
      <div
        id="superchat-header-controls"
        className="flex min-w-0 shrink items-center gap-2 empty:hidden"
      />
      <div
        ref={accountAnchorRef}
        className="relative ml-1 flex items-center"
        onMouseEnter={openAccountPanel}
        onMouseLeave={scheduleCloseAccountPanel}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-[28px] rounded-full p-0 hover:bg-transparent"
          aria-label={t("header.account.open")}
          aria-expanded={accountPanelOpen}
          onClick={openAccountPanel}
        >
          <span className="flex size-[26px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[11px] font-medium text-muted-foreground">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              avatarInitial
            )}
          </span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="relative z-20 shrink-0 border-b border-border bg-background text-foreground">
      {!isDesktop || project ? (
        <header className="relative flex h-[48px] items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center">
          {isDesktop ? null : (
            <TooltipProvider delay={80}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      to="/"
                      aria-label={t("app.logoHomeTooltip")}
                      className="flex min-w-0 shrink-0 items-center"
                    />
                  }
                >
                  <span className="flex items-center gap-2">
                    <BrandMark className="h-6 w-10" />
                    <span className="truncate whitespace-nowrap text-sm font-semibold text-foreground">
                      {BRAND_NAME}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  sideOffset={10}
                  showArrow={false}
                  className="border border-border bg-background/95 text-foreground shadow-none"
                >
                  {t("app.logoHomeTooltip")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <div className={`${isDesktop ? "" : "ml-[22px]"} flex min-w-0 items-center gap-6`}>
            {project ? <ProjectSwitcher current={project} /> : null}
          </div>
        </div>

        {project ? <ProjectHeaderNavigation project={project} /> : null}

        {isDesktop ? <div className="min-w-0 flex-1" /> : actions}
        </header>
      ) : null}
      {isDesktop && desktopActionsHost ? createPortal(actions, desktopActionsHost) : null}
      {project ? <ProjectWorkspaceMenu project={project} /> : null}
      {accountPanelOpen
        ? createPortal(
            <AccountPanel
              activeLanguage={activeLanguage}
              avatarInitial={avatarInitial}
              avatarUrl={avatarUrl}
              accountEmail={accountEmail}
              accountTenant={accountTenant}
              accountUsername={accountUsername}
              displayName={displayName}
              onChangeAvatar={openAvatarDialog}
              onLanguageChange={switchLanguage}
              onClose={scheduleCloseAccountPanel}
              onEnter={openAccountPanel}
              onLogout={showLogout ? () => void handleLogout() : undefined}
              position={accountPanelPosition}
              visible={accountPanelVisible}
              t={t}
            />,
            document.body,
          )
        : null}
      <AvatarUploadDialog
        avatarInitial={avatarInitial}
        displayName={displayName}
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
      />
      <NotificationDrawer
        open={notificationOpen}
        onOpenChange={setNotificationOpen}
      />
      {ceRuntime ? <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} /> : null}
      {settingsWarningBubble
        ? createPortal(
            <div
              className="fixed z-[9999] w-[112px] rounded-md border border-warning/50 bg-warning py-1 pl-2 pr-6 text-[11px] font-medium leading-none text-warning-foreground shadow-lg"
              style={{ left: settingsWarningBubble.left, top: settingsWarningBubble.top }}
              role="status"
            >
              <span
                className="absolute -top-[4px] size-2 rotate-45 border-l border-t border-warning/50 bg-warning"
                style={{ left: settingsWarningBubble.arrowLeft }}
                aria-hidden="true"
              />
              <span className="block truncate">{t("header.settingsWarningBubble")}</span>
              <button
                type="button"
                className="absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-warning-foreground/70 transition-colors hover:bg-warning-foreground/10 hover:text-warning-foreground"
                aria-label={t("header.dismissSettingsWarningBubble")}
                onClick={() => setSettingsWarningBubbleDismissed(true)}
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function useFloatingBubblePosition(
  anchorRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): { left: number; top: number; arrowLeft: number } | null {
  const [position, setPosition] = useState<{ left: number; top: number; arrowLeft: number } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) {
      setPosition(null);
      return;
    }

    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) {
        setPosition(null);
        return;
      }
      const bubbleWidth = 112;
      const viewportPadding = 8;
      const idealLeft = rect.left + rect.width / 2 - bubbleWidth / 2;
      const left = Math.min(
        Math.max(viewportPadding, idealLeft),
        window.innerWidth - bubbleWidth - viewportPadding,
      );
      setPosition({
        left,
        top: rect.bottom + 7,
        arrowLeft: rect.left + rect.width / 2 - left - 4,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, enabled]);

  return position;
}

function AccountPanel({
  accountEmail,
  accountTenant,
  accountUsername,
  activeLanguage,
  avatarInitial,
  avatarUrl,
  displayName,
  onChangeAvatar,
  onLanguageChange,
  onClose,
  onEnter,
  onLogout,
  position,
  visible,
  t,
}: {
  accountEmail: string | null;
  accountTenant: string | null;
  accountUsername: string | null;
  activeLanguage: "zh" | "en";
  avatarInitial: string;
  avatarUrl: string | null;
  displayName: string;
  onChangeAvatar: () => void;
  onLanguageChange: (lang: "zh" | "en") => void;
  onClose: () => void;
  onEnter: () => void;
  onLogout?: () => void;
  position: { top: number; right: number };
  visible: boolean;
  t: (key: string) => string;
}) {
  const [languageOpen, setLanguageOpen] = useState(false);
  const activeLanguageLabel = activeLanguage === "zh"
    ? t("header.account.languageChinese")
    : t("header.account.languageEnglish");

  return (
    <div
      className={`fixed z-[80] w-[260px] transition-opacity duration-[350ms] ease-[var(--ease-out-quint)] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ top: position.top, right: position.right }}
      onMouseEnter={onEnter}
      onMouseLeave={onClose}
    >
      <div className="rounded-[12px] border border-border bg-popover p-2.5 text-popover-foreground shadow-xl">
        <div className="mb-2 flex min-h-[58px] items-center gap-2.5 rounded-[10px] bg-muted px-2.5 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card text-xs font-normal text-foreground/75">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              avatarInitial
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-foreground">
              {displayName}
            </span>
            {accountUsername && accountUsername !== displayName ? (
              <span className="block truncate text-[11px] text-muted-foreground">
                @{accountUsername}
              </span>
            ) : null}
          </span>
        </div>
        {accountEmail || accountTenant ? (
          <div className="mb-2 space-y-1 border-b border-border px-2 pb-2 text-[11px] text-muted-foreground">
            {accountEmail ? (
              <div className="flex min-w-0 items-center gap-2">
                <Mail className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate" title={accountEmail}>{accountEmail}</span>
              </div>
            ) : null}
            {accountTenant ? (
              <div className="flex min-w-0 items-center gap-2">
                <Building2 className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate" title={accountTenant}>{accountTenant}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-0.5">
          {!isCeRuntime() ? (
            <AccountMenuRow
              icon={<Camera className="size-3.5" />}
              label={t("header.account.changeAvatar")}
              onClick={onChangeAvatar}
            />
          ) : null}
          <AccountMenuRow
            active={languageOpen}
            icon={<Languages className="size-3.5" />}
            label={t("header.account.selectLanguage")}
            meta={activeLanguageLabel}
            onClick={() => setLanguageOpen((open) => !open)}
          />
          {languageOpen ? (
            <div className="ml-[30px] mr-1 space-y-0.5 pb-1">
              <PreferenceOption
                active={activeLanguage === "zh"}
                label={t("header.account.languageChinese")}
                onClick={() => onLanguageChange("zh")}
              />
              <PreferenceOption
                active={activeLanguage === "en"}
                label={t("header.account.languageEnglish")}
                onClick={() => onLanguageChange("en")}
              />
            </div>
          ) : null}
          {onLogout ? (
            <AccountMenuRow
              icon={<LogOut className="size-3.5" />}
              label={t("auth.logout")}
              onClick={onLogout}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AccountMenuRow({
  active = false,
  icon,
  label,
  meta,
  onClick,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  meta?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-9 w-full items-center gap-2 rounded-[8px] px-1.5 text-left text-[13px] font-normal text-popover-foreground transition-colors duration-150 hover:bg-muted"
      onClick={onClick}
    >
      <span className="ml-1 flex size-3.5 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? (
        <span className="max-w-16 truncate text-[11px] text-muted-foreground">{meta}</span>
      ) : null}
      <ChevronRight
        className={`mr-1 size-3.5 shrink-0 text-foreground/85 transition-transform duration-150 ${
          active ? "rotate-90" : ""
        }`}
      />
    </button>
  );
}

function PreferenceOption({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-7 w-full items-center justify-between rounded-[7px] px-2 text-left text-[11px] text-popover-foreground/78 transition-colors duration-150 hover:bg-muted hover:text-popover-foreground"
      onClick={onClick}
    >
      <span>{label}</span>
      {active ? <Check className="size-3.5 text-primary" /> : null}
    </button>
  );
}
