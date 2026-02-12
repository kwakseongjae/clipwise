# TFT-Record - Playwright 기반 화면 녹화 도구 리서치

> 프로젝트: Playwright 기반 페이지 홍보용 화면 녹화 및 데모 생성 도구
> 작성일: 2026-02-11

---

## 목차

1. [기존 유사 서비스 분석](#1-기존-유사-서비스-분석)
2. [Playwright 화면 녹화 기능 조사](#2-playwright-화면-녹화-기능-조사)
3. [퍼블릭 배포 시 고려사항](#3-퍼블릭-배포-시-고려사항)
4. [핵심 기능 추출 및 우선순위](#4-핵심-기능-추출-및-우선순위)
5. [테스트 전략](#5-테스트-전략)

---

## 1. 기존 유사 서비스 분석

### 1.1 Screen Studio

> 참고: https://screen.studio/

**개요**: macOS 전용 프로페셔널 화면 녹화 도구. 녹화 후 자동으로 시각적 효과를 적용하여 고품질 데모 영상을 생성.

**핵심 기능**:
- **자동 줌 효과**: 클릭/타이핑 등 사용자 인터랙션 감지 시 자동으로 해당 영역 줌인. 타임라인에서 드래그로 줌 조절 가능
- **커서 스무딩/하이라이팅**: 불규칙한 마우스 이동을 부드럽고 의도적인 글라이딩으로 변환. 커서 크기 조절, 클릭 이펙트, 정지 시 자동 숨김
- **배경 효과**: 그라데이션, 이미지, 비디오 배경 지원. 창 프레임 커스터마이징
- **음성 처리**: 자동 볼륨 정규화, 배경 소음 제거, 자동 자막 생성
- **녹화 옵션**: 전체 화면, 특정 창, 선택 영역, 웹캠, 마이크, 시스템 오디오, iPhone/iPad 연결 녹화
- **내보내기**: MP4 (최대 4K 60fps), 최적화 GIF

**차별점**: 녹화 후 자동 후처리 파이프라인 (줌, 커서 스무딩, 배경). 비개발자도 프로페셔널 데모 영상 제작 가능.

**UX 패턴**: 녹화 → 타임라인 기반 편집 → 자동 효과 적용 → 내보내기

**기술**: 네이티브 macOS 앱 (Swift), 유료 ($89 일회성)

---

### 1.2 Arcade

> 참고: https://www.arcade.software/

**개요**: 인터랙티브 데모 생성 도구. 스텝 기반 가이드를 통해 사용자가 직접 조작할 수 있는 데모를 빠르게 제작.

**핵심 기능**:
- **스텝 기반 가이드**: 워크플로우를 단계별로 분리하여 인터랙티브 가이드 생성
- **핫스팟**: 클릭 가능한 영역 지정하여 사용자가 직접 단계를 진행
- **조건 분기 (Branching)**: 사용자 선택에 따라 다른 데모 경로 제공
- **합성 보이스오버**: AI 기반 음성 내레이션 자동 생성
- **팬 & 줌**: 특정 영역으로의 부드러운 카메라 이동
- **Page Morph**: 텍스트 직접 편집으로 데이터 커스터마이징
- **Chrome 확장 + 데스크톱 앱**: 웹/데스크톱 워크플로우 녹화
- **브랜드 커스터마이징**: 로고, 색상 등 브랜드 일관성 유지

**차별점**: 평균 6분 내 데모 제작 가능. 인터랙티브 (영상이 아닌 클릭 가능한 데모). 조건 분기로 개인화된 데모 경험.

**UX 패턴**: 화면 녹화/캡처 → 스텝 편집 → 핫스팟/효과 추가 → 임베드/공유

**기술**: 웹 기반 SaaS, Chrome Extension

---

### 1.3 Reprise

> 참고: https://www.reprise.com/

**개요**: 엔터프라이즈급 제품 데모 플랫폼. 실제 제품 환경을 복제하여 인터랙티브 데모/투어 생성.

**핵심 기능**:
- **제품 환경 복제**: 실제 제품의 데모 환경을 로그인 없이 탐색 가능
- **인터랙티브 투어**: 클릭 기반으로 사용자가 직접 제품 탐색
- **맞춤형 데모 버전**: 잠재 고객의 구매 단계에 따라 다른 데모 제공
- **자동화된 편집**: 플러그인 라이브러리를 통한 무제한 커스터마이징
- **데모 분석**: 사용자 참여도, 이탈 지점 등 분석 대시보드
- **노코드**: 개발 없이 GTM 팀이 직접 투어 생성/배포

**차별점**: 엔터프라이즈급 보안/규모. 실제 제품 환경 복제. 세일즈/마케팅 팀을 위한 분석 도구.

**UX 패턴**: 제품 캡처 → 데모 시나리오 구성 → 가이드 포인트 추가 → 배포 → 분석

**기술**: 웹 기반 SaaS, 커스텀 가격 (엔터프라이즈)

---

### 1.4 Loom

> 참고: https://www.loom.com/ / https://dev.loom.com/

**개요**: 비디오 메시징 플랫폼. 화면, 카메라, 마이크를 동시 녹화하여 빠른 비디오 커뮤니케이션.

**핵심 기능**:
- **녹화 모드**: Screen + Cam (버블 오버레이), Screen Only
- **카메라 버블**: 리사이즈/이동 가능한 웹캠 오버레이
- **일시정지/재시작**: 녹화 중 일시정지 및 처음부터 다시 시작
- **SDK (recordSDK)**: JavaScript 패키지로 서드파티 앱에 녹화 기능 임베드
  - ~20줄의 코드로 통합 가능
  - 모든 JS 프레임워크 호환
  - 게스트 녹화 5회까지 무료 (로그인 불필요)
- **자동 자막, 트리밍, 그리기 도구**

**차별점**: 개발자 SDK로 쉬운 통합. 비동기 커뮤니케이션에 최적화. Atlassian 생태계 통합.

**UX 패턴**: 원클릭 녹화 시작 → 녹화 → 자동 업로드 → 링크 공유

**기술**: 웹 기반 + Chrome Extension + 데스크톱 앱, SDK는 Chrome 전용

**제한사항**: 오픈 API 미제공. SDK는 Chrome 전용 (Incognito/모바일 미지원).

---

### 1.5 오픈소스 대안

#### demo-recorder (@neonwatty/demo-recorder)

> 참고: https://github.com/neonwatty/demo-recorder (아카이브됨, 2025-12)

**개요**: Playwright 기반 CLI 도구. 웹앱 데모 비디오/스크린샷 자동 생성. **우리 프로젝트와 가장 유사한 기존 도구**.

**핵심 기능**:
- TypeScript로 데모 정의 (`DemoDefinition` 객체)
- 시각 효과: 요소 하이라이팅 (빨간 테두리), **커서 애니메이션**, **줌 효과**, 스무스 스크롤
- 캐릭터별 타이핑 애니메이션
- 스크린샷: 포맷 선택 (PNG/JPEG/WebP), 전체 페이지, 스텝 번호 배지
- GIF 변환, 마크다운 문서 생성
- 모바일/데스크톱 뷰포트 프리셋

**기술 스택**: TypeScript, FFmpeg, Playwright, Vitest

**데모 정의 예시**:
```typescript
const demo: DemoDefinition = {
  id: 'my-feature',
  name: 'My Feature Demo',
  url: 'http://localhost:3000',
  run: async ({ page, wait, highlight }) => {
    await wait(1000);
    await highlight('button.start', 500);
    await page.click('button.start');
    await wait(2000);
  },
};
```

**CLI 명령어**: `demo-recorder create`, `demo-recorder record`, `demo-recorder screenshot`, `demo-recorder list`

**상태**: MIT 라이선스, 아카이브됨 (v1.7.0).

#### playwright-screen-recorder

> 참고: https://github.com/raymelon/playwright-screen-recorder

**개요**: puppeteer-screen-recorder의 Playwright 포트. Chrome DevTools Protocol을 통한 프레임 단위 비디오 캡처.

**핵심 기능**:
- Chrome DevTools Protocol `startScreencast` 사용
- MP4, AVI, MOV, WebM 포맷 지원
- FFmpeg 자동 관리
- 스트림 출력 (후처리용 writable/duplex stream)
- 새 탭 자동 추적

**설정 옵션**:
```javascript
{
  fps: 25,                    // 프레임 레이트
  ffmpeg_Path: null,          // FFmpeg 경로 (null이면 자동설치)
  videoFrame: { width: 1024, height: 768 },
  videoCrf: 18,               // 품질 (0-51, 낮을수록 고품질)
  videoCodec: 'libx264',      // 비디오 코덱
  videoPreset: 'ultrafast',   // 인코딩 속도
  videoBitrate: 1000,         // 비트레이트 (kbps)
  autopad: { color: 'black' },
  aspectRatio: '4:3',
  recordDurationLimit: 120    // 최대 녹화 시간 (초)
}
```

#### FocuSee / AutoZoom
- Screen Studio의 Windows 대안
- 자동 줌, 커서 효과 지원
- 크로스 플랫폼

---

### 유사 서비스 비교 매트릭스

| 기능 | Screen Studio | Arcade | Reprise | Loom | demo-recorder | 우리 목표 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| 자동 줌 | O | O | X | X | O (수동) | **O** |
| 커서 효과 | O | X | X | X | O | **O** |
| 인터랙티브 데모 | X | O | O | X | X | Future |
| 프로그래매틱 API | X | X | X | O (SDK) | O (CLI) | **O** |
| 오픈소스 | X | X | X | X | O (MIT) | **O** |
| 비디오 출력 | O | X | X | O | O | **O** |
| 스텝 기반 가이드 | X | O | O | X | X | Future |
| 배경 효과 | O | O | X | X | X | **O** |
| 분석 | X | O | O | O | X | Future |

---

## 2. Playwright 화면 녹화 기능 조사

### 2.1 page.video() API

Playwright의 Video 클래스는 `recordVideo` 옵션으로 브라우저 컨텍스트 생성 시 자동 생성됨.

**비디오 활성화**:
```typescript
// 라이브러리 사용 시
const context = await browser.newContext({
  recordVideo: { dir: 'videos/' }
});

// 크기 지정
const context = await browser.newContext({
  recordVideo: {
    dir: 'videos/',
    size: { width: 1280, height: 720 }
  }
});
```

**테스트 설정 시**:
```typescript
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: {
    video: {
      mode: 'on',           // 'off' | 'on' | 'retain-on-failure' | 'on-first-retry'
      size: { width: 640, height: 480 }
    }
  },
});
```

**Video 클래스 메서드**:
| 메서드 | 설명 | 추가 버전 |
|--------|------|-----------|
| `video.path()` | 비디오 파일 경로 반환 (리모트 연결 시 에러) | < v1.9 |
| `video.saveAs(path)` | 비디오를 지정 경로로 복사 (녹화 중/후 모두 안전) | v1.11 |
| `video.delete()` | 비디오 파일 삭제 (녹화 완료 대기) | v1.11 |

**중요 사항**:
- 비디오는 **브라우저 컨텍스트가 닫힐 때** 디스크에 기록됨
- 기본 포맷: **WebM** (VP8 코덱)
- 기본 크기: viewport가 있으면 viewport 크기를 800x800 내에 맞춤, 없으면 800x450
- 코덱/포맷 선택 옵션은 공개 API에 노출되지 않음 (WebM 고정)

### 2.2 page.screenshot() 옵션

```typescript
await page.screenshot({
  path: 'screenshot.png',        // 저장 경로
  type: 'png' | 'jpeg',          // 이미지 포맷
  quality: 80,                    // JPEG 품질 (0-100)
  fullPage: true,                 // 전체 스크롤 페이지 캡처
  clip: {                         // 특정 영역 잘라내기
    x: 0, y: 0,
    width: 300, height: 300
  },
  omitBackground: true,           // 투명 배경 (PNG만)
  animations: 'disabled',         // CSS 애니메이션 정지
  caret: 'hide',                  // 텍스트 커서 숨김 ('hide' | 'initial')
  scale: 'css',                   // 'css' | 'device' 픽셀 스케일
  mask: [                         // 마스킹할 요소 (핑크박스)
    page.locator('.sensitive')
  ],
  maskColor: '#FF00FF',           // 마스크 색상
  timeout: 30000                  // 타임아웃 (ms)
});
```

**요소 스크린샷**:
```typescript
await page.locator('.header').screenshot({ path: 'header.png' });
```

**버퍼 캡처** (파일 대신 메모리):
```typescript
const buffer = await page.screenshot(); // Buffer 반환
```

### 2.3 Playwright 트레이싱

트레이싱은 테스트 실행 중 상세한 실행 기록을 캡처.

**캡처 데이터**:
- 스크린샷/스크린캐스트 (필름 스트립)
- DOM 스냅샷 (Before / Action / After 3단계)
- 네트워크 요청/응답 (헤더, 본문 포함)
- 콘솔 로그 (브라우저/테스트 소스 구분)
- 액션 로그 (스크롤, 대기, 클릭 등)
- 소스 코드 매핑 (액션 → 소스 라인)
- 에러 정보 (타임라인 표시)
- 브라우저 메타데이터 (타입, 뷰포트, 지속시간)
- 첨부파일 (이미지 비교/오버레이)

**프로그래매틱 사용**:
```typescript
const context = await browser.newContext();
await context.tracing.start({ screenshots: true, snapshots: true });
// ... 액션 수행 ...
await context.tracing.stop({ path: 'trace.zip' });
```

**트레이스 뷰어**:
```bash
npx playwright show-trace trace.zip
# 또는 웹 뷰어: trace.playwright.dev (데이터 외부 전송 없음)
```

**트레이스 모드**: `'on'` | `'off'` | `'on-first-retry'` | `'on-all-retries'` | `'retain-on-failure'`

**우리 프로젝트 활용**: 트레이싱의 스크린캐스트/스냅샷 캡처 방식을 참고하여 프레임 단위 캡처 전략 수립.

### 2.4 Playwright MCP 서버

> 참고: https://github.com/microsoft/playwright-mcp

**개요**: Model Context Protocol 구현체. LLM이 브라우저를 자동화할 수 있는 MCP 서버.

**핵심 아키텍처**:
- 시각적 입력 대신 **접근성 트리(Accessibility Tree)**를 활용하여 빠르고 경량 인터랙션
- Vision 모델 없이도 결정론적 브라우저 제어 가능
- 요구사항: Node.js 18+

**능력 모드**:
| 모드 | 설명 |
|------|------|
| Core | 표준 브라우저 자동화 (내비게이션, 폼, 요소 검사) |
| PDF | 문서 생성/처리 |
| Vision | 좌표 기반 인터랙션 |
| DevTools | 개발자 도구 기능 |

**설정 옵션**:
- `--browser`: 브라우저 선택
- `--viewport-size`: 뷰포트 크기
- `--user-data-dir`: 사용자 데이터 디렉토리 (영속)
- `--storage-state`: 스토리지 상태 초기화
- `--isolated`: 격리 모드
- 트레이스, 비디오, 세션 출력 설정
- 프록시, CORS 허용리스트, 타임아웃 설정

**설치**:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

**우리 프로젝트와의 관계**: MCP 서버 구조를 참고하여 Playwright 기능을 외부에 노출하는 패턴 학습 가능. 향후 MCP 서버로 AI 에이전트 통합 시 참고.

### 2.5 커서 위치 추적

**Mouse 클래스** (`page.mouse`):

| 메서드 | 설명 | 옵션 |
|--------|------|------|
| `mouse.click(x, y, opts?)` | move + down + up 단축 | button, clickCount, delay |
| `mouse.dblclick(x, y, opts?)` | 더블클릭 (move→down→up→down→up) | button, delay |
| `mouse.down(opts?)` | mousedown 이벤트 | button, clickCount |
| `mouse.move(x, y, opts?)` | mousemove 이벤트 | **steps** (보간 이동 단계수, 기본 1) |
| `mouse.up(opts?)` | mouseup 이벤트 | button, clickCount |
| `mouse.wheel(deltaX, deltaY)` | 스크롤 이벤트 | - |

**좌표 체계**: 메인 프레임 CSS 픽셀, 뷰포트 좌상단 기준.

**커서 추적 3가지 전략**:

```typescript
// 전략 1: Playwright 액션 래핑 (권장)
const cursorPositions: Array<{x: number, y: number, timestamp: number, action: string}> = [];

async function trackedClick(page: Page, x: number, y: number) {
  cursorPositions.push({ x, y, timestamp: Date.now(), action: 'click' });
  await page.mouse.click(x, y);
}

async function trackedMove(page: Page, x: number, y: number, steps = 10) {
  cursorPositions.push({ x, y, timestamp: Date.now(), action: 'move' });
  await page.mouse.move(x, y, { steps });
}
```

```typescript
// 전략 2: CDP (Chrome DevTools Protocol) 직접 사용
const client = await page.context().newCDPSession(page);
await client.send('Input.dispatchMouseEvent', {
  type: 'mouseMoved', x: 100, y: 200
});
```

```typescript
// 전략 3: 페이지 내 JavaScript 이벤트 리스너 삽입
await page.evaluate(() => {
  (window as any).__cursorTrack = [];
  document.addEventListener('mousemove', (e) => {
    (window as any).__cursorTrack.push({
      x: e.clientX, y: e.clientY, t: Date.now()
    });
  });
});
// 나중에 데이터 수집
const positions = await page.evaluate(() => (window as any).__cursorTrack);
```

**권장**: 전략 1 (액션 래핑)을 기본으로, 필요시 전략 3으로 보충. 우리가 제어하는 액션만 추적하면 되므로 래핑이 가장 깔끔함.

### 2.6 비디오 코덱 및 설정

**Playwright 내장 녹화**:
| 항목 | 값 |
|------|-----|
| 포맷 | WebM |
| 코덱 | VP8 |
| 설정 가능 | size만 가능 |
| FPS | 내부 고정 (설정 불가) |
| 비트레이트 | 내부 고정 (설정 불가) |

**playwright-screen-recorder (서드파티, FFmpeg 기반)**:
| 항목 | 값 |
|------|-----|
| 지원 코덱 | libx264 (H.264), libvpx (VP8), libvpx-vp9 (VP9) |
| 지원 포맷 | MP4, WebM, AVI, MOV |
| FPS | 기본 25, 최대 60 설정 가능 |
| CRF (품질) | 0-51 (낮을수록 고품질, 권장 18) |
| 비트레이트 | kbps 단위 설정 |
| 인코딩 프리셋 | ultrafast, fast, medium, slow 등 |
| 스트림 출력 | writable/duplex stream으로 후처리 파이프라인 연결 |

**FFmpeg 비디오 후처리 가능성**:
- `zoompan` 필터: Ken Burns 효과 (줌+팬 애니메이션)
- `overlay` 필터: 커서 이미지 오버레이
- `drawtext` 필터: 자막/캡션
- `colorkey` / `chromakey`: 배경 교체
- `concat`: 여러 클립 결합

**권장 접근법**:
1. **기본**: 스크린샷 시퀀스를 FFmpeg로 비디오 합성 (프레임 단위 제어 가능)
2. **대안**: Playwright 내장 WebM + FFmpeg 후처리
3. **고급**: Canvas API로 실시간 프레임 합성 → FFmpeg 인코딩

---

## 3. 퍼블릭 배포 시 고려사항

### 3.1 npm 패키지 배포

**package.json 핵심 설정**:
```json
{
  "name": "tft-record",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "bin": {
    "tft-record": "./dist/cli.mjs"
  },
  "engines": {
    "node": ">=18"
  },
  "peerDependencies": {
    "playwright": ">=1.40.0"
  }
}
```

**ESM/CJS 듀얼 모듈 전략**:
- `tsup` 또는 `unbuild`로 듀얼 빌드
- `.mjs` / `.cjs` 확장자 명시
- 타입 정의 파일 공존 (`.d.ts` + `.d.cts`)
- `publint.dev`로 패키지 품질 검증
- Node.js v22+에서는 CJS에서 ESM `require()` 네이티브 지원

**빌드 도구 비교**:
| 도구 | 특징 | 적합한 경우 |
|------|------|-------------|
| **tsup** | TypeScript → JS 트랜스파일, CJS/ESM 동시 출력, 간단한 설정 | 가장 범용적, 권장 |
| unbuild | CJS 브릿지 자동 심, 제로 설정 지향 | 모노레포 |
| tshy | tsc 기반 빌드, package.json 자동 관리 | 가장 정확한 타입 |

### 3.2 라이선스 선택

| 라이선스 | 특징 | 적합한 경우 |
|----------|------|-------------|
| **MIT** | 가장 관대, 짧은 텍스트, 널리 사용 | 최대한 넓은 채택 원할 때 |
| Apache 2.0 | 특허 보호 포함, 기여자 라이선스 명시 | 엔터프라이즈 친화적 |
| ISC | MIT와 유사하지만 더 간결 | npm 기본 라이선스 |

**권장**: **MIT** - 오픈소스 개발자 도구에 가장 보편적이며 채택 장벽 최소화.

### 3.3 CI/CD 파이프라인 (GitHub Actions)

**자동화 테스트 워크플로우**:
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: |
            test-results/
            playwright-report/
```

**자동 배포 워크플로우**:
```yaml
name: Publish
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write     # npm provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**버전 관리 도구 비교**:
| 도구 | 특징 | 적합한 경우 |
|------|------|-------------|
| **changesets** | PR 기반 체인지로그 관리, 모노레포 친화 | 팀 협업, 모노레포 |
| semantic-release | 커밋 메시지 기반 자동 버저닝/배포 | CI/CD 완전 자동화 |
| release-it | 대화형 릴리즈 프로세스 | 수동 제어 선호 |

### 3.4 문서화 도구

| 도구 | 용도 | 장점 |
|------|------|------|
| **TypeDoc** | API 레퍼런스 자동 생성 | TSDoc 주석에서 자동 생성 |
| **VitePress** | 문서 사이트 | Vite 기반, 빠른 빌드, Vue 컴포넌트 지원 |
| **Starlight** | 문서 사이트 (Astro 기반) | 다국어, MDX, 빠른 빌드 |
| **README** | 기본 문서 | GitHub에서 바로 렌더링 |

**권장**: README 우선 → 성장 시 VitePress로 전용 문서 사이트 구축.

### 3.5 시맨틱 버저닝

**SemVer**: `MAJOR.MINOR.PATCH`
- **MAJOR** (X.0.0): 하위 호환 불가 변경
- **MINOR** (0.X.0): 하위 호환 새 기능
- **PATCH** (0.0.X): 하위 호환 버그 수정

**Conventional Commits 형식**:
```
feat: 새 기능 추가             → MINOR 버전 증가
fix: 버그 수정                 → PATCH 버전 증가
feat!: 또는 BREAKING CHANGE:   → MAJOR 버전 증가
chore: 빌드/CI 변경            → 버전 변경 없음
docs: 문서 변경                → 버전 변경 없음
refactor: 리팩토링             → 버전 변경 없음
test: 테스트 추가/수정          → 버전 변경 없음
```

**0.x.x 전략**: 초기 개발 중에는 0.x.x 사용, API 안정화 후 1.0.0 릴리즈.

### 3.6 보안 고려사항

| 항목 | 도구/방법 | 설명 |
|------|-----------|------|
| 의존성 감사 | `npm audit`, `socket.dev` | 공급망 공격 탐지 |
| npm 2FA | npm 계정 설정 | 퍼블리싱 시 2FA 필수 |
| Provenance | `--provenance` 플래그 | SLSA 빌드 출처 증명 |
| Lockfile | `package-lock.json` 커밋 | `npm ci` 사용 |
| 최소 권한 | npm 토큰 | 자동화에 필요한 최소 권한만 부여 |
| 자동 업데이트 | Dependabot / Renovate | 자동 의존성 업데이트 PR |
| 코드 서명 | npm provenance + GitHub Actions | 빌드-패키지 연결 투명성 |

---

## 4. 핵심 기능 추출 및 우선순위

### 4.1 Must-Have (MVP)

> 첫 릴리즈에 반드시 포함되어야 하는 기능

| # | 기능 | 설명 | 근거 |
|---|------|------|------|
| 1 | **Playwright 브라우저 녹화** | URL 접속 후 화면을 비디오로 녹화 | 핵심 가치 |
| 2 | **스크립트 기반 시나리오** | TypeScript/YAML로 녹화 시나리오 정의 | demo-recorder 패턴, 자동화 핵심 |
| 3 | **스크린샷 캡처** | 스텝별 스크린샷 자동/수동 캡처 | 문서/튜토리얼 생성에 필수 |
| 4 | **커서 위치 추적** | 마우스 이동/클릭 위치 기록 | 후처리 효과의 기반 데이터 |
| 5 | **기본 비디오 출력** | WebM/MP4 포맷 비디오 저장 | Playwright + FFmpeg 활용 |
| 6 | **CLI 인터페이스** | `tft-record run <script>` 형태 | 사용자 진입점 |
| 7 | **설정 파일** | 뷰포트, FPS, 출력 경로 등 설정 | 커스터마이징 |
| 8 | **자동 줌 효과** | 클릭/타이핑 시 해당 영역 줌인 | Screen Studio 핵심, 최대 차별점 |
| 9 | **커서 스무딩** | 불규칙한 마우스 이동 보정 | Screen Studio 핵심 기능 |

### 4.2 Nice-to-Have

> MVP 이후 가능한 빠르게 추가할 기능

| # | 기능 | 설명 | 근거 |
|---|------|------|------|
| 10 | **커서 하이라이팅** | 클릭 시 시각적 피드백 (링, 확대) | 가시성 향상 |
| 11 | **배경 효과** | 그라데이션, 이미지, 창 프레임 | 프로페셔널 룩 |
| 12 | **GIF 출력** | 비디오 → 최적화 GIF 변환 | 문서/슬랙 공유 |
| 13 | **요소 하이라이팅** | 특정 DOM 요소에 시각적 강조 (테두리, 오버레이) | demo-recorder 참조 |
| 14 | **타이핑 애니메이션** | 캐릭터별 입력 애니메이션 | 데모 가독성 |
| 15 | **뷰포트 프리셋** | 모바일/태블릿/데스크톱 프리셋 (iPhone, iPad 등) | 반응형 데모 |
| 16 | **디바이스 프레임** | 브라우저/디바이스 프레임 씌우기 | 프로페셔널 룩 |
| 17 | **워터마크** | 커스텀 로고/텍스트 워터마크 | 브랜딩 |
| 18 | **트랜지션 효과** | 스텝 간 부드러운 전환 | UX 향상 |

### 4.3 Future

> 장기적으로 추가할 고급 기능

| # | 기능 | 설명 | 근거 |
|---|------|------|------|
| 19 | **인터랙티브 HTML 데모** | 클릭 가능한 인터랙티브 데모 출력 | Arcade/Reprise 패턴 |
| 20 | **보이스오버/내레이션** | TTS 기반 자동 내레이션 | Arcade 참조 |
| 21 | **조건 분기** | 사용자 선택에 따른 다른 데모 경로 | Arcade 참조 |
| 22 | **분석 대시보드** | 데모 조회수, 이탈 지점 등 | Reprise 참조 |
| 23 | **웹캠 오버레이** | 발표자 얼굴 버블 | Loom 참조 |
| 24 | **MCP 서버** | AI 에이전트와의 통합 | Playwright MCP 참조 |
| 25 | **스텝 내비게이션 UI** | 이전/다음 스텝 컨트롤 | Arcade 참조 |
| 26 | **자동 자막** | 음성 → 텍스트 자막 | Screen Studio/Loom 참조 |
| 27 | **마크다운 문서 생성** | 스크린샷 + 설명 자동 문서화 | demo-recorder 참조 |
| 28 | **플러그인 시스템** | 커스텀 이펙트/출력 포맷 플러그인 | 확장성 |
| 29 | **웹 기반 미리보기** | 녹화 결과 실시간 프리뷰 | UX 향상 |

---

## 5. 테스트 전략

### 5.1 테스트 피라미드

```
        /   E2E   \          ← 소수의 핵심 흐름 (CLI → 비디오 출력)
       / Integration \        ← Playwright 실제 브라우저 테스트
      /   Unit Tests   \      ← 다수의 순수 함수/모듈 테스트
```

### 5.2 유닛 테스트 (Vitest)

**대상**: 순수 함수, 유틸리티, 설정 파서, 이펙트 계산 로직, 스크립트 파서/검증

**도구**: Vitest (빠른 실행, ESM 네이티브, TypeScript 지원, HMR)

```typescript
// 예: 커서 스무딩 로직 유닛 테스트
import { describe, it, expect } from 'vitest';
import { smoothCursorPath } from '../src/effects/cursor';

describe('smoothCursorPath', () => {
  it('should interpolate between two points', () => {
    const points = [
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 100, t: 1000 }
    ];
    const smoothed = smoothCursorPath(points, { steps: 10 });
    expect(smoothed).toHaveLength(10);
    expect(smoothed[0]).toEqual({ x: 0, y: 0, t: 0 });
    expect(smoothed[9]).toEqual({ x: 100, y: 100, t: 1000 });
  });
});
```

**Playwright 모킹 패턴**:
```typescript
import { vi } from 'vitest';

const mockPage = {
  mouse: {
    move: vi.fn(),
    click: vi.fn(),
  },
  screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
  video: vi.fn().mockReturnValue({
    path: vi.fn().mockResolvedValue('/tmp/video.webm'),
    saveAs: vi.fn(),
  }),
  evaluate: vi.fn(),
  goto: vi.fn(),
  locator: vi.fn().mockReturnValue({
    boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 100, height: 50 }),
    screenshot: vi.fn(),
  }),
};
```

**커버리지 목표**:
| 모듈 | 목표 |
|------|------|
| 유틸리티/순수 함수 | 90%+ |
| 이펙트 계산 로직 | 80%+ |
| 스크립트 파서/검증 | 80%+ |
| CLI 파서 | 80%+ |

### 5.3 통합 테스트 (Playwright 실제 브라우저)

**대상**: 녹화 파이프라인, 스크린샷 캡처, 이펙트 적용 결과

```typescript
import { test, expect } from '@playwright/test';
import { Recorder } from '../src';
import { existsSync, statSync } from 'fs';

test('should record a video of a page', async ({ browser }) => {
  const recorder = new Recorder({ outputDir: './test-output' });
  const video = await recorder.record({
    url: 'https://example.com',
    steps: async ({ page }) => {
      await page.click('a');
      await page.waitForLoadState();
    }
  });

  expect(existsSync(video.path)).toBe(true);
  expect(statSync(video.path).size).toBeGreaterThan(0);
});
```

**테스트 서버**: 테스트용 정적 HTML 페이지를 로컬 서버로 제공하여 외부 의존성 제거.

```typescript
// tests/fixtures/server.ts
import { createServer } from 'http';
import { readFileSync } from 'fs';

export function startTestServer(port = 3333) {
  return createServer((req, res) => {
    const html = readFileSync(`./tests/fixtures/pages${req.url}.html`, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }).listen(port);
}
```

### 5.4 시각적 회귀 테스트

**도구**: Playwright 내장 `toHaveScreenshot()` + 커스텀 비교

```typescript
test('zoom effect should focus on clicked element', async ({ page }) => {
  // ... 줌 효과 적용 후 ...
  await expect(page).toHaveScreenshot('zoom-effect.png', {
    maxDiffPixelRatio: 0.01,  // 1% 허용
    threshold: 0.2,            // 픽셀당 색차 허용
  });
});
```

**전략**:
- 핵심 이펙트(줌, 커서 하이라이트, 배경)에 대한 시각적 스냅샷 테스트
- `animations: 'disabled'` 옵션으로 CSS 애니메이션 불확실성 제거
- CI에서 안정적인 결과를 위해 Docker 컨테이너 사용 (일관된 렌더링)
- 플랫폼별(Linux/macOS) 스냅샷 분리 관리
- `mask` 옵션으로 동적 콘텐츠 (시간, 날짜 등) 마스킹

**비디오 출력 검증**:
```typescript
import { execSync } from 'child_process';

test('output video should have correct properties', () => {
  // ffprobe로 비디오 속성 검증
  const result = execSync(
    'ffprobe -v quiet -print_format json -show_streams output.mp4'
  ).toString();
  const info = JSON.parse(result);
  const video = info.streams[0];

  expect(video.codec_name).toBe('h264');
  expect(parseInt(video.width)).toBe(1920);
  expect(parseInt(video.height)).toBe(1080);
  expect(parseFloat(video.duration)).toBeGreaterThan(3);
});
```

### 5.5 E2E 테스트

**대상**: CLI 전체 워크플로우 (스크립트 실행 → 비디오 출력 → 파일 검증)

```typescript
import { execSync } from 'child_process';
import { existsSync } from 'fs';

test('CLI should record and produce video from script', () => {
  execSync('npx tft-record run ./fixtures/demo.ts --output ./test-output/');
  expect(existsSync('./test-output/demo.webm')).toBe(true);
});

test('CLI should produce screenshots from script', () => {
  execSync('npx tft-record screenshot ./fixtures/demo.ts --output ./test-output/');
  expect(existsSync('./test-output/step-001.png')).toBe(true);
});
```

### 5.6 CI 환경 구성

```yaml
name: Tests
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:unit

  integration:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:integration
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/

  e2e:
    runs-on: ubuntu-latest
    needs: integration
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: sudo apt-get install -y ffmpeg
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results/
```

### 5.7 테스트 인프라 요약

| 레이어 | 도구 | 대상 | 실행 환경 |
|--------|------|------|-----------|
| Unit | Vitest | 순수 함수, 유틸리티, 파서 | Node.js |
| Integration | Playwright Test | 녹화, 스크린샷, 이펙트 | Chromium (headless) |
| Visual | Playwright Screenshot | UI 이펙트 시각적 검증 | Chromium (headless) |
| Video | ffprobe + assertions | 출력 비디오 속성 검증 | Node.js + FFmpeg |
| E2E | Vitest + child_process | CLI 전체 워크플로우 | Node.js + Chromium + FFmpeg |
| CI | GitHub Actions | 전체 테스트 스위트 | Ubuntu |

### 5.8 플레이키 테스트 방지 전략

- **고정 시드**: 랜덤 데이터 사용 시 시드 고정
- **waitForLoadState**: 페이지 로딩 완료 대기
- **networkidle**: 네트워크 요청 완료 대기
- **retries**: CI에서 1-2회 재시도 허용 (`retries: process.env.CI ? 2 : 0`)
- **isolation**: 각 테스트가 독립적인 브라우저 컨텍스트 사용
- **타임아웃**: 적절한 타임아웃 설정 (너무 짧지 않게)
- **Docker**: CI에서 일관된 환경을 위해 Docker 사용 검토

---

## 부록: 참고 자료

### 유사 서비스
- Screen Studio: https://screen.studio/
- Arcade: https://www.arcade.software/
- Reprise: https://www.reprise.com/
- Loom SDK: https://dev.loom.com/
- demo-recorder: https://github.com/neonwatty/demo-recorder
- playwright-screen-recorder: https://github.com/raymelon/playwright-screen-recorder
- FocuSee/AutoZoom: https://autozoom.video/
- Cursorful: https://cursorful.com/

### Playwright 공식 문서
- Video API: https://playwright.dev/docs/api/class-video
- Videos 가이드: https://playwright.dev/docs/videos
- Screenshots: https://playwright.dev/docs/screenshots
- Tracing: https://playwright.dev/docs/trace-viewer
- Mouse API: https://playwright.dev/docs/api/class-mouse
- Playwright MCP: https://github.com/microsoft/playwright-mcp

### 배포 관련
- npm 패키지 발행: https://nodejs.org/en/learn/modules/publishing-a-package
- ESM/CJS 듀얼 모듈: https://antfu.me/posts/publish-esm-and-cjs
- publint: https://publint.dev/
- Conventional Commits: https://conventionalcommits.org/
- Semantic Versioning: https://semver.org/

### 테스트 관련
- Vitest: https://vitest.dev/
- Playwright Test: https://playwright.dev/docs/test-intro
- Visual Comparisons: https://playwright.dev/docs/test-snapshots
