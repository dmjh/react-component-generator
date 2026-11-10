import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

const KEY = 'rcg:components';
const saved = [
  { id: 'a', prompt: '카드', code: 'render(<div/>)', createdAt: '2026-01-02T03:04:05.000Z' },
];

// 서버의 NDJSON 응답을 흉내 내는 제어 가능한 스트림.
function makeStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    body,
    push: (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)),
    close: () => controller.close(),
  };
}

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
    const stream = makeStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream.body }));
    stream.push({ type: 'done', code: 'render(<b/>)' });
    stream.close();
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

  it('스트리밍 중인 미완성 코드는 저장소에 기록하지 않는다', async () => {
    const stream = makeStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream.body }));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => {
      void result.current.generate('버튼', undefined, 'google');
    });
    stream.push({ type: 'delta', text: 'const A' });
    await waitFor(() => expect(result.current.components).toHaveLength(1));

    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual([]);
    stream.close();
  });

  it('삭제하면 저장소에도 반영된다', () => {
    localStorage.setItem(KEY, JSON.stringify(saved));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => result.current.removeComponent('a'));

    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual([]);
  });
});

describe('useComponentGenerator 스트리밍', () => {
  it('델타가 도착하면 코드를 누적해 보여주고 streamingId를 설정한다', async () => {
    const stream = makeStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream.body }));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => {
      void result.current.generate('버튼', undefined, 'google');
    });
    stream.push({ type: 'delta', text: 'const A' });
    stream.push({ type: 'delta', text: ' = 1;' });

    await waitFor(() => expect(result.current.components[0]?.code).toBe('const A = 1;'));
    expect(result.current.streamingId).toBe(result.current.components[0].id);
    expect(result.current.isLoading).toBe(true);

    stream.close();
  });

  it('done 이벤트가 오면 서버가 정규화한 최종 코드로 교체하고 스트리밍을 끝낸다', async () => {
    const stream = makeStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream.body }));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => {
      void result.current.generate('버튼', undefined, 'google');
    });
    stream.push({ type: 'delta', text: '```\nconst A = 1;' });
    stream.push({ type: 'done', code: 'const A = 1;\nrender(<A />);' });
    stream.close();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].code).toBe('const A = 1;\nrender(<A />);');
    expect(result.current.streamingId).toBeNull();
  });

  it('스트림 error 이벤트가 오면 에러를 표시하고 미완성 컴포넌트를 제거한다', async () => {
    const stream = makeStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream.body }));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => {
      void result.current.generate('버튼', undefined, 'google');
    });
    stream.push({ type: 'delta', text: 'const A' });
    stream.push({ type: 'error', error: '생성된 코드가 너무 길어 잘렸습니다.' });
    stream.close();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('생성된 코드가 너무 길어 잘렸습니다.');
    expect(result.current.components).toHaveLength(0);
    expect(result.current.streamingId).toBeNull();
  });

  it('done 없이 스트림이 끊기면 에러로 처리하고 미완성 컴포넌트를 제거한다', async () => {
    const stream = makeStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream.body }));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => {
      void result.current.generate('버튼', undefined, 'google');
    });
    stream.push({ type: 'delta', text: 'const A' });
    stream.close();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toContain('중단');
    expect(result.current.components).toHaveLength(0);
  });

  it('연결 단계의 HTTP 에러는 서버 메시지를 그대로 표시한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: '요청이 너무 많습니다.' }) }),
    );
    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('버튼', undefined, 'google');
    });

    expect(result.current.error).toBe('요청이 너무 많습니다.');
    expect(result.current.components).toHaveLength(0);
  });
});
