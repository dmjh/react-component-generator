# server/AGENTS.md

## Module Context

Bun 런타임에서 실행되는 AI API 프록시. 프론트엔드는 Vite 프록시(`/api`)를 통해서만 접근한다.

## Tech Stack & Constraints

- 런타임은 Bun (`Bun.serve`, `process.env`). 외부 HTTP 클라이언트 라이브러리 없이 전역 `fetch`만 사용한다 (`index.ts:69,101`).
- 서버 코드에서 `src/`를 import하지 않는다. 현재 `src/`와 공유하는 코드는 없다.

## Implementation Patterns

- 새 프로바이더: `callXxx(prompt, apiKey)` 함수 추가, `Provider` 유니온(`index.ts:57`)과 `ENV_KEYS`(`index.ts:59`) 확장, `/api/generate` 분기(`index.ts:183-186`) 수정.
- 여러 모델 시도가 필요하면 `withModelFallback`(`fallback.ts`)으로 감싼다. 모두 실패하면 마지막 에러만 던진다.
- 응답 텍스트는 항상 `ensureRenderCall(stripCodeFences(text))`를 거쳐 반환한다 (`index.ts:188`).
- 모든 응답에 `CORS_HEADERS`를 붙인다 (`index.ts:51`). 새 라우트도 동일하게 적용한다.

## Testing Strategy

- `bun run test server/` 로 실행. 테스트 파일은 대상 옆에 `*.test.ts`로 둔다.
- 테스트 가능성을 위해 부수효과 없는 로직은 `generator.ts`, `fallback.ts`에 분리한다. `index.ts`는 import 시 서버가 시작되므로 테스트 대상에서 제외된다.

## Local Golden Rules

- Don't: `callGoogleModel`에서 `MAX_TOKENS` 처리를 제거하지 마라. 잘린 코드가 그대로 미리보기에 렌더링되어 깨진다 (`index.ts:123-125`).
- Don't: `withModelFallback`이 에러를 삼키게 바꾸지 마라. 마지막 에러의 상태 코드 문자열이 `index.ts:194,201`의 503/429 매핑에 쓰인다 (`fallback.ts:15-19`).
- Don't: 클라이언트가 보낸 `apiKey`보다 환경변수 키를 우선하도록 바꾸지 마라. 현재 우선순위는 클라이언트 키가 먼저다 (`index.ts:65`).
- Do: 시스템 프롬프트 수정 시 예시 출력(`index.ts:22-49`)이 규칙과 모순되지 않는지 확인하라. 모델이 예시를 그대로 따른다.
