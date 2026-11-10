import { describe, it, expect } from 'vitest';
import { parseNdjson } from './ndjson';

describe('parseNdjson', () => {
  it('완성된 줄을 JSON 이벤트로 파싱한다', () => {
    const { events, rest } = parseNdjson('{"type":"delta","text":"a"}\n{"type":"done","code":"b"}\n');
    expect(events).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'done', code: 'b' },
    ]);
    expect(rest).toBe('');
  });

  it('개행으로 끝나지 않은 꼬리는 rest로 남긴다', () => {
    const { events, rest } = parseNdjson('{"type":"delta","text":"a"}\n{"type":"del');
    expect(events).toHaveLength(1);
    expect(rest).toBe('{"type":"del');
  });

  it('JSON이 아닌 줄은 파서 원문 대신 고정 문구로 던진다', () => {
    expect(() => parseNdjson('<html>oops</html>\n')).toThrow('응답 형식');
  });

  it('빈 줄은 건너뛴다', () => {
    const { events } = parseNdjson('\n{"type":"delta","text":"a"}\n\n');
    expect(events).toHaveLength(1);
  });
});
