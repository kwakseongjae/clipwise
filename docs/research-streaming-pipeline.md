# 리서치: 동시 녹화 + 스트리밍 이펙트 파이프라인

> 이슈: #3
> 브랜치: `feat/streaming-effects-pipeline`
> 작성일: 2026-02-26

---

## 1. 현황 분석

### 1.1 현재 파이프라인 구조

```
[녹화 시작]
    │
    ├─ CDP screencastFrame 이벤트 수신 → rawFrames[] 누적
    │
[녹화 완료] ← 여기까지 블로킹
    │
    ├─ resampleToTargetFps() → CapturedFrame[] 생성
    │
    ├─ CanvasRenderer.composeAll()
    │   ├─ Pass 1: Speed Ramp (프레임 재배열)
    │   ├─ Pass 2: Context 계산 (zoom, trail, click)
    │   ├─ Pass 3: Worker pool 렌더링 (Sharp 이미지 처리)
    │   └─ Pass 4: Crossfade transition
    │
[합성 완료] ← 여기까지 블로킹
    │
    └─ VideoEncoder.encode() → FFmpeg stdin pipe → MP4/GIF
```

### 1.2 시간 특성 (실측 기반 추정)

| 단계 | 시간 특성 | 병렬화 현황 |
|------|-----------|-------------|
| 녹화 (CDP) | 시나리오 길이 고정 (예: 15초) | - |
| FPS 리샘플링 | O(n), 매우 빠름 (~10ms) | - |
| Pass 1 Speed Ramp | O(n), 빠름 (~20ms) | - |
| Pass 2 Context 계산 | O(n×trailLength), 빠름 (~50ms) | - |
| Pass 3 프레임 렌더링 | **O(n/workers), 느림 (~3-8초)** | Worker pool (최대 8개) |
| Pass 4 Transition | 경계 프레임만, 빠름 (~100ms) | - |
| FFmpeg 인코딩 | O(n), 중간 (~1-2초) | HW 가속 (macOS: VideoToolbox) |

**핵심 발견**: 전체 처리 시간의 70-80%는 Pass 3 (Sharp 이미지 처리)가 차지한다. 이 단계가 녹화 시간과 겹치면 **총 처리 시간 = max(녹화 시간, 합성 시간)** 으로 단축 가능.

---

## 2. 이펙트별 시간 의존성 분석

각 이펙트가 처리되려면 어떤 데이터가 필요한지 분석한다.

### 2.1 즉시 처리 가능 (Stateless / Past-only)

| 이펙트 | 파일 | 필요 데이터 | 스트리밍 가능 이유 |
|--------|------|-------------|-------------------|
| Background | `background.ts` | 현재 프레임 | 정적, 과거/미래 불필요 |
| Device Frame | `frame.ts` | 현재 프레임 | 정적 SVG 오버레이 |
| Watermark | `watermark.ts` | 현재 프레임 | 정적 텍스트 오버레이 |
| Cursor Rendering | `cursor.ts` | 현재 cursorPosition | 현재 프레임만 |
| Click Ripple | `cursor.ts` | 현재 clickProgress | 현재 프레임만 |
| Keystroke HUD | `keystroke.ts` | 과거 keystrokeTimeline | 현재 타임스탬프 기준 조회 |
| Cursor Trail | `cursor.ts` | 과거 N개 cursorPosition | lookback 윈도우 (trailLength개) |

### 2.2 Lookahead 버퍼 필요 (Future-dependent)

| 이펙트 | 파일 | 필요 데이터 | 제약 |
|--------|------|-------------|------|
| Zoom | `zoom.ts` | `±zoomDuration×fps` 개 프레임 | `calculateAdaptiveZoom(frames, i, ...)` 전체 배열 참조 |

**Zoom 분석**: `calculateAdaptiveZoom(frames, i, scale, transitionFrames)` 함수는 전체 `frames` 배열을 받아 프레임 `i`의 줌 스케일을 결정한다. 클릭 이벤트를 기준으로 앞뒤 `transitionFrames`(= `fps × zoomDuration / 1000`)개 프레임을 룩업한다. 기본 `zoomDuration`이 600ms, 30fps 기준 **±18프레임** 윈도우.

### 2.3 전체 프레임 필요 (Full-scan)

| 단계 | 이유 |
|------|------|
| FPS 리샘플링 | `recordingDurationMs`를 알아야 타임스탬프 보간 가능 |
| Speed Ramp | 전체 clickPosition을 스캔해 actionIndices 생성 |
| Transition (crossfade) | step 경계 양쪽 프레임 필요 |

---

## 3. 최적화 기회 3가지

### 3.1 정적 프레임 중복 제거 (Deduplication)

**문제**: CDP screencast는 화면이 바뀌지 않아도 프레임을 계속 전송한다. 특히 `waitWithRepaints()`로 강제 리페인트되는 `holdDuration` 구간에서 거의 동일한 프레임들이 수십 개 누적된다.

**해결**: 캡처 시점에서 연속 동일 프레임을 감지하고 합성 스킵.

