# 리서치: v1.0 품질 도약 — 속도·안정성·셀링포인트 강화

> 관련 이슈: (신규)
> 작성일: 2026-03-28
> 분류: 기능

---

## 1. 배경 및 목적

Clipwise는 YAML 시나리오 → MP4/GIF 변환이라는 유니크한 포지션을 가지고 있지만, 현재 셀링포인트가 빈약하다:

| 문제 | 현황 |
|------|------|
| 용량 대비 품질 | CRF 18 balanced 프리셋이지만 `-tune animation` 미사용, 코덱 최적화 부족 |
| 줌 자연스러움 | 매 호버/클릭마다 줌 트리거 → 연속 인터랙션 시 어지러움 |
| 속도 컨트롤 | speedRamp이 스트리밍 차단, idle/action 구분이 단순 (클릭 proximity만) |
| 처리 속도 | 43초 영상에 128초 소요 (합성 70%) |
| API 대기 처리 | 사용자가 더미/fixture/timeout을 수동으로 걸어야 함 |

**목표:** After Effects로 후처리한 것 같은 품질을 YAML 하나로 달성.

---

## 2. 현황 분석

### 2.1 파이프라인 구조

```
YAML → Playwright CDP 녹화 → 4-pass 합성 → FFmpeg 인코딩
         (30.8s, 24%)          (89.7s, 70%)    (7.5s, 6%)
```

### 2.2 합성 병목 상세

`src/compose/compose-frame.ts` 의 프레임당 파이프라인:
1. Device frame (extend + composite) — ~8ms
2. Cursor effects (highlight, trail, pointer, click ripple) — ~5ms
3. **Zoom (crop + resize)** — ~15ms
4. Keystroke HUD — ~3ms
5. **Background (padding + gradient + shadow)** — ~12ms
6. Watermark — ~2ms
7. **Final resize** — ~10ms
8. PNG decode/encode 오버헤드 — ~14ms (이미 raw RGBA로 대부분 제거됨)

**총 ~69ms/frame × 1303 frames = 89.7s**

### 2.3 메모리 사용 패턴

| 구간 | 피크 메모리 | 원인 |
|------|------------|------|
| 녹화 | ~260MB (1303 × 200KB) | rawFrames[] PNG 버퍼 누적 |
| 합성 | ~32MB (8 workers × 4MB backdrop) | 워커별 static layer 캐시 |
| 전환 | ~1.8MB per window | 트랜지션 프레임 버퍼링 |

### 2.4 줌 한계

```typescript
// src/effects/zoom.ts — calculateAdaptiveZoomFromLookup()
// 클릭 proximity만으로 줌 결정
// → 호버만 하는 인터랙션에서 줌 안됨
// → 같은 영역 연속 클릭 시 줌아웃→줌인 반복 (불필요한 모션)
// → 전역 duration → 액션 특성별 차별화 불가
```

### 2.5 Speed Ramp 한계

```typescript
// canvas-renderer.ts — applySpeedRamp()
// 전체 프레임 배열 필요 → canStreamOnline() = false
// 클릭 proximity 기반 idle/action 구분만 가능
// DOM 변화, 네트워크 활동, 로딩 상태 인식 불가
```

---

## 3. 조사 내용

### 3.1 SOTA 스크린 레코더 비교

| 도구 | 스크립터블 | 자동줌 | 후처리 | 오픈소스 | 크로스플랫폼 |
|------|-----------|--------|--------|---------|-------------|
| **Clipwise** | YAML ✅ | 클릭 기반 | 4-pass | MIT | Playwright |
| Screen Studio | ✗ | 스프링 물리 | 실시간 | ✗ | macOS only |
| Screenize | ✗ | Vision AI | 멀티트랙 | Apache 2.0 | macOS only |
| AutoZoom | ✗ | AI | 모션블러 | ✗ | Win+macOS |
| Remotion | React | 수동 | 수동 | 부분 | Node.js |
| Cap | ✗ | ✗ | 제한적 | AGPL | Rust+Tauri |

**핵심 발견:**
- Screen Studio의 "마법"은 전부 후처리 — 녹화는 raw, 이펙트는 포스트. Clipwise와 동일한 아키텍처
- Screenize는 Apple Vision으로 UI 요소 감지 → Clipwise는 **Playwright DOM 접근**이 가능하므로 더 정밀한 처리 가능
- **어떤 도구도 YAML 스크립팅 + 자동 시네마틱 후처리를 동시에 제공하지 않음**

