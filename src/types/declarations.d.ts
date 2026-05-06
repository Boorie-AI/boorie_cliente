// IMPORTANT: This file MUST NOT contain top-level `import`/`export` statements.
// Any top-level import/export turns a `.d.ts` file into a *module*, which
// scopes the ambient `declare module '*.png'` etc. declarations and prevents
// them from matching real imports. Keep all augmentations as ambient (script)
// declarations using `declare global { ... }` blocks where needed via `interface`
// merging on the global scope.

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

declare module '*.webp' {
  const content: string;
  export default content;
}

interface Window {
  electronAPI: {
    minimizeWindow: () => Promise<void>;
    maximizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;
    isWindowMaximized: () => Promise<boolean>;
    sendMessage: (channel: string, data: any) => Promise<any>;
    onMessage: (channel: string, callback: (data: any) => void) => void;
    removeAllListeners: (channel: string) => void;
    chat: {
      sendMessage: (data: any) => Promise<any>;
      streamMessage: (data: any) => Promise<any>;
    };
    agenticRAG: {
      search: (data: any) => Promise<any>;
      query: (prompt: string, options?: any) => Promise<any>;
    };
    [key: string]: any;
  };
  // One-shot guard used by `WNTRSimulationViewer` to make sure the
  // "projected coordinates detected" warning fires only once per session.
  projectedCoordsWarningShown?: boolean;
}

interface ImportMeta {
  env: {
    VITE_CLARITY_PROJECT_ID?: string;
    VITE_CLARITY_ENABLED?: string;
    [key: string]: string | undefined;
  };
}