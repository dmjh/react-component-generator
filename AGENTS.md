# AGENTS.md

## Operational Commands

- 패키지 매니저는 `bun` 고정. npm/yarn/pnpm 사용 금지 (`bun.lock` 사용).
- 개발 서버(API + Vite 동시): `bun run dev`
- 테스트: `bun run test` (vitest). `bun test`는 Bun 내장 러너를 호출하므로 사용 금지. `vite.config.ts:17-20`의 jsdom/setupFiles 설정이 `src/`와 `server/` 테스트 모두에 적용된다.
- 단일 테스트: `bun run test server/generator.test.ts`
- 린트: `bun run lint`
- 빌드(타입체크 포함): `bun run build`
- 포트: API 서버 3002 (`server/index.ts:139`), Vite 5173. 포트를 바꾸면 `vite.config.ts:11` 프록시 target도 함께 바꾼다.

## Golden Rules

### Immutable

- API 키는 클라이언트로 내려보내지 않는다. `/api/config`는 키 보유 여부(boolean)만 반환한다 (`server/index.ts:147-157`). 키 값을 응답, 로그, 에러 메시지에 포함하지 마라.
- Google 호출 URL에 키가 쿼리스트링으로 들어간다 (`server/index.ts:99`). 이 URL을 로깅하거나 에러 메시지에 넣지 마라.
- `.env`는 커밋 금지 (`.gitignore`).
- 민감 파일(`.env`, `.env.*`, `*credential*`, `*secret*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `~/.ssh`, `~/.aws` 등)은 읽기·수정·쓰기(`Write`/`Edit`, Bash의 `cp`/`mv`/`rm`/`tee`/`sed -i`/리다이렉트/`Set-Content`/`Out-File` 등)·삭제·출력 모두 금지다. `.claude/settings.json`의 `permissions.deny`로 차단되어 있으며, 이 규칙을 우회(Bash `cat`/`type`, 다른 도구, 복사본 생성)하거나 deny 목록을 완화하지 마라. 환경 변수가 필요하면 값을 읽지 말고 `.env`의 변수 이름만 사용자에게 확인하라.

### Do's & Don'ts

- Do: AI 응답 후처리 로직(코드펜스 제거, render 주입)은 `server/generator.ts`의 순수 함수에 두고 테스트를 함께 추가한다. `server/index.ts`는 `Bun.serve`를 즉시 실행하므로 import하면 서버가 뜬다 (`server/index.ts:138`), 테스트에서 import 금지.
- Do: 에러 상태 매핑은 메시지 문자열에 `503`/`429`가 포함되는지로 판정한다 (`server/index.ts:194,201`). 프로바이더 호출 에러 메시지에 HTTP 상태 코드를 유지하라 (`server/index.ts:85,112`).
- Don't: 생성 코드 미리보기를 `LiveProvider`의 inline 모드로 바꾸지 마라. `noInline` + `render(...)` 호출 전제로 서버가 코드를 정규화한다 (`src/components/LivePreview.tsx:11`, `server/generator.ts:12-24`).
- Don't: 시스템 프롬프트의 "no import", "no TypeScript", "render() 호출" 규칙을 완화하지 마라. react-live는 import와 타입 구문을 실행하지 못한다 (`server/index.ts:11-12,20`).

### 비대칭 / 이중 방어

- 모델 폴백은 Google 경로에만 있다 (`server/index.ts:5,134-136`). Anthropic은 단일 모델 (`server/index.ts:77`). `MAX_TOKENS` 잘림 검사도 Google에만 있다 (`server/index.ts:123`). 프로바이더 동작을 수정할 때 두 경로를 각각 확인하라.
- 코드펜스와 render 호출은 이중 방어다. 프롬프트가 금지/요구하고 (`server/index.ts:12,16`), 서버가 한 번 더 보정한다 (`server/generator.ts`). 한쪽만 제거하지 마라.
- 서버 `Provider` 타입이 `server/index.ts:57`과 `src/types/index.ts:1`에 중복 정의되어 있다. 프로바이더를 추가할 때 양쪽을 함께 수정하라.

### 테스트 경계

- 테스트 있음: `server/generator.ts`, `server/fallback.ts`, `src/components/PromptInput.tsx`.
- 테스트 없음: `server/index.ts`(프로바이더 호출, 라우팅), `src/hooks/useComponentGenerator.ts`, 나머지 컴포넌트. 이 영역을 수정할 때는 수동 검증 결과를 보고하거나 순수 함수로 분리해 테스트를 추가하라.

## Project Context

- 프롬프트로 React 컴포넌트를 생성하고 react-live로 미리보기하는 웹 앱. 소개/설치는 `README.md` 참조.
- Stack: React 19, TypeScript, Vite, vitest, react-live, Bun 서버.

## Standards & References

- 커밋 메시지: 한국어 `<type>: <요약>`, type은 `feat`/`fix`/`refactor`/`chore`.
- Maintenance Policy: 규칙과 코드가 어긋나면 AGENTS.md 업데이트를 제안하라. 인용된 라인 번호는 코드 변경 시 갱신 대상이다.

## Context Map

- **[서버/AI 프로바이더 수정](./server/AGENTS.md)** — Bun 서버, 프롬프트, 폴백, 응답 정규화 작업 시.
- **[프론트엔드 수정](./src/AGENTS.md)** — React 컴포넌트, 훅, 미리보기 작업 시.
