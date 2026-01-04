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

declare global {
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
  }

  interface ImportMeta {
    env: {
      VITE_CLARITY_PROJECT_ID?: string;
      VITE_CLARITY_ENABLED?: string;
      [key: string]: string | undefined;
    };
  }
}

export {};