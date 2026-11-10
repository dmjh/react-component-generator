import { useState, useCallback, useEffect } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { parseNdjson } from '../utils/ndjson';
import { readStorage, writeStorage, reviveComponents, STORAGE_KEYS } from '../utils/storage';

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  error: string | null;
  /** 코드가 스트리밍으로 채워지고 있는 컴포넌트의 id. 없으면 null. */
  streamingId: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useState<GeneratedComponent[]>(() =>
    reviveComponents(readStorage<unknown>(STORAGE_KEYS.components, [])),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  // 스트리밍 중에는 델타마다 쓰지 않고, 끝난 뒤 한 번만 저장한다.
  useEffect(() => {
    if (streamingId !== null) return;
    writeStorage(STORAGE_KEYS.components, components);
  }, [components, streamingId]);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);

    // 첫 델타가 도착하면 목록에 컴포넌트를 추가하고, 이후 코드를 갱신한다.
    let id: string | null = null;
    const upsertCode = (code: string) => {
      if (id === null) {
        const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        id = newId;
        setStreamingId(newId);
        setComponents((prev) => [{ id: newId, prompt, code, createdAt: new Date() }, ...prev]);
      } else {
        const targetId = id;
        setComponents((prev) => prev.map((c) => (c.id === targetId ? { ...c, code } : c)));
      }
    };

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate component');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let code = '';
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjson(buffer);
        buffer = parsed.rest;

        for (const event of parsed.events) {
          if (event.type === 'delta') {
            code += event.text;
            upsertCode(code);
          } else if (event.type === 'done') {
            upsertCode(event.code);
            completed = true;
          } else {
            throw new Error(event.error);
          }
        }
      }

      // done 없이 끊긴 스트림의 잘린 코드를 정상 컴포넌트로 남기지 않는다.
      if (!completed) {
        throw new Error('코드 생성이 중단되었습니다. 다시 시도해주세요.');
      }
    } catch (err) {
      if (id !== null) {
        const failedId = id;
        setComponents((prev) => prev.filter((c) => c.id !== failedId));
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setStreamingId(null);
      setIsLoading(false);
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, []);

  return { components, isLoading, error, streamingId, generate, removeComponent, clearAll };
}
