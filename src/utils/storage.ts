import type { GeneratedComponent, Provider } from '../types';

export const PROMPT_HISTORY_MAX = 10;

export const STORAGE_KEYS = {
  apiKeys: 'rcg:apiKeys',
  provider: 'rcg:provider',
  promptHistory: 'rcg:promptHistory',
  components: 'rcg:components',
} as const;

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 용량 초과/비활성 저장소는 무시한다 (영속화는 부가 기능)
  }
}

export function parseProvider(value: unknown): Provider {
  return value === 'anthropic' || value === 'google' ? value : 'google';
}

export function parseApiKeys(value: unknown): Record<Provider, string> {
  const obj = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    anthropic: typeof obj.anthropic === 'string' ? obj.anthropic : '',
    google: typeof obj.google === 'string' ? obj.google : '',
  };
}

export function reviveComponents(value: unknown): GeneratedComponent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.id !== 'string' ||
      typeof item.prompt !== 'string' ||
      typeof item.code !== 'string'
    ) {
      return [];
    }
    const createdAt = new Date(item.createdAt);
    if (Number.isNaN(createdAt.getTime())) return [];
    return [{ id: item.id, prompt: item.prompt, code: item.code, createdAt }];
  });
}

export function addPromptHistory(history: string[], prompt: string): string[] {
  return [prompt, ...history.filter((p) => p !== prompt)].slice(0, PROMPT_HISTORY_MAX);
}
