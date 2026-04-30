# 작업지시서: progress 파일명 시간 정확도 개선

## 목표
progress 파일명의 시간 부분이 임의 추정값 대신 실제 시스템 시간을 반영하도록 CLAUDE.md 지시사항 수정

## 원인
Claude AI는 실제 시스템 시간을 알 수 없어서 파일명의 시간을 추정값으로 작성함.
예: 실제 11:05인데 `180000`으로 생성

## 해결 방법
CLAUDE.md 8번 줄 (progress 파일 생성 규칙)에 다음 지시 추가:
- progress 파일 생성 직전에 Bash 툴로 `date +%y%m%d-%H%M%S` 명령을 실행
- 명령 결과값을 파일명으로 사용

## 체크리스트
- [x] CLAUDE.md progress 파일명 규칙에 "Bash로 실제 시간 조회" 지시 추가
- [x] 작업지시서 completed로 이동
