# Clipwise Production Scorecard

> 이 파일은 `scripts/production-score.ts`가 자동으로 갱신합니다.
> 실행: `npx tsx scripts/production-score.ts` (선택: `SCORE_LABEL="설명" ` 접두)

## 채점 제도 (Rubric)

| 카테고리 | 배점 | 내용 |
|----------|------|------|
| G 엔지니어링 게이트 | 15 | typecheck 4 · unit tests 5 · build 3 · npm audit 3 |
| F Prepare 기능 정확성 | 20 | hide · freezeTime · storage · mock · seedRandom 각 4 (DOM 단정) |
| M 모션/브랜드 | 10 | Brand Kit 적용(tone·accent·카피) 5 · tone 3종 변별 + 캡처 결정론 5 |
| D 결정론 | 15 | 2회 녹화 최종 프레임 바이트 일치 10 · 프레임 수 편차 ≤10% 5 |
| P 성능 | 20 | compose ms/frame(≤35) 10 · 녹화 오버헤드비(≤2.0×) 5 · 총 wall-clock(≤4×) 5 |
| Q 출력 품질 | 20 | MP4+probe 4 · 해상도 4 · fps 4 · 길이 정합 4 · 크기 envelope 4 |
| X CLI/DX | 10 | init 스캐폴딩(brand.yaml 포함) 3 · validate 오류 감지 4 · 스킬 설치/제거 왕복 3 |

**등급**: ≥90 **Production-Ready** · 80–89 **Release Candidate** · 65–79 **Beta** · <65 **Alpha**
게이트(G) 실패 시 등급 상한은 Beta. N/A 체크는 분모에서 제외.
점수는 earned / possible × 100으로 정규화 — 카테고리를 추가해도 비교 가능성이 유지된다.

**벤치 시나리오**:
- `scripts/bench-assets/scorecard-page.html` — "Pulse" 가상 SaaS 대시보드. 타이핑, 클릭→스피너→mock API,
  스크롤·호버·행 선택, 동결 날짜, 시드 랜덤 차트, 쿠키 배너를 한 페이지에서 자극.
- `templates/motion/intro-title.html` — Brand Kit(tone·accent·카피) 적용 검증 + tone 3종
  (midnight/daylight/neon) 변별성·캡처 결정론 검증 (M 카테고리).

---

## Run: v0.8.0 — 2026-06-10 11:30:39

