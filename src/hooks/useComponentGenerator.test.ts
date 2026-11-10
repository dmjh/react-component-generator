import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

const KEY = 'rcg:components';
const saved = [
  { id: 'a', prompt: '카드', code: 'render(<div/>)', createdAt: '2026-01-02T03:04:05.000Z' },
];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useComponentGenerator 영속화', () => {
  it('저장된 컴포넌트 목록으로 초기화한다', () => {
    localStorage.setItem(KEY, JSON.stringify(saved));
    const { result } = renderHook(() => useComponentGenerator());

    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].createdAt).toBeInstanceOf(Date);
  });

  it('생성에 성공하면 목록을 저장소에 기록한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'render(<b/>)' }) }),
    );
    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('버튼', undefined, 'google');
    });

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].prompt).toBe('버튼');
    });
  });

  it('삭제하면 저장소에도 반영된다', () => {
    localStorage.setItem(KEY, JSON.stringify(saved));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => result.current.removeComponent('a'));

    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual([]);
  });
});
