// 서버 스트리밍 응답(`/api/generate/stream`)의 이벤트. 줄 단위 JSON(NDJSON)으로 온다.
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

// 파서 에러 원문은 사용자에게 보이지 않도록 고정 문구로 바꾼다.
function parseLine(line: string): StreamEvent {
  try {
    return JSON.parse(line) as StreamEvent;
  } catch {
    throw new Error('서버 응답 형식이 올바르지 않습니다. 다시 시도해주세요.');
  }
}

/** 버퍼에서 완성된 줄을 이벤트로 파싱하고, 개행으로 끝나지 않은 꼬리는 rest로 돌려준다. */
export function parseNdjson(buffer: string): { events: StreamEvent[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events = lines.filter((line) => line.trim()).map(parseLine);
  return { events, rest };
}