**버전**: v0.8.0 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (22개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (757ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 105개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1175ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| D 결정론 · 2회 녹화 최종 프레임 바이트 일치 | 10/10 | byte-identical |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 329 vs 327 (0.6%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 14.8ms/frame (293 frames, 4.3s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.8s 녹화 → 9.8s 영상 (0.90×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 13.1s 총 (1.34×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 1746 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.8s (기대 9.8s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 179 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 | 3/3 | scenarios/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.8.0 + realistic bench page & chrome — 2026-06-10 12:30:07

**버전**: v0.8.0 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (22개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (750ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 105개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1184ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| D 결정론 · 2회 녹화 최종 프레임 바이트 일치 | 10/10 | byte-identical |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 310 vs 307 (1.0%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 14.7ms/frame (274 frames, 4.0s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.5s 녹화 → 9.1s 영상 (0.93×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 12.6s 총 (1.38×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3742 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.1s (기대 9.1s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 410 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 | 3/3 | scenarios/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.8.0 + Brand Kit & tone presets — 2026-06-10 12:48:44

**버전**: v0.8.0 · **점수**: 91/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 5/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (813ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 105개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1301ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 바이트 일치 | 0/10 | 불일치 — 페이지에 비결정 요소 잔존 |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 308 vs 306 (0.6%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 15.3ms/frame (272 frames, 4.2s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.5s 녹화 → 9.1s 영상 (0.94×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 12.7s 총 (1.40×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3779 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.1s (기대 9.1s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 417 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.8.0 + Brand Kit (scrollbar fix) — 2026-06-10 12:50:16

**버전**: v0.8.0 · **점수**: 91/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 5/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (791ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 105개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1233ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 바이트 일치 | 0/10 | 불일치 — 페이지에 비결정 요소 잔존 |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 307 vs 307 (0.0%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 15.2ms/frame (271 frames, 4.1s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.5s 녹화 → 9.0s 영상 (0.94×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 12.6s 총 (1.40×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3791 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.0s (기대 9.0s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 420 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.8.0 + Brand Kit & tone presets — 2026-06-10 12:53:03

**버전**: v0.8.0 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (788ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 105개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1208ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 콘텐츠 일치 | 10/10 | byte-identical |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 309 vs 311 (0.6%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 14.9ms/frame (273 frames, 4.1s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.5s 녹화 → 9.1s 영상 (0.94×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 12.6s 총 (1.38×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3779 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.1s (기대 9.1s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 415 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.8.0 + Scene System engine MVP — 2026-06-10 15:02:17

**버전**: v0.8.0 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (1112ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 114개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1397ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 콘텐츠 일치 | 10/10 | byte-identical |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 307 vs 306 (0.3%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 15.6ms/frame (270 frames, 4.2s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.5s 녹화 → 9.0s 영상 (0.95×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 12.7s 총 (1.42×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3752 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.1s (기대 9.0s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 411 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.9.0 release — 2026-06-10 15:40:26

**버전**: v0.9.0 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (798ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 114개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1325ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 콘텐츠 일치 | 10/10 | byte-identical |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 304 vs 307 (1.0%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 16.7ms/frame (268 frames, 4.5s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.5s 녹화 → 8.9s 영상 (0.95×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 13.0s 총 (1.45×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3755 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 8.9s (기대 8.9s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 420 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.10.0 release — 2026-06-11 03:21:08

**버전**: v0.10.0 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (944ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 114개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1543ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 콘텐츠 일치 | 10/10 | byte-identical |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 305 vs 309 (1.3%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 18.1ms/frame (269 frames, 4.9s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.6s 녹화 → 9.0s 영상 (0.95×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 13.4s 총 (1.50×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3761 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.0s (기대 9.0s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 419 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.10.1 release — 2026-06-11 04:58:33

**버전**: v0.10.1 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (697ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 114개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1139ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 콘텐츠 일치 | 10/10 | content-identical ((0,0) 렌더러 아티팩트 마스킹) |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 313 vs 309 (1.3%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 13.9ms/frame (276 frames, 3.8s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.5s 녹화 → 9.2s 영상 (0.92×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 12.3s 총 (1.34×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3801 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.2s (기대 9.2s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 413 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.11.0 release — 2026-06-11 05:33:48

**버전**: v0.11.0 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (932ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 117개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1412ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 콘텐츠 일치 | 10/10 | byte-identical |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 310 vs 309 (0.3%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 16.1ms/frame (272 frames, 4.4s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.4s 녹화 → 9.1s 영상 (0.93×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 12.8s 총 (1.41×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3778 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.1s (기대 9.1s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 417 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
## Run: v0.12.0 release — 2026-06-11 06:30:06

**버전**: v0.11.1 · **점수**: 100/100 · **판정**: **Production-Ready**

| 카테고리 | 점수 |
|----------|------|
| G 게이트 | 15/15 |
| F Prepare | 20/20 |
| M 모션/브랜드 | 10/10 |
| D 결정론 | 15/15 |
| P 성능 | 20/20 |
| Q 품질 | 20/20 |
| X CLI/DX | 10/10 |

<details><summary>세부 체크 (24개)</summary>

| 체크 | 점수 | 상세 |
|------|------|------|
| G 게이트 · typecheck (tsc --noEmit) | 4/4 | 통과 (738ms) |
| G 게이트 · unit tests (vitest) | 5/5 | 117개 통과 |
| G 게이트 · build (tsup ESM+DTS) | 3/3 | 통과 (1245ms) |
| G 게이트 · npm audit | 3/3 | 0 vulnerabilities |
| F Prepare · hide — 쿠키 배너 숨김 | 4/4 | display: none |
| F Prepare · freezeTime — 날짜 동결 | 4/4 | 페이지 날짜: 2026-06-10 |
| F Prepare · storage — localStorage 시드 | 4/4 | 환영 배지 표시됨 |
| F Prepare · mock — API 픽스처 대체 | 4/4 | revenue: $128,400 (fixture) |
| F Prepare · seedRandom — 재로드 차트 동일 | 4/4 | 차트: [60,45,85,67,17,53] vs [60,45,85,67,17,53] |
| M 모션/브랜드 · Brand Kit 적용 (tone 토큰·카피·accent) | 5/5 | daylight bg=rgb(250, 249, 247), 카피·accent 일치 |
| M 모션/브랜드 · tone 3종 변별 + 모션 캡처 결정론 | 5/5 | 변별: 3/3 고유 · 재캡처: byte-identical |
| D 결정론 · 2회 녹화 최종 프레임 콘텐츠 일치 | 10/10 | byte-identical |
| D 결정론 · 프레임 수 편차 ≤10% | 5/5 | 309 vs 313 (1.3%) |
| P 성능 · compose+encode ms/frame (≤35 만점) | 10/10 | 14.3ms/frame (273 frames, 3.9s) |
| P 성능 · 녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점) | 5/5 | 8.5s 녹화 → 9.1s 영상 (0.93×) |
| P 성능 · 총 wall-clock (≤4× 영상길이 만점) | 5/5 | 12.4s 총 (1.36×) |
| Q 품질 · MP4 생성 + ffprobe 파싱 | 4/4 | 3735 KB |
| Q 품질 · 해상도 = 출력 설정 (1280×800) | 4/4 | 1280×800 |
| Q 품질 · fps = 30 (±0.5) | 4/4 | 30.00 fps |
| Q 품질 · 길이 정합 (프레임수/fps 대비 ±10%) | 4/4 | 9.1s (기대 9.1s) |
| Q 품질 · 파일 크기 envelope (10–750 KB/s) | 4/4 | 410 KB/s |
| X CLI/DX · init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함) | 3/3 | scenarios/brand.yaml/prepare/fixtures/auth + .gitignore |
| X CLI/DX · validate — prepare 오류 2건 감지 + 비정상 종료코드 | 4/4 | freezeTime/mock 오류 모두 보고 |
| X CLI/DX · install-skill 설치/제거 왕복 | 3/3 | 설치 → 제거 모두 확인 |

</details>

---
