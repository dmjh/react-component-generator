---
name: create-pr
description: |
  현재 브랜치의 변경사항을 분석해 GitHub Pull Request를 생성하는 스킬.
  "PR 만들어줘", "PR 생성", "풀리퀘스트 올려줘", "create a PR", "open a pull request", "/create-pr" 같은 요청에 활성화한다.
  현재 프로젝트(react-component-generator)는 한국어 템플릿, 그 외 프로젝트는 영어 템플릿을 사용한다.
context: fork
---

# create-pr: 템플릿 기반 PR 생성

`context: fork`로 실행되므로 이 스킬의 분석 과정(diff, 로그 탐색)은 메인 대화 컨텍스트와 분리된다. 메인에는 최종 결과(PR URL, 제목, 요약)만 돌려준다.

## 원칙

- 커밋되지 않은 변경이 있으면 PR을 만들지 않고 사용자에게 알린다. 커밋은 `/commit` 스킬로 먼저 하도록 안내한다.
- 기본 브랜치(main/master)에서 직접 PR을 만들 수 없다. 이 경우 알리고 종료한다.
- `--force` push, 기본 브랜치로의 직접 push는 하지 않는다.
- PR 본문에 비밀 정보(키, 토큰, `.env` 내용)를 넣지 않는다.
- 이미 같은 브랜치의 열린 PR이 있으면 새로 만들지 않고 그 URL을 알린다.

## 절차

### 1. 사전 확인

```bash
git branch --show-current
git status --short
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef
gh pr list --head "$(git branch --show-current)" --state open
```

- `gh` 인증이 안 되어 있으면 `! gh auth login`을 안내하고 종료한다.
- base 브랜치는 `defaultBranchRef`(보통 main)를 쓴다. 사용자가 지정하면 그것을 따른다.

### 2. 템플릿 선택

현재 프로젝트 판별: `gh repo view --json name -q .name`이 `react-component-generator`이면 현재 프로젝트다. (원격이 없으면 `package.json`의 `name`으로 판별한다.)

| 조건 | 템플릿 |
|------|--------|
| 현재 프로젝트 | [references/template-ko.md](references/template-ko.md) (한국어) |
| 그 외 프로젝트 | [references/template-en.md](references/template-en.md) (영어) |

사용자가 언어를 명시하면 그 지시를 우선한다. 선택한 템플릿 파일을 읽고 그 구조(섹션 순서와 제목)를 그대로 따른다. 섹션을 임의로 추가·삭제하지 않는다.

### 3. 변경 분석

```bash
git log <base>..HEAD --oneline
git diff <base>...HEAD --stat
git diff <base>...HEAD
```

- 마지막 커밋만이 아니라 base 이후 모든 커밋을 기준으로 작성한다.
- 템플릿의 변경 유형, 변경 내용, 테스트 항목은 diff와 커밋에서 확인된 사실만 쓴다. 실행하지 않은 테스트를 "통과"로 적지 않는다.
- 테스트 체크리스트는 실제로 실행해 결과를 확인한 것만 체크한다. 필요하면 프로젝트의 테스트 명령을 실행한다.

### 4. PR 제목

- 템플릿 언어와 같은 언어로, 70자 이내 한 줄.
- 한국어: 커밋 컨벤션과 같은 `<type>: <요약>` (feat/fix/refactor/chore). 영어: 동일 형식의 영어 요약.
- 커밋이 하나면 그 메시지를 기반으로 한다.

### 5. push 및 PR 생성

```bash
git push -u origin <현재 브랜치>
gh pr create --base <base> --title "<제목>" --body-file <본문 파일>
```

- 본문은 임시 파일에 써서 `--body-file`로 전달한다(줄바꿈·특수문자 보존).
- 시스템 리마인더에 PR 설명 말미 어트리뷰션 문구가 주어져 있으면 본문 끝에 그대로 덧붙인다. 없으면 붙이지 않는다.
- 사용자가 요청하지 않았다면 draft, reviewer, label은 지정하지 않는다.

### 6. 결과 보고

메인 컨텍스트로 다음만 돌려준다: PR URL, 제목, 사용한 템플릿 언어, base와 head 브랜치, 변경 요약 2~3줄.
