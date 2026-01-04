/**
 * Microsoft Clarity Integration Service
 * Handles the initialization and management of Microsoft Clarity analytics
 */

interface ClarityConfig {
  projectId: string;
  enabled: boolean;
}

declare global {
  interface Window {
    clarity?: {
      (action: string, ...args: any[]): void;
      q?: any[];
    };
  }
}

class ClarityService {
  private config: ClarityConfig;
  private isInitialized = false;
  private isElectron = false;

  constructor() {
    this.config = {
      projectId: import.meta.env.VITE_CLARITY_PROJECT_ID || '',
      enabled: import.meta.env.VITE_CLARITY_ENABLED === 'true'
    };

    // Detect if running in Electron
    this.isElectron = typeof window !== 'undefined' &&
      typeof (window as any).electronAPI !== 'undefined';
  }

  /**
   * Initialize Microsoft Clarity
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled || !this.config.projectId) {
      console.log('Microsoft Clarity disabled or no project ID provided');
      return;
    }

    if (this.isInitialized) {
      console.log('Microsoft Clarity already initialized');
      return;
    }

    try {
      // Special handling for Electron environment
      if (this.isElectron) {
        console.log('Initializing Microsoft Clarity in Electron environment');
        await this.initializeInElectron();
      } else {
        console.log('Initializing Microsoft Clarity in web environment');
        await this.initializeInWeb();
      }

      this.isInitialized = true;
      console.log('Microsoft Clarity initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Microsoft Clarity:', error);
    }
  }

  /**
   * Initialize Clarity in web environment
   */
  private async initializeInWeb(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create clarity function
        (function (c: any, l: any, a: any, r: any, i: any, t: any, y: any) {
          c[a] = c[a] || function () {
            (c[a].q = c[a].q || []).push(arguments);
          };
          t = l.createElement(r);
          t.async = 1;
          t.src = "https://www.clarity.ms/tag/" + i;
          y = l.getElementsByTagName(r)[0];
          y.parentNode?.insertBefore(t, y);
        })(window, document, "clarity", "script", this.config.projectId, undefined, undefined);

        // Initialize clarity
        if (window.clarity) {
          window.clarity("init", this.config.projectId);
          resolve();
        } else {
          reject(new Error('Clarity function not available'));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initialize Clarity in Electron environment with security considerations
   */
  private async initializeInElectron(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // In Electron, we need to be more careful about script injection
        // Create the script element manually
        const script = document.createElement('script');
        script.src = `https://www.clarity.ms/tag/${this.config.projectId}`;
        script.async = true;
        script.defer = true;

        script.onload = () => {
          // Initialize clarity after script loads
          if (window.clarity) {
            window.clarity("init", this.config.projectId);
            resolve();
          } else {
            // Fallback: create clarity function manually
            window.clarity = function () {
              (window.clarity!.q = window.clarity!.q || []).push(arguments);
            };
            window.clarity("init", this.config.projectId);
            resolve();
          }
        };

        script.onerror = (error) => {
          reject(new Error(`Failed to load Clarity script: ${error}`));
        };

        // Append to head
        document.head.appendChild(script);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Track a custom event
   */
  trackEvent(eventName: string, properties?: Record<string, any>): void {
    if (!this.isInitialized || !window.clarity) {
      console.warn('Clarity not initialized, cannot track event:', eventName);
      return;
    }

    try {
      window.clarity("event", eventName, properties);
      console.log('Clarity event tracked:', eventName, properties);
    } catch (error) {
      console.error('Failed to track Clarity event:', error);
    }
  }

  /**
   * Set user ID for session tracking
   */
  setUserId(userId: string): void {
    if (!this.isInitialized || !window.clarity) {
      console.warn('Clarity not initialized, cannot set user ID');
      return;
    }

    try {
      window.clarity("identify", userId);
      console.log('Clarity user ID set:', userId);
    } catch (error) {
      console.error('Failed to set Clarity user ID:', error);
    }
  }

  /**
   * Set custom session tag
   */
  setSessionTag(key: string, value: string): void {
    if (!this.isInitialized || !window.clarity) {
      console.warn('Clarity not initialized, cannot set session tag');
      return;
    }

    try {
      window.clarity("set", key, value);
      console.log('Clarity session tag set:', key, value);
    } catch (error) {
      console.error('Failed to set Clarity session tag:', error);
    }
  }

  /**
   * Get current session URL for debugging
   */
  getSessionUrl(): string | null {
    if (!this.isInitialized || !window.clarity) {
      return null;
    }

    try {
      // This is a placeholder - Clarity doesn't directly expose session URL via API
      // But you can access it through the Clarity dashboard
      return `https://clarity.microsoft.com/dashboard/project/${this.config.projectId}`;
    } catch (error) {
      console.error('Failed to get Clarity session URL:', error);
      return null;
    }
  }

  /**
   * Check if Clarity is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized && typeof window.clarity === 'function';
  }

  /**
   * Get configuration info
   */
  getConfig(): ClarityConfig {
    return { ...this.config };
  }
}

// Create singleton instance
export const clarityService = new ClarityService();

// Helper functions for easier usage
export const initializeClarity = () => clarityService.initialize();
export const trackClarityEvent = (event: string, properties?: Record<string, any>) =>
  clarityService.trackEvent(event, properties);
export const setClarityUserId = (userId: string) => clarityService.setUserId(userId);
export const setClaritySessionTag = (key: string, value: string) =>
  clarityService.setSessionTag(key, value);