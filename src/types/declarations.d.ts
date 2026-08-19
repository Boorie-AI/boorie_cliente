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

// CHANGELOG.md se importa como texto y se resuelve en tiempo de compilación, para
// que su contenido viaje dentro del bundle en vez de leerse del disco en runtime.
// Ver docs/ACERCA_DE_HISTORIAL_VERSIONES.md.
declare module '*.md?raw' {
  const content: string;
  export default content;
}

/** Fecha de compilación (ISO), inyectada por `define` en vite.config.ts. */
declare const __BUILD_DATE__: string;

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
      pickAttachment: () => Promise<{ success: boolean; fileName?: string; content?: string; message?: string }>;
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