### 3.2 줌 모션 기법

#### 3.2.1 스프링 물리 (Screen Studio 방식)

```
기존 cubic bezier: duration 기반, 중단 불가, 기계적
스프링 물리: mass/stiffness/damping, 중단 가능, 자연스러운 오버슈트
```

**장점:**
- 새 클릭 발생 시 현재 애니메이션을 자연스럽게 redirect (중단 가능)
- damping 조절로 "바운시" ↔ "부드러운" 느낌 조절
- duration을 명시하지 않아도 물리적으로 자연스러운 타이밍 도출

**구현:** `spring-easing` npm 패키지 → CSS 호환 키프레임 생성

#### 3.2.2 줌 디바운싱 / 영역 인식

```
현재: 클릭 → 즉시 줌인 → 줌아웃 → 다음 클릭 → 줌인 (어지러움)
개선: 클릭 → 줌인 → 같은 영역 클릭 → 줌 유지 → 다른 영역 → 자연스럽게 팬
```

- **UI 영역 감지:** Playwright `element.boundingBox()`로 클릭된 요소의 부모 컨테이너 영역 추출
- **줌 존 개념:** 같은 DOM 영역 내 연속 인터랙션 → 줌 레벨 유지, 포커스 포인트만 팬
- **줌 디바운스:** 이전 줌아웃 완료 전 새 클릭 → 줌아웃 취소, 새 타겟으로 redirect

#### 3.2.3 모션 블러 (AutoZoom 방식)

줌 전환 중 2-3 프레임 블렌딩으로 모션 블러 근사:
- 급격한 줌/팬 전환에서 시각적 부드러움 증가
- Sharp의 `blur()` 사용 가능, 추가 비용 미미

### 3.3 콘텐츠 인식 스마트 편집

#### 3.3.1 Clipwise만의 강점: 시맨틱 레벨 인식

다른 도구들은 **픽셀 레벨** 분석만 가능:
- 프레임 차이 > threshold → "활동 중"
- 오디오 무음 구간 → "유휴"

Clipwise는 **Playwright + YAML** 조합으로 **시맨틱 레벨** 정보 보유:
- 어떤 액션이 실행 중인지 알고 있음 (click, type, navigate, wait)
- DOM 변화를 MutationObserver로 감지 가능
- 네트워크 요청 상태를 CDP로 실시간 모니터링 가능
- CSS 애니메이션 (스피너) 감지 가능

#### 3.3.2 API 콜 대기 처리 — `waitForResponse` + 자동 배속

**현재 문제:**
```yaml
# 사용자가 직접 타임아웃, 더미, fixture를 관리해야 함
- action: click
  selector: "#submit"
- action: wait
  duration: 5000  # API 응답 대기... 영상에 5초 데드타임
```

**개선 방향: `smartWait` 액션**
```yaml
- action: click
  selector: "#submit"
- action: smartWait
  until: networkIdle    # 또는 selector, response 등
  timeout: 30000
  displaySpeed: 8x      # 대기 구간 8배속 (기본값)
  transition: timeWarp  # 대기→결과 전환 이펙트
```

동작 원리:
1. 녹화 중 실제로 API 응답까지 대기 (real recording)
2. 대기 구간의 프레임에 `waitingPhase: true` 메타데이터 마킹
3. 합성 시 `waitingPhase` 프레임을 `displaySpeed` 배로 배속
4. 배속 구간 전후에 `transition` 이펙트 적용 (시간 흐름 표현)

#### 3.3.3 DOM 변화 기반 프레임 중요도 스코어링

```
프레임별 "변화 스코어" 산출:
- DOM mutation 발생 → +3
- 네트워크 응답 완료 → +2
- 커서 이동 > 50px → +1
- 키보드 입력 → +2
- 스크롤 → +1
- 아무 변화 없음 → 0

스코어 기반 배속 결정:
- 0: 최대 배속 (skip 또는 8x)
- 1-2: 중간 배속 (2-4x)
- 3+: 정상 속도 (1x) 또는 슬로우 (0.5-0.8x)
```

### 3.4 인코딩 품질 최적화

