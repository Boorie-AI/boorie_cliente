/**
 * Ollama URL config centralizada
 * Configurable desde Settings → AI Configuration
 * Por defecto: localhost:11434 o VITE_OLLAMA_URL
 */
export function getOllamaBaseUrl(): string {
  const stored = localStorage.getItem('ollama_base_url');
  if (stored) return stored.replace(/\/$/, '');
  if (import.meta.env.VITE_OLLAMA_URL) return import.meta.env.VITE_OLLAMA_URL.replace(/\/$/, '');
  return 'http://localhost:11434';
}

export function setOllamaBaseUrl(url: string): void {
  localStorage.setItem('ollama_base_url', url.replace(/\/$/, ''));
}