```typescript
// 현재: 모든 rawFrame을 그대로 저장
this.rawFrames.push({ buffer, timestamp: Date.now() });

// 개선: 중복 감지 후 ref 저장
const hash = computeHash(buffer); // xxhash or Buffer.slice 비교
if (hash !== this.lastFrameHash) {
  this.rawFrames.push({ buffer, timestamp: Date.now() });
  this.lastFrameHash = hash;
} else {
  // 타임스탬프만 기록 (리샘플링에서 이전 프레임 재사용)
  this.duplicateTimestamps.push(Date.now());
}
```

**예상 효과**:
- `holdDuration: 2000`(2초, 30fps = 60 프레임) → 내용이 동일하면 1프레임만 합성
- 합성 작업량 최대 80% 감소 (정적 구간이 많은 시나리오에서)
- 메모리 사용량도 비례해서 감소

**해시 전략**: 전체 PNG 비교는 느림. 대신:
- Option A: `Buffer` 앞 1KB 비교 (빠르지만 충돌 가능)
- Option B: Sharp로 다운샘플 후 비교 (정확하지만 CPU 비용)
- Option C: CDP `screencastFrame` 이벤트에 포함된 메타데이터 활용 (있다면)

**권장**: Option A로 시작. PNG 헤더 + 앞 2KB 비교로 대부분의 실용적 중복을 걸러낼 수 있음. 같은 픽셀이지만 PNG 압축이 다른 경우 거의 없음.

---

### 3.2 합성-인코딩 파이프라인 연결 (Streaming Encoder)

**문제**: 현재 `composeAll()` → `encode()` 순서로 전체 합성이 끝나야 인코딩 시작.

**해결**: 합성된 프레임을 즉시 FFmpeg stdin으로 흘려보내는 스트리밍 방식.

```typescript
// 현재
const composed = await renderer.composeAll(frames);   // 전체 대기
await encoder.encode(composed);                        // 그 후 인코딩

// 개선: AsyncGenerator 기반 스트리밍
async function* composeStream(frames, renderer) {
  // Pass 1, 2는 여전히 사전 계산 필요
  const processFrames = applySpeedRamp(frames);
  const contexts = calculateFrameContexts(processFrames);

  // Pass 3: 완료된 프레임을 즉시 yield
  for (const [i, frame] of processFrames.entries()) {
    yield await composeFrame(frame, effects, output, contexts[i]);
  }
}

// 인코더는 generator에서 받는 즉시 FFmpeg에 공급
await encoder.encodeStream(composeStream(frames, renderer));
```

**이미 구현된 것**: `VideoEncoder`의 FFmpeg stdin pipe는 이미 스트리밍 친화적. `ffmpegProcess.stdin.write(buffer)`를 프레임 단위로 호출 가능.

**예상 효과**:
- 인코딩이 합성과 동시에 진행 → 인코딩 시간이 "무료"
- 마지막 프레임 합성 완료 직후 인코딩도 완료
- **Pass 3 시간만큼 총 처리 시간 단축** (인코딩 시간 ≈ 1-2초 절감)

---

### 3.3 녹화-합성 동시 진행 (True Streaming)

**문제**: 녹화가 끝나야 합성을 시작. 15초짜리 녹화 + 5초 합성 = 20초 대기.

**목표**: 녹화 15초 동안 합성도 병행 → 총 시간 ≈ max(15, 5) = 15초.

**기술적 제약**:
1. `resampleToTargetFps()`는 `recordingDurationMs`를 알아야 동작 → 녹화 완료 전 불가
2. Speed Ramp는 전체 프레임 필요 → 녹화 완료 전 불가
3. Zoom context는 미래 프레임 필요 → lookahead 버퍼 없으면 불가

**해결 가능한 경우** (조건부 스트리밍):

```
[녹화 중]
  - rawFrames 누적
  - Speed Ramp 비활성화 && Zoom 비활성화인 경우:
    - 수신된 rawFrame을 즉시 CapturedFrame으로 변환 가능
    - cursor/click/keystroke 데이터는 이미 실시간으로 기록됨
    - 합성 worker에 즉시 투입 가능

[녹화 완료]
  - 마지막 미처리 프레임만 합성
  - Pass 4 (Transition) 적용
  - 인코딩 완료
```

**더 현실적인 구현**: 녹화 완료 즉시 비동기 파이프라인 시작

```typescript
// recorder.record() 반환 시 RecordingSession 대신 스트리밍 세션 반환
async record(scenario): Promise<StreamingSession> {
  // 녹화는 동기적으로 완료 (변경 없음)
  const session = await this.doRecord(scenario);

  // 반환 즉시 합성 파이프라인 비동기 시작
  return new StreamingSession(session, renderer, encoder);
}

// StreamingSession은 진행률 + 완료 promise 제공
const streaming = await recorder.record(scenario);
streaming.on('progress', (pct) => spinner.update(`Composing... ${pct}%`));
await streaming.waitForOutput(); // 완성된 파일 경로 반환
```

