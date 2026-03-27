# 리서치: 줌 연속성 — 타이핑 중 줌 유지 + 포커스 팬 보간

> 작성일: 2026-03-28
> 분류: 기능

---

## 1. 배경 및 목적

두 가지 줌 관련 UX 문제 해결:

1. **타이핑 중 줌이 풀림**: `type` 액션 시작 시 클릭 이벤트가 1회만 등록되고, `CLICK_EFFECT_DURATION_MS`(500ms) 경과 후 `clickPosition`이 null이 되어 줌이 해제됨
2. **줌 사이 포커스 점프**: 두 줌 영역이 가까울 때 줌 스케일은 zone-aware로 유지되지만, 포커스 포인트가 프레임별 독립 계산이라 (x1,y1) → (x2,y2)로 즉시 점프

## 2. 현황 분석

### 2.1 타이핑 줌 해제 흐름

```
recorder.ts: type 액션 실행
  ├─ clickTimeline.push({ position, timestamp: T0 })  ← 1회만 등록
  ├─ page.click(selector)
  └─ for (char of text) { keyboard.type(char) }       ← T0+550ms (10자 × 55ms)

buildCapturedFrames():
  clickEvent = clickTimeline.find(
    click => frame.timestamp >= click.timestamp
          && frame.timestamp <= click.timestamp + 500ms  ← CLICK_EFFECT_DURATION_MS
  )

결과:
  T0+000ms: clickPosition = (x,y) → zoom IN  ✓
  T0+300ms: clickPosition = (x,y) → zoom IN  ✓
  T0+500ms: clickPosition = null   → zoom OUT ✗  ← 타이핑 아직 진행 중
  T0+550ms: 타이핑 완료 (줌은 이미 풀림)
```

**핵심**: 클릭 이벤트 수명(500ms)이 타이핑 지속 시간보다 짧음.

### 2.2 포커스 점프 흐름

```
compose-frame.ts line 267:
  rawFocus = followCursor
    ? (frame.cursorPosition ?? frame.clickPosition ?? center)
    : (frame.clickPosition ?? frame.cursorPosition ?? center)

문제: 프레임별 독립 계산, 보간 없음
  Frame 100: clickPosition = Click1(x1,y1) → focus = (x1,y1)
  Frame 109: clickPosition = Click1(x1,y1) → focus = (x1,y1)
  Frame 110: clickPosition = Click2(x2,y2) → focus = (x2,y2)  ← 즉시 점프
```

**핵심**: zone-aware 줌은 스케일 연속성만 보장, 포커스 포인트 보간 없음.

## 3. 해결 방안

### 3.1 타이핑 줌 유지 — 타이핑 종료 시 추가 클릭 등록

`type` 액션 완료 후 동일 위치에 클릭 이벤트를 추가 등록:
- Click1: T0 (타이핑 시작) → T0+500ms 커버
- Click2: T0+typing_duration (타이핑 종료) → T0+typing_duration+500ms 커버
- `mergeClickZones`가 두 클릭을 하나의 zone으로 병합
- 결과: 전체 타이핑 구간 + 500ms 여유까지 줌 유지

### 3.2 포커스 팬 보간 — FrameContext에 focusPoint 추가

`calculateFrameContexts()`에서 zone 내 포커스 포인트를 보간:

```
Zone: {start: 100, end: 120}
Click1 at frame 100: focus = (x1, y1)
Click2 at frame 120: focus = (x2, y2)

Frame 100: focus = (x1, y1)
Frame 110: focus = lerp((x1,y1), (x2,y2), 0.5)  ← 부드러운 팬
Frame 120: focus = (x2, y2)
```

구현: `FrameContext`에 `focusOverride?: { x, y }` 추가 → `compose-frame.ts`에서 우선 사용.

## 4. 참고

- Screen Studio: 포커스 포인트를 EMA(지수이동평균) 필터로 스무딩
- AutoZoom: 줌 전환 중 모션 블러로 점프 시각적 완화
- 권장: EMA보다 zone 경계 기반 선형 보간이 예측 가능하고 디버깅 용이