#### 3.4.1 즉시 적용 가능한 개선

| 항목 | 현재 | 개선 | 효과 |
|------|------|------|------|
| tune | 미지정 | `-tune animation` | 텍스트/UI 엣지 품질 향상 |
| pixel format | yuv420p | yuv420p10le (HEVC) | 그라디언트 밴딩 제거 |
| preset | medium (추정) | slow | 동일 CRF에서 ~20% 용량 감소 |

#### 3.4.2 AV1 (SVT-AV1) 코덱 옵션

```bash
-c:v libsvtav1 -crf 30 -preset 6 -svtav1-params scm=2
```
- `scm=2` = Screen Content Mode — UI/텍스트 최적화
- H.264 대비 40-60% 용량 감소
- 단점: 인코딩 속도 느림 (HW 가속 없음)

### 3.5 메모리 최적화 기법

#### 3.5.1 프레임 온디맨드 로딩

현재: rawFrames[] 전체를 메모리에 보관
개선: 디스크 기반 프레임 스토어

```
녹화 시: 프레임 → tmpdir/frame-{i}.png (디스크)
합성 시: 필요한 프레임만 로드 → 합성 → 해제
```

피크 메모리: 260MB → workerCount × frameSize ≈ 8 × 200KB ≈ 1.6MB

#### 3.5.2 SharedArrayBuffer (고급)

워커 간 프레임 버퍼 zero-copy 전달:
- 현재: structured clone → 버퍼 복사
- 개선: SharedArrayBuffer + Atomics → 복사 없이 공유
- 제한: Node.js worker_threads에서 복잡한 동기화 필요

### 3.6 처리 속도 개선

#### 3.6.1 Sharp 파이프라인 최적화

현재 compose-frame.ts에서 Sharp 연산이 체이닝되지 않고 개별 호출됨:

```typescript
// 현재: 각 이펙트가 독립적 Sharp 인스턴스
const zoomed = await applyZoom(frame, ...);      // Sharp 1회
const framed = await applyDeviceFrame(zoomed, ...); // Sharp 1회
const bg = await applyBackground(framed, ...);    // Sharp 1회

// 개선: 단일 Sharp 파이프라인으로 체이닝
sharp(rawFrame)
  .extract({ left, top, width, height })  // zoom crop
  .resize(outputW, outputH)               // zoom resize
  .composite([                            // 모든 오버레이 한 번에
    { input: cursorSvg, top: cy, left: cx },
    { input: keystrokeSvg, top: ky, left: kx },
  ])
  .raw()
  .toBuffer()
```

**예상 효과:** Sharp 초기화 오버헤드 제거 → 프레임당 69ms → ~45ms (35% 감소)

#### 3.6.2 GPU 가속 (libvips SIMD)

Sharp(libvips)는 이미 NEON SIMD를 사용하지만, 추가 최적화 여지:
- `sharp.simd(true)` 명시적 활성화 확인
- resize 시 `kernel: sharp.kernel.lanczos2` (lanczos3 대비 빠름, 스크린 콘텐츠에 충분)

#### 3.6.3 정적 프레임 합성 스킵

현재 dedup은 녹화 단계에서만 적용. 합성 단계에서도 가능:
- 이전 프레임과 동일한 screenshot + 동일한 커서 위치 → 합성 결과도 동일
- 이전 결과 재사용 → 합성 프레임 수 추가 감소

---

## 4. 비교 분석: 구현 우선순위

| # | 개선 항목 | 난이도 | 영향도 | 스트리밍 호환 | 우선순위 |
|---|----------|--------|--------|-------------|---------|
| A | `-tune animation` + 인코딩 최적화 | 🟢 낮음 | 🟡 중간 | ✅ | P0 (즉시) |
| B | Sharp 파이프라인 체이닝 | 🟡 중간 | 🔴 높음 | ✅ | P0 |
| C | 스프링 물리 줌 + 줌 영역 인식 | 🔴 높음 | 🔴 높음 | ✅ | P1 |
| D | smartWait + 콘텐츠 인식 배속 | 🔴 높음 | 🔴 높음 | ⚠️ 부분 | P1 |
| E | 디스크 기반 프레임 스토어 | 🟡 중간 | 🟡 중간 | ✅ | P1 |
| F | 합성 단계 dedup | 🟢 낮음 | 🟡 중간 | ✅ | P1 |
| G | AV1 코덱 지원 | 🟢 낮음 | 🟡 중간 | ✅ | P2 |
| H | 모션 블러 on 줌 전환 | 🟡 중간 | 🟡 중간 | ✅ | P2 |
| I | SharedArrayBuffer zero-copy | 🔴 높음 | 🟡 중간 | ✅ | P3 |

