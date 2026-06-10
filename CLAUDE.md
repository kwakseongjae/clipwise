# CLAUDE.md

## Project

Clipwise — Playwright + CDP 기반 스크립터블 시네마틱 스크린 레코더. YAML 시나리오 → MP4/GIF/PNG.

## Build & Test

```bash
npm run build          # tsup (ESM + DTS)
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npx tsx scripts/benchmark.ts          # 성능 벤치마크 (dist/ 빌드 필요)
npx tsx scripts/production-score.ts   # 프로덕션 스코어카드 (게이트+기능+결정론+성능+품질+CLI 채점)
```

- Worker 스레드(`frame-worker.js`)가 `dist/`를 참조하므로 벤치마크 전 반드시 `npm run build`
- `BENCH_LABEL="label" npx tsx scripts/benchmark.ts` — 결과 자동 누적 → `docs/benchmark-results.md`

### Production Scorecard (릴리스 전 필수)

`npx tsx scripts/production-score.ts` — 인터랙티브 벤치 시나리오를 실제 파이프라인으로
녹화·채점해 **프로덕션 수준 판정**(Production-Ready / RC / Beta / Alpha)을 내린다.
결과는 `docs/production-scorecard.md`에 누적. `SCORE_LABEL="설명"` 으로 라벨 지정.
게이트(typecheck/test/build/audit)는 스크립트가 자체 실행하므로 별도 빌드 불필요.
릴리스 체크리스트의 3·4번(build/test/audit 확인)을 이 한 명령으로 대체할 수 있다.

## Release Process

### CI/CD Pipeline

`.github/workflows/publish.yml` — `v*` 태그 push 시 자동 실행:

```
npm ci → typecheck → test → build → npm publish → gh release create
```

npm 인증은 **Trusted Publishing(OIDC)** — 토큰 없음(만료 사고 원천 차단).
npmjs.com 패키지 설정 > Trusted Publisher에 `kwakseongjae/clipwise · publish.yml`이
등록되어 있어야 한다. NPM_TOKEN 시크릿은 더 이상 사용하지 않는다.

### Release 체크리스트

1. `package.json` 버전 업데이트
2. `CHANGELOG.md` 작성
3. `npm run build && npm test` 통과 확인
4. `npm audit` — 0 vulnerabilities 확인
5. `git commit` → `git tag -a vX.Y.Z`
6. `git push origin main && git push origin vX.Y.Z`
7. CI가 자동으로 npm publish + GitHub Release 생성

### !! GitHub Release를 수동 생성하지 말 것 !!

CI 파이프라인이 `gh release create`를 자동 실행합니다.
수동으로 먼저 생성하면 CI의 릴리스 단계에서 `"Release.tag_name already exists"` 에러가 발생합니다.
릴리스 노트를 커스터마이즈하려면 CI 완료 후 GitHub UI에서 수정하세요.

## Code Conventions

- 한국어 주석/문서 사용 (기술 용어는 영어)
- Effects는 `src/effects/` 에 모듈별 분리
- 새 이펙트 추가 시 `OverlayDescriptor` 패턴 사용 (Sharp 배치 합성 호환)
- `src/index.ts`에 public API export 추가 필수
- 테스트: `tests/` 디렉토리, vitest

## Key Architecture Notes

- `compose-frame.ts` — pre-zoom 오버레이는 `OverlayDescriptor[]`로 수집 후 1회 `.composite([...])` 호출 (Sharp 배치)
- `recorder.ts` — `isWaitingPhase` 중 dedup 바이패스 (스피너 프레임 보존)
- `canvas-renderer.ts` — `filterSmartSpeedInline()` (스트리밍 경로) + `applySmartSpeed()` (배치 경로) 양쪽 유지 필요
- `zoom.ts` — `mergeClickZones()` → `calculateAdaptiveZoomFromZones()` 가 기본 줌 계산 경로

## Static Site & Docs

- `docs/index.html` (EN), `docs/ko/index.html` (KO) — 기능 패리티 유지
- `docs/research/` — 리서치 아카이브 (README.md 인덱스)
- 버전 업데이트 시 양쪽 HTML의 스키마 버전 번호도 동기화
