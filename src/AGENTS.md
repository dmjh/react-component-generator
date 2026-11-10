# src/AGENTS.md

## Module Context

Vite 기반 React 19 프론트엔드. `/api/generate`, `/api/config`를 호출하고 결과 코드를 react-live로 렌더링한다.

## Tech Stack & Constraints

- 미리보기는 `react-live`의 `LiveProvider noInline` 고정 (`components/LivePreview.tsx:11`). 생성 코드는 `render(<X />)` 호출로 끝나야 그려진다.
- 네트워크 호출은 상대 경로 `/api/...`만 사용한다 (`hooks/useComponentGenerator.ts:23`). 서버 주소를 하드코딩하지 마라. 개발 시 Vite 프록시가 전달한다.

## Implementation Patterns

- 서버 호출과 목록 상태는 `useComponentGenerator` 훅에 모은다. 컴포넌트에서 직접 `fetch`하지 마라.
- 공용 타입은 `types/index.ts`에 둔다. `Provider`는 서버에도 별도 정의가 있으므로 변경 시 `server/index.ts:57`도 수정한다.
- `apiKey`는 값이 있을 때만 요청 본문에 포함한다 (`hooks/useComponentGenerator.ts:26`). 빈 문자열을 보내면 서버의 환경변수 키 폴백이 무시된다 (`server/index.ts:65`는 falsy만 폴백).

## Testing Strategy

- `bun run test src/` 로 실행. jsdom 환경, `test/setup.ts`가 jest-dom 매처 등록과 테스트 후 `cleanup()`을 처리한다 (`test/setup.ts:6-8`).
- 쿼리는 role과 접근 가능한 이름 기준 (`PromptInput.test.tsx` 패턴). 사용자 상호작용은 `userEvent.setup()`.
- 현재 테스트는 `PromptInput`만 있다. 훅과 다른 컴포넌트는 미커버.

## Local Golden Rules

- Don't: `generate`에서 서버 에러 메시지(`data.error`)를 가공하지 마라. 서버가 사용자용 한국어 메시지를 이미 만든다 (`hooks/useComponentGenerator.ts:32`, `server/index.ts:196-206`).
- Don't: `GeneratedComponent.id` 생성 방식을 순번으로 바꾸지 마라. 새 항목이 앞에 추가되고 삭제도 id 필터링이라 안정적 고유값이 필요하다 (`hooks/useComponentGenerator.ts:36,42,52`).
