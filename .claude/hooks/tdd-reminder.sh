#!/usr/bin/env bash
# PreToolUse(Edit|Write) 훅: 코드 작성/수정 직전에 TDD 규칙을 상기시킨다.
# 차단하지 않고 additionalContext만 주입한다 (exit 0).
cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "[TDD 리마인더 - .claude/rules/tdd.md, Rigid] 지금 로직이 있는 코드(비즈니스 로직/API/유틸/버그 수정)를 작성·수정하려 한다. 1) 이 변경을 먼저 요구하는 실패 테스트가 있는가? 없으면 이 편집을 멈추고 테스트부터 작성한다. 2) RED는 반드시 실행해서 실패를 확인하고, 실패 이유는 오타/import 오류가 아니라 기능 미구현이어야 한다. 3) GREEN은 테스트를 통과시키는 최소 코드만(YAGNI), 전체 스위트를 실행해 확인한다. 4) 테스트보다 프로덕션 코드를 먼저 썼다면 그 코드를 삭제하고 RED부터 다시 시작한다(주석 처리/임시 보관 금지). 5) 버그 수정은 재현하는 실패 테스트가 먼저다. 6) 하나의 동작 = 하나의 테스트. 타입 정의, 설정 파일, 순수 UI(로직 없는 마크업/CSS)는 TDD 대상이 아니다. 프로젝트 AGENTS.md의 테스트 경계(server/index.ts는 import 금지, 순수 함수로 분리해 테스트)를 따른다. '단순해서', '나중에', '시간이 없어서'는 변명이다."
  }
}
EOF