---

## 5. 권장 사항: 구현 로드맵

### Phase 1: 즉시 품질 개선 (P0)

**1-A. 인코딩 품질 점프**
- `video-encoder.ts`에 `-tune animation` 추가
- HEVC 10-bit 모드 (`yuv420p10le`) 활성화
- preset `slow` 옵션 추가 (social=medium, balanced=slow, archive=veryslow)
- 예상: 동일 CRF에서 용량 20% 감소, 텍스트 선명도 체감 향상

**1-B. Sharp 파이프라인 리팩터링**
- `compose-frame.ts`의 이펙트 체인을 단일 Sharp 파이프라인으로 통합
- `.extract()` → `.resize()` → `.composite([...overlays])` → `.raw()`
- 예상: 합성 시간 35% 감소 (89.7s → ~58s)

### Phase 2: 스마트 줌 시스템 (P1)

**2-A. 스프링 물리 줌 엔진**
- `spring-easing` 패키지 도입
- `zoom.ts`에 `SpringZoomEngine` 클래스 추가
  - 파라미터: `{ stiffness: 180, damping: 24, mass: 1 }`
  - 중단 가능: 새 타겟 발생 시 현재 속도 유지하며 redirect
- cubic bezier는 fallback으로 유지 (YAML `zoom.easing: "spring" | "cubic"`)

**2-B. 줌 영역 인식 (Zone-Aware Zoom)**
- 녹화 시 각 클릭/타입 액션의 **DOM 부모 컨테이너** bounding box 기록
  - `element.evaluate(el => el.closest('section, form, [role=dialog], .card')?.getBoundingClientRect())`
- 연속 인터랙션이 같은 zone 내 → 줌 레벨 유지, 포커스만 pan
- zone 변경 시 → 줌아웃 → 팬 → 줌인 (시네마틱 전환)
- per-step `zoom.zone` 오버라이드 지원

**2-C. 줌 디바운싱**
- 이전 줌 애니메이션 완료 전 새 액션 → 줌아웃 취소, 새 타겟으로 redirect
- 스프링 물리가 이를 자연스럽게 처리 (velocity 보존)

### Phase 3: 콘텐츠 인식 스마트 편집 (P1 — 가장 중요)

**3-A. 녹화 시 메타데이터 수집**

`recorder.ts`에 프레임별 메타데이터 확장:
```typescript
interface FrameMetadata {
  timestamp: number;
  stepIndex: number;
  // 신규 추가:
  domMutationCount: number;    // MutationObserver 카운트
  networkPending: number;      // 진행 중인 네트워크 요청 수
  isWaitingPhase: boolean;     // smartWait 대기 중 여부
  contentChangeScore: number;  // 종합 변화 스코어 (0-10)
}
```

CDP를 통한 수집:
- `DOM.documentUpdated` / `DOM.childNodeCountUpdated` → DOM 변화 감지
- `Network.requestWillBeSent` / `Network.loadingFinished` → 네트워크 상태
- `Animation.animationStarted` → CSS 애니메이션/스피너 감지

**3-B. `smartWait` 액션**

```yaml
steps:
  - name: "Submit form"
    actions:
      - action: click
        selector: "#submit-btn"
      - action: smartWait
        until: networkIdle      # networkIdle | selector | response | domStable
        timeout: 30000
        displaySpeed: 8         # 대기 구간 N배속 (기본 8)
        showProgress: true      # 프로그레스 인디케이터 오버레이
```

구현:
1. `smartWait` 시작 → 프레임에 `isWaitingPhase: true` 마킹
2. 조건 충족까지 실제 대기 (녹화는 계속)
3. 합성 시 `isWaitingPhase` 프레임 → `displaySpeed` 배속 적용
4. 배속 전후에 자동 이징 (급격한 속도 변화 방지)

**3-C. 콘텐츠 인식 자동 배속 (Auto Speed Ramp)**

