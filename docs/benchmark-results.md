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
## Run: phase-1b-streaming — 2026-02-26 03:41:38

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `phase-1b-streaming` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 31.45s | 32% |
| Compose+Encode (streaming) | 66.86s | 68% |
| **Total** | **98.31s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 912 |
| 합성 완료 프레임 수 | 912 |
| 영상 길이 | 30.4s @ 30fps |
| 프레임당 합성+인코딩 시간 | 73ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1306 |
| 저장 (고유) | 871 |
| 건너뜀 (중복) | 435 (33%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +-1 MB |
| Compose+Encode | +-2 MB |

---
## Run: phase-2a-zoom-window — 2026-02-26 03:55:32

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `phase-2a-zoom-window` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 31.21s | 30% |
| Compose+Encode (streaming) | 74.56s | 70% |
| **Total** | **105.78s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 908 |
| 합성 완료 프레임 수 | 908 |
| 영상 길이 | 30.3s @ 30fps |
| 프레임당 합성+인코딩 시간 | 82ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1297 |
| 저장 (고유) | 863 |
| 건너뜀 (중복) | 434 (33%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +-9 MB |
| Compose+Encode | +-3 MB |

---
## Run: phase-3a-streaming-session — 2026-02-26 04:10:24

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `phase-3a-streaming-session` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 31.31s | 31% |
| Compose+Encode (streaming) | 68.54s | 69% |
| **Total** | **99.84s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 909 |
| 합성 완료 프레임 수 | 909 |
| 영상 길이 | 30.3s @ 30fps |
| 프레임당 합성+인코딩 시간 | 75ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1293 |
| 저장 (고유) | 866 |
| 건너뜀 (중복) | 427 (33%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +5 MB |
| Compose+Encode | +-9 MB |

---
## Run: phase-3b-concurrent — 2026-02-26 04:32:59

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `phase-3b-concurrent` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 31.47s | 32% |
| Compose+Encode (streaming) | 67.57s | 68% |
| **Total** | **99.04s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 914 |
| 합성 완료 프레임 수 | 914 |
| 영상 길이 | 30.5s @ 30fps |
| 프레임당 합성+인코딩 시간 | 74ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1312 |
| 저장 (고유) | 868 |
| 건너뜀 (중복) | 444 (34%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +5 MB |
| Compose+Encode | +-8 MB |

---
## Run: phase-3b-concurrent — 2026-02-26 04:35:55

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `phase-3b-concurrent` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 100.33s | 100% |
| Compose+Encode (streaming) | 0ms | 0% |
| **Total** | **100.33s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 909 |
| 합성 완료 프레임 수 | 860 |
| 영상 길이 | 30.3s @ 30fps |
| 프레임당 합성+인코딩 시간 | 117ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1297 |
| 저장 (고유) | 860 |
| 건너뜀 (중복) | 437 (34%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +-3 MB |
| Compose+Encode | +0 MB |

---
## Run: opt-concurrency-static-raw — 2026-02-26 05:28:47

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `opt-concurrency-static-raw` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 31.15s | 30% |
| Compose+Encode (streaming) | 74.01s | 70% |
| **Total** | **105.16s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 920 |
| 합성 완료 프레임 수 | 920 |
| 영상 길이 | 30.7s @ 30fps |
| 프레임당 합성+인코딩 시간 | 80ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1319 |
| 저장 (고유) | 879 |
| 건너뜀 (중복) | 440 (33%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +3 MB |
| Compose+Encode | +-6 MB |

---
## Run: opt-concurrency-static-raw — 2026-02-26 05:32:45

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `opt-concurrency-static-raw` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 41.62s | 31% |
| Compose+Encode (streaming) | 92.08s | 69% |
| **Total** | **133.70s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 1234 |
| 합성 완료 프레임 수 | 1234 |
| 영상 길이 | 41.1s @ 30fps |
| 프레임당 합성+인코딩 시간 | 75ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1308 |
| 저장 (고유) | 876 |
| 건너뜀 (중복) | 432 (33%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +3 MB |
| Compose+Encode | +-7 MB |

---
## Run: showcase-1920x1200-fulleffects — 2026-02-26 06:48:21

| 항목 | 값 |
|------|-----|
| 시나리오 | Pulse Dashboard Demo |
| Label | `showcase-1920x1200-fulleffects` |
| CPU | Apple M1 Max (10코어) |
| Node | v24.12.0 |

### 파이프라인 타이밍

| 단계 | 시간 | 비중 |
|------|------|------|
| Recording | 31.28s | 32% |
| Compose+Encode (streaming) | 65.59s | 68% |
| **Total** | **96.87s** | 100% |

### 프레임 통계

| 항목 | 값 |
|------|-----|
| 리샘플링 후 프레임 수 | 910 |
| 합성 완료 프레임 수 | 910 |
| 영상 길이 | 30.3s @ 30fps |
| 프레임당 합성+인코딩 시간 | 72ms/frame |

### 중복 제거 통계 (Dedup)

| 항목 | 값 |
|------|-----|
| 수신 프레임 | 1309 |
| 저장 (고유) | 868 |
| 건너뜀 (중복) | 441 (34%) |

### 메모리 사용 증분 (MB)

| 단계 | 증가량 |
|------|--------|
| Recording | +0 MB |
| Compose+Encode | +-3 MB |

---
