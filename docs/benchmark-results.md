# Clipwise Benchmark Results

> 이 파일은 `scripts/benchmark.ts`가 자동으로 갱신합니다.
> compaction 이후에도 내용이 유지됩니다.

## Run: baseline — 2026-02-26 02:26:06

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `baseline` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 30.77s | 24% |
| Composition | 89.70s | 70% |
| Encoding | 7.46s | 6% |
| **Total** | **127.92s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 1303 |
| 합성 완료 프레임 수 | 1303 |
| 영상 길이 | 43.4s @ 30fps |
| 프레임당 합성 시간 | 69ms/frame |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +-2 MB |
| Composition | +-1 MB |
| Encoding | +0 MB |

---
## Run: phase-1a-dedup — 2026-02-26 02:30:07

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `phase-1a-dedup` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 30.80s | 32% |
| Composition | 61.17s | 63% |
| Encoding | 4.96s | 5% |
| **Total** | **96.94s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 908 |
| 합성 완료 프레임 수 | 908 |
| 영상 길이 | 30.3s @ 30fps |
| 프레임당 합성 시간 | 67ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1312 |
| 저장 (고유) | 873 |
| 건너뜀 (중복) | 439 (33%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +-10 MB |
| Composition | +-2 MB |
| Encoding | +0 MB |

---
