// AI 응답 텍스트를 react-live에서 실행 가능한 코드로 정규화하는 순수 함수들.
// 부수효과(Bun.serve 등)가 없어 단위 테스트가 가능하다.

/** 응답에 섞여 나온 마크다운 코드펜스(```)를 제거한다. */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:jsx|tsx|javascript|typescript)?\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

/**
 * react-live(noInline)는 `render(...)` 호출이 있어야 미리보기를 그린다.
 * 응답에 render 호출이 없으면 첫 컴포넌트 선언을 찾아 자동으로 주입한다.
 */
export function ensureRenderCall(code: string): string {
  if (/\brender\s*\(/.test(code)) return code;

  const match = code.match(/(?:const|function)\s+([A-Z]\w+)/);
  if (match) {
    return `${code}\n\nrender(<${match[1]} />);`;
  }
  return code;
}

/**
 * SSE 버퍼에서 완성된 이벤트의 data 페이로드를 꺼내고, 미완성 꼬리는 rest로 돌려준다.
 * final이면 스트림이 끝난 것이므로 빈 줄 없이 끝난 마지막 이벤트도 꺼낸다.
 */
export function parseSSE(buffer: string, final = false): { events: string[]; rest: string } {
  const blocks = (final ? `${buffer}\n\n` : buffer).split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';
  const events: string[] = [];

  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (data) events.push(data);
  }

  return { events, rest };
}

/** Anthropic 스트림이 정상 종료(message_stop)됐는지 판별한다. */
export function isAnthropicStop(data: string): boolean {
  return (JSON.parse(data) as { type: string }).type === 'message_stop';
}

/** Anthropic 스트림 이벤트에서 텍스트 델타를 꺼낸다. error 이벤트는 예외로 던진다. */
export function extractAnthropicDelta(data: string): string {
  const event = JSON.parse(data) as {
    type: string;
    delta?: { type: string; text?: string };
    error?: { message?: string };
  };

  if (event.type === 'error') {
    throw new Error(`Claude API error: ${event.error?.message ?? 'stream error'}`);
  }
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? '';
  }
  return '';
}

/** Gemini 스트림 청크에서 텍스트와 종료 사유를 꺼낸다. */
export function extractGoogleChunk(data: string): { text: string; finishReason?: string } {
  const chunk = JSON.parse(data) as {
    error?: { code?: number; message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  if (chunk.error) {
    throw new Error(`Gemini API error: ${chunk.error.code ?? ''} ${chunk.error.message ?? ''}`.trim());
  }
  const candidate = chunk.candidates?.[0];

  return {
    text: candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
    finishReason: candidate?.finishReason,
  };
}

/** 에러 메시지의 상태 코드 문자열로 HTTP 응답 상태와 사용자용 메시지를 정한다. */
export function mapErrorResponse(message: string): { status: number; error: string } {
  if (message.includes('503')) {
    return { status: 503, error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' };
  }
  if (message.includes('429')) {
    return { status: 429, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  }
  return { status: 500, error: message };
}
