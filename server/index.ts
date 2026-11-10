import {
  stripCodeFences,
  ensureRenderCall,
  parseSSE,
  isAnthropicStop,
  extractAnthropicDelta,
  extractGoogleChunk,
  mapErrorResponse,
} from './generator';
import { withModelFallback } from './fallback';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function callGoogleModel(prompt: string, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }

  return (
    candidate?.content?.parts
      ?.map((part) => part.text)
      ?.join('') ?? ''
  );
}

async function callGoogle(prompt: string, apiKey: string): Promise<string> {
  return withModelFallback(GOOGLE_MODELS, (model) => callGoogleModel(prompt, apiKey, model));
}

// 업스트림 SSE 응답에서 data 페이로드를 하나씩 꺼낸다.
async function* iterateSSE(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // 마지막 이벤트가 빈 줄 없이 끝나도 버리지 않는다 (MAX_TOKENS 청크 등).
      yield* parseSSE(buffer + decoder.decode(), true).events;
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSSE(buffer);
    buffer = rest;
    yield* events;
  }
}

const INCOMPLETE_STREAM_ERROR = '응답이 중간에 종료되었습니다. 다시 시도해주세요.';

// 스트리밍 호출은 연결(상태 코드 확인)까지 await하고, 텍스트 델타 이터러블을 반환한다.
// 연결 실패는 여기서 던져지므로 상태 코드 매핑과 Google 모델 폴백이 그대로 동작한다.
// signal은 클라이언트 연결 종료 시 업스트림 요청도 중단하기 위한 것이다.
async function streamAnthropic(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<AsyncIterable<string>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  return (async function* () {
    let stopped = false;
    for await (const data of iterateSSE(response)) {
      const text = extractAnthropicDelta(data);
      if (text) yield text;
      if (isAnthropicStop(data)) stopped = true;
    }
    if (!stopped) throw new Error(INCOMPLETE_STREAM_ERROR);
  })();
}

async function streamGoogleModel(
  prompt: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<AsyncIterable<string>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  return (async function* () {
    let finished = false;
    for await (const data of iterateSSE(response)) {
      const { text, finishReason } = extractGoogleChunk(data);
      if (text) yield text;
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
      }
      if (finishReason) finished = true;
    }
    if (!finished) throw new Error(INCOMPLETE_STREAM_ERROR);
  })();
}

function streamGoogle(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<AsyncIterable<string>> {
  return withModelFallback(GOOGLE_MODELS, (model) => streamGoogleModel(prompt, apiKey, model, signal));
}

// 클라이언트로는 줄 단위 JSON(NDJSON)을 보낸다: delta / done / error.
function toNdjsonResponse(deltas: AsyncIterable<string>): Response {
  const encoder = new TextEncoder();
  // 클라이언트가 먼저 끊으면 enqueue/close가 던지므로 무시한다 (업스트림은 req.signal로 중단된다).
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: object) => {
    try {
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    } catch {
      // 이미 취소된 스트림
    }
  };

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = '';
      try {
        for await (const delta of deltas) {
          text += delta;
          send(controller, { type: 'delta', text: delta });
        }
        send(controller, { type: 'done', code: ensureRenderCall(stripCodeFences(text)) });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        send(controller, { type: 'error', error: mapErrorResponse(message).error });
      } finally {
        try {
          controller.close();
        } catch {
          // 이미 취소된 스트림
        }
      }
    },
  });

  return new Response(body, {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    const isStream = url.pathname === '/api/generate/stream';

    if (req.method === 'POST' && (url.pathname === '/api/generate' || isStream)) {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (isStream) {
          const deltas =
            provider === 'google'
              ? await streamGoogle(prompt, resolvedKey, req.signal)
              : await streamAnthropic(prompt, resolvedKey, req.signal);
          return toNdjsonResponse(deltas);
        }

        const text =
          provider === 'google'
            ? await callGoogle(prompt, resolvedKey)
            : await callAnthropic(prompt, resolvedKey);

        const code = ensureRenderCall(stripCodeFences(text));

        return Response.json({ code }, { headers: CORS_HEADERS });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const { status, error } = mapErrorResponse(message);

        return Response.json({ error }, { status, headers: CORS_HEADERS });
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
