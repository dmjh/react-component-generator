import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readStorage,
  writeStorage,
  parseProvider,
  parseApiKeys,
  reviveComponents,
  addPromptHistory,
  PROMPT_HISTORY_MAX,
} from './storage';

beforeEach(() => {
  localStorage.clear();
});

describe('readStorage / writeStorage', () => {
  it('저장한 값을 그대로 읽어온다', () => {
    writeStorage('k', { a: 1 });
    expect(readStorage('k', null)).toEqual({ a: 1 });
  });

  it('값이 없으면 fallback을 반환한다', () => {
    expect(readStorage('missing', 'fallback')).toBe('fallback');
  });

  it('JSON이 깨져 있으면 fallback을 반환한다', () => {
    localStorage.setItem('k', '{broken');
    expect(readStorage('k', 'fallback')).toBe('fallback');
  });

  it('저장소 쓰기가 실패해도 예외를 던지지 않는다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeStorage('k', 1)).not.toThrow();
    spy.mockRestore();
  });
});

describe('parseProvider', () => {
  it('유효한 provider는 그대로 반환한다', () => {
    expect(parseProvider('anthropic')).toBe('anthropic');
    expect(parseProvider('google')).toBe('google');
  });

  it('알 수 없는 값은 google로 되돌린다', () => {
    expect(parseProvider('openai')).toBe('google');
    expect(parseProvider(null)).toBe('google');
  });
});

describe('parseApiKeys', () => {
  it('provider별 문자열 키만 유지한다', () => {
    expect(parseApiKeys({ anthropic: 'sk-1', google: 3 })).toEqual({
      anthropic: 'sk-1',
      google: '',
    });
  });

  it('객체가 아니면 빈 키를 반환한다', () => {
    expect(parseApiKeys('x')).toEqual({ anthropic: '', google: '' });
  });
});

describe('reviveComponents', () => {
  it('createdAt 문자열을 Date로 복원한다', () => {
    const iso = '2026-01-02T03:04:05.000Z';
    const result = reviveComponents([{ id: '1', prompt: 'p', code: 'c', createdAt: iso }]);
    expect(result).toHaveLength(1);
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(result[0].createdAt.toISOString()).toBe(iso);
  });

  it('형식이 맞지 않는 항목은 버린다', () => {
    const result = reviveComponents([
      { id: '1', prompt: 'p', code: 'c', createdAt: '2026-01-02T03:04:05.000Z' },
      { id: 2 },
      null,
    ]);
    expect(result.map((c) => c.id)).toEqual(['1']);
  });

  it('배열이 아니면 빈 배열을 반환한다', () => {
    expect(reviveComponents({})).toEqual([]);
  });
});

describe('addPromptHistory', () => {
  it('새 프롬프트를 맨 앞에 추가한다', () => {
    expect(addPromptHistory(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('중복 프롬프트는 앞으로 옮기고 하나만 남긴다', () => {
    expect(addPromptHistory(['a', 'b'], 'b')).toEqual(['b', 'a']);
  });

  it('최대 개수를 넘으면 오래된 항목을 버린다', () => {
    const full = Array.from({ length: PROMPT_HISTORY_MAX }, (_, i) => `p${i}`);
    const next = addPromptHistory(full, 'new');
    expect(next).toHaveLength(PROMPT_HISTORY_MAX);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`p${PROMPT_HISTORY_MAX - 1}`);
  });
});