**현재 구현과의 차이**: `record()` → `composeAll()` → `encode()` 3단계가 호출 스택에서 분리되어 이미 비동기지만, 각 단계 완료를 기다리는 구조. StreamingSession으로 감싸면 각 단계를 내부에서 파이프라인으로 처리.

---

## 4. 구현 우선순위 및 작업 계획

### Phase 1: 빠른 성과 (1-2일)

#### 1-A. 정적 프레임 중복 제거
- **파일**: `src/core/recorder.ts`
- **변경**: `screencastFrame` 핸들러에서 Buffer 앞 부분 비교
- **위험도**: 낮음 (기존 로직 영향 없음)
- **효과**: 정적 구간이 많은 시나리오에서 합성 작업 감소

#### 1-B. 합성-인코딩 파이프라인 연결
- **파일**: `src/compose/canvas-renderer.ts`, `src/compose/video-encoder.ts`
- **변경**: `composeAll()` → AsyncGenerator, `encode()` → 스트리밍 수신
- **위험도**: 중간 (기존 API 변경 필요)
- **효과**: 인코딩 시간 절감 (~1-2초)

### Phase 2: 핵심 파이프라인 (3-5일)

#### 2-A. Zoom lookahead 윈도우 기반 스트리밍
- **파일**: `src/effects/zoom.ts`, `src/compose/canvas-renderer.ts`
- **변경**: `calculateAdaptiveZoom`을 슬라이딩 윈도우로 리팩토링
- **이유**: zoom이 활성화된 경우에도 스트리밍 가능하게 하기 위함
- **위험도**: 중간 (줌 품질 검증 필요)

#### 2-B. FPS 리샘플링 스트리밍화
- **파일**: `src/core/recorder.ts`
- **변경**: 녹화 완료 직후 리샘플링 + 합성 파이프라인 즉시 시작
- **아이디어**: 녹화 중 수집된 rawFrames를 rolling window로 partially resample
- **위험도**: 높음 (타임스탬프 보간 로직 수정 필요)

### Phase 3: 아키텍처 개선 (1주일)

#### 3-A. StreamingSession 추상화
- 진행률 이벤트 emit
- 녹화-합성-인코딩 내부 파이프라인화
- CLI `spinner` 연동 개선 (현재 단계별 표시)

#### 3-B. 적응형 처리 전략 선택
- 이펙트 설정 분석 → 자동으로 최적 처리 모드 선택
  - `speedRamp: false && zoom: false` → 완전 스트리밍
  - `speedRamp: true || zoom: true` → Phase 1 최적화만 적용

---

## 5. 위험 요소 및 검증 계획

### 5.1 출력 품질 동일성 검증

스트리밍 방식으로 처리된 결과가 기존 방식과 동일한지 픽셀 수준에서 비교:

```typescript
// tests/streaming-quality.test.ts
test('streaming output matches batch output pixel-for-pixel', async () => {
  const batchResult = await recordAndCompose(scenario, { streaming: false });
  const streamResult = await recordAndCompose(scenario, { streaming: true });

  for (let i = 0; i < batchResult.frames.length; i++) {
    const diff = await sharpDiff(batchResult.frames[i], streamResult.frames[i]);
    expect(diff.pctDiff).toBe(0); // 0% 픽셀 차이
  }
});
```

### 5.2 프레임 중복 제거 안전성

동일 프레임 감지 오탐(false positive)이 발생하면 프레임이 누락됨:

```typescript
test('deduplication does not drop frames on dynamic content', async () => {
  // 빠르게 변하는 콘텐츠 (카운터, 애니메이션)에서
  // 원본 프레임 수와 deduplicated 프레임 수 차이가 합리적인지 검증
  const dedupFrames = deduplicatedFrames.length;
  const originalFrames = rawFrames.length;
  expect(dedupFrames).toBeGreaterThan(originalFrames * 0.3); // 70% 이상 드롭 불가
});
```

### 5.3 벤치마크 기준 설정

개선 전후 비교를 위한 타이밍 측정:

```
시나리오: 15초 녹화, 450 프레임 (30fps), 8코어 MacBook
측정 항목:
  - 녹화 완료까지: (고정, 비교 불필요)
  - 합성 완료까지: X초 → Y초
  - 인코딩 완료까지: X초 → Y초
  - 전체 처리 완료까지: X초 → Y초
```

---

## 6. 결론 및 권장 구현 순서

**권장 순서**: Phase 1-A → Phase 1-B → 품질 검증 → Phase 2-A → Phase 3

1. **정적 프레임 중복 제거** (가장 안전, 바로 효과)
2. **합성-인코딩 파이프라인** (비교적 안전, 눈에 보이는 속도 개선)
3. **Zoom 스트리밍** (품질 검증 중요)
4. **전체 StreamingSession 추상화** (가장 복잡, 하지만 가장 큰 UX 개선)

Phase 1만 완료해도 기존 대비 **20-40% 처리 시간 단축** 예상 (시나리오 특성에 따라 다름).
