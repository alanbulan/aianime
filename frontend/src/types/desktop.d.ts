interface AIAnimeWindowControls {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (listener: (maximized: boolean) => void) => () => void;
}

interface AIAnimeDesktopBridge {
  platform: string;
  versions: Readonly<{
    electron: string;
    chrome: string;
    node: string;
  }>;
  windowControls: Readonly<AIAnimeWindowControls>;
}

interface Window {
  aiAnimeDesktop?: AIAnimeDesktopBridge;
}