```yaml
effects:
  smartSpeed:
    enabled: true
    mode: contentAware        # contentAware | manual
    idleSpeed: 4-8x           # 변화 없는 구간
    loadingSpeed: 6-12x       # 로딩/스피너 구간
    transitionDuration: 300   # 배속 전환 이징 (ms)
    minSegmentDuration: 500   # 최소 세그먼트 길이 (너무 짧은 배속 방지)
```

스트리밍 호환 설계:
- 현재 `speedRamp`은 전체 프레임 배열 필요 → 스트리밍 차단
- `smartSpeed`는 프레임별 `contentChangeScore`로 로컬 결정 가능
- 슬라이딩 윈도우 (±15 frames) 내에서 배속 결정 → 스트리밍 호환

### Phase 4: 메모리 + 추가 최적화 (P1-P2)

**4-A. 디스크 기반 프레임 스토어**
- `os.tmpdir()/clipwise-{sessionId}/` 에 프레임 파일 저장
- `FrameStore` 클래스: `.put(i, buffer)`, `.get(i)` → 자동 LRU 캐시
- 피크 메모리 260MB → ~10MB (워커 수 × 캐시 크기)

**4-B. 합성 레벨 프레임 스킵**
- 이전 프레임과 동일 screenshot + 커서 위치 ± 2px → 이전 합성 결과 재사용
- dedup rate 추가 10-15% 예상

**4-C. AV1 코덱 지원**
- `output.codec: "av1"` 옵션 추가
- SVT-AV1 `scm=2` (Screen Content Mode) 적용
- 용량 40-60% 추가 감소

**4-D. 모션 블러 on 줌 전환**
- 줌/팬 전환 중 전후 프레임 블렌딩 (2-3 프레임)
- `sharp.blur(sigma)` 사용, sigma는 줌 속도에 비례

### Phase 5: API 표면 확장 (P2)

**5-A. 프리셋 시스템**
```yaml
preset: cinematic    # cinematic | fast | minimal
# cinematic: 스프링줌 + smartSpeed + motion blur + -tune animation
# fast: 줌 없음 + 최소 이펙트 + 하드웨어 인코딩
# minimal: 이펙트 없이 raw + 소프트웨어 인코딩
```

**5-B. MCP 서버 노출**
- Claude Code / Cursor 등 AI 에이전트가 Clipwise 녹화를 트리거할 수 있는 MCP 인터페이스

---

## 6. 예상 벤치마크 개선

| 단계 | 현재 | Phase 1 후 | Phase 3 후 | Phase 4 후 |
|------|------|-----------|-----------|-----------|
| 합성 | 89.7s | ~58s (-35%) | ~45s (-50%) | ~38s (-58%) |
| 인코딩 | 7.5s | 7.5s | 7.5s | 7.5s |
| **Total** | **127.9s** | **~96s** | **~83s** | **~76s** |
| 피크 메모리 | ~300MB | ~300MB | ~300MB | **~40MB** |
| 출력 용량 | 기준 | -20% | -20% | -40% (AV1) |

*43초 영상 기준, M1 Max 10-core. smartWait 구간이 많은 시나리오일수록 체감 개선 큼.*

---

## 7. 참고 자료

- [Screen Studio](https://screen.studio/) — macOS 시네마틱 스크린 레코더, 줌/커서 스무딩 벤치마크
- [Screenize](https://github.com/syi0808/screenize) — Apple Vision 기반 UI 요소 감지 줌
- [AutoZoom](https://autozoom.app/) — 모션 블러 on 줌 전환
- [spring-easing](https://github.com/okikio/spring-easing) — 스프링 물리 이징 npm 패키지
- [FFmpeg -tune animation](https://ffmpeg.party/guides/x264/) — 스크린 콘텐츠 최적 인코딩
- [SVT-AV1 scm=2](https://gitlab.com/AOMediaCodec/SVT-AV1) — Screen Content Mode
- [Remotion](https://www.remotion.dev/) — React 기반 프로그래매틱 비디오 생성
- [Motion Canvas](https://motioncanvas.io/) — TypeScript 애니메이션 (generator 패턴)
- [CRF Guide](https://slhck.info/video/2017/02/24/crf-guide.html) — FFmpeg CRF 가이드
