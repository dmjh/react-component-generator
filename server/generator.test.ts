import { describe, it, expect } from 'vitest';
import {
  stripCodeFences,
  ensureRenderCall,
  parseSSE,
  isAnthropicStop,
  extractAnthropicDelta,
  extractGoogleChunk,
  mapErrorResponse,
} from './generator';

describe('stripCodeFences', () => {
  it('언어 태그가 붙은 코드펜스를 제거한다', () => {
    const input = '```tsx\nconst A = () => null;\n```';
    expect(stripCodeFences(input)).toBe('const A = () => null;');
  });

  it('언어 태그 없는 코드펜스도 제거한다', () => {
    const input = '```\nconst A = 1;\n```';
    expect(stripCodeFences(input)).toBe('const A = 1;');
  });

  it('펜스가 없으면 앞뒤 공백만 정리해 그대로 반환한다', () => {
    expect(stripCodeFences('  const A = 1;  ')).toBe('const A = 1;');
  });
});

describe('ensureRenderCall', () => {
  it('이미 render() 호출이 있으면 그대로 둔다', () => {
    const code = 'const Card = () => null;\nrender(<Card />);';
    expect(ensureRenderCall(code)).toBe(code);
  });

  it('const 컴포넌트 선언에 render 호출을 주입한다', () => {
    const code = 'const Card = () => null;';
    expect(ensureRenderCall(code)).toBe(`${code}\n\nrender(<Card />);`);
  });

  it('function 선언 컴포넌트에도 render 호출을 주입한다', () => {
    const code = 'function Widget() { return null; }';
    expect(ensureRenderCall(code)).toContain('render(<Widget />);');
  });

  it('대문자로 시작하는 컴포넌트 선언이 없으면 원본을 그대로 반환한다', () => {
    const code = 'const value = 42;';
    expect(ensureRenderCall(code)).toBe(code);
  });
});

describe('parseSSE', () => {
  it('완성된 이벤트의 data 페이로드를 추출한다', () => {
    const { events, rest } = parseSSE('data: {"a":1}\n\ndata: {"b":2}\n\n');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('');
  });

  it('끝나지 않은 이벤트는 rest로 남긴다', () => {
    const { events, rest } = parseSSE('data: one\n\ndata: tw');
    expect(events).toEqual(['one']);
    expect(rest).toBe('data: tw');
  });

  it('event: 줄은 무시하고 data만 취한다', () => {
    const { events } = parseSSE('event: content_block_delta\ndata: x\n\n');
    expect(events).toEqual(['x']);
  });

  it('CRLF 구분자도 처리한다', () => {
    const { events } = parseSSE('data: x\r\n\r\n');
    expect(events).toEqual(['x']);
  });

  it('스트림 종료 시(final) 빈 줄 없이 끝난 마지막 이벤트도 꺼낸다', () => {
    const { events, rest } = parseSSE('data: one\n\ndata: last', true);
    expect(events).toEqual(['one', 'last']);
    expect(rest).toBe('');
  });
});

describe('isAnthropicStop', () => {
  it('message_stop 이벤트만 true다', () => {
    expect(isAnthropicStop(JSON.stringify({ type: 'message_stop' }))).toBe(true);
    expect(isAnthropicStop(JSON.stringify({ type: 'message_start' }))).toBe(false);
  });
});

describe('extractAnthropicDelta', () => {
  it('text_delta 이벤트에서 텍스트를 꺼낸다', () => {
    const data = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'const A' },
    });
    expect(extractAnthropicDelta(data)).toBe('const A');
  });

  it('텍스트가 없는 이벤트는 빈 문자열을 반환한다', () => {
    expect(extractAnthropicDelta(JSON.stringify({ type: 'message_start' }))).toBe('');
  });

  it('error 이벤트는 예외를 던진다', () => {
    const data = JSON.stringify({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    });
    expect(() => extractAnthropicDelta(data)).toThrow('Overloaded');
  });
});

describe('extractGoogleChunk', () => {
  it('parts의 텍스트를 이어붙인다', () => {
    const data = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ab' }, { text: 'cd' }] } }],
    });
    expect(extractGoogleChunk(data)).toEqual({ text: 'abcd', finishReason: undefined });
  });

  it('finishReason을 함께 반환한다', () => {
    const data = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }],
    });
    expect(extractGoogleChunk(data).finishReason).toBe('MAX_TOKENS');
  });

  it('candidates가 없으면 빈 텍스트를 반환한다', () => {
    expect(extractGoogleChunk('{}').text).toBe('');
  });

  it('error 청크는 예외를 던진다', () => {
    const data = JSON.stringify({ error: { code: 503, message: 'overloaded' } });
    expect(() => extractGoogleChunk(data)).toThrow('503');
  });
});

describe('mapErrorResponse', () => {
  it('503이 포함되면 과부하 메시지와 503을 반환한다', () => {
    const r = mapErrorResponse('Gemini API error: 503');
    expect(r.status).toBe(503);
    expect(r.error).toContain('과부하');
  });

  it('429가 포함되면 429를 반환한다', () => {
    expect(mapErrorResponse('Claude API error: 429').status).toBe(429);
  });

  it('그 외에는 원문 메시지와 500을 반환한다', () => {
    expect(mapErrorResponse('boom')).toEqual({ status: 500, error: 'boom' });
  });
});
