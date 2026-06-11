# 설계: Introduce 파이프라인 — 코드베이스 → 소개 영상 자동화

> 2026-06-10 · v0.7.2 기준 · 프로젝트 방향성 설계 문서

## 1. 비전

**"개발자는 기능 개발에 집중하고, Clipwise가 최상의 소개 영상을 만든다."**

Anthropic이 신기능을 출시할 때 공개하는 introduce 영상처럼 — 타이틀 타이포그래피로
시작해, 실제 제품 화면을 시네마틱하게 보여주고, 핵심 포인트를 콜아웃으로 강조한 뒤,
로고 아웃트로로 마무리되는 30~60초 영상을 — 사용자의 코드베이스로부터 자동으로
생성하는 것이 목표다.

설계 제약 두 가지:

1. **최소 침습** — 사용자의 코드를 최소한으로(이상적으로는 전혀) 건드리지 않는다.
2. **최상의 결과물** — "동작하는 영상"이 아니라 "공개해도 부끄럽지 않은 영상"을
   기본값으로 만든다.

## 2. 현재 상태 진단 (v0.7.2)

### 이미 달성한 것 — 원래 목표 1 (Screen Studio류 자동 기록)

| 능력 | 구현 | 수준 |
|------|------|------|
| 시네마틱 줌 | spring easing, zone-aware merge, focus interpolation (`src/effects/zoom.ts`) | Screen Studio급 |
| 커서 연출 | Bezier + Chaikin 스무딩, trail, ripple, highlight (`src/core/cursor-tracker.ts`) | Screen Studio급 |
| 대기 압축 | smartWait + smartSpeed, CDP 로더 자동 감지 | 차별화 포인트 |
| 키스트로크 HUD | 멀티세션, CJK 줄바꿈 | 충분 |
| 인코딩 | HEVC 10-bit HW, AV1 SCM, preset 체계 | 충분 |
| 성능 | 동시 스트리밍 파이프라인, 워커 병렬, 23ms/frame | 충분 |

중요한 통찰: Clipwise는 "실제 사용자 입력을 기록"하는 대신 **Playwright 시나리오를
재현**한다. 이는 원래 목표 1의 타협처럼 보였지만, 새 비전에서는 오히려 결정적
강점이다 — 재현 가능(deterministic)하고, 사람 없이 CI에서 돌릴 수 있으며,
에이전트가 반복 수정할 수 있다. Screen Studio는 사람이 매번 직접 시연해야 하지만
Clipwise는 한 번 시나리오가 만들어지면 버전마다 다시 찍을 수 있다.

### 미달성 — 원래 목표 2 (Remotion류 HTML 기반 영상)

인트로 타이틀 카드, 피처 콜아웃, 텍스트 애니메이션, 로고 아웃트로 같은
**모션그래픽 신(scene)이 없다.** Anthropic introduce 영상의 구조를 분해하면:

```
[타이틀 타이포 인] → [제품 화면 데모 (줌/팬)] → [텍스트 콜아웃] → [로고 아웃트로]
```

가운데(제품 화면 데모)는 이미 세계급인데, 양 끝의 북엔드와 콜아웃 레이어가 없어서
"잘 찍은 화면 녹화"에서 "소개 영상"으로 넘어가지 못한다.

### 비전 대비 3대 격차

1. **스토리 격차** — 무엇을 보여줄지 결정하는 주체가 없다. 시나리오 YAML은 여전히
   사람(또는 사람이 지휘하는 AI)이 작성한다. "코드베이스 → 스토리"가 비어 있다.
2. **표현 격차** — 화면 녹화 신만 있고 모션그래픽 신이 없다 (위 참조).
3. **품질 보증 격차** — 결과물을 보고 고치는 루프가 없다. 셀렉터 실패, 어색한
   타이밍, 잘린 요소는 사람이 영상을 보고 발견한다. "최상의 결과물"을 보장하는
   메커니즘이 도구 안에 없다.

## 3. 설계: 3-레이어 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 3 · Director (에이전트)                      v1.0      │
│   repo 분석 → 스토리보드 → 시나리오 생성 → self-review 루프  │
│   배포: Claude Code skill / MCP — Clipwise에 LLM 내장 안 함  │
├─────────────────────────────────────────────────────────────┤
│ Layer 2 · Scene System                            v0.9      │
│   screen scene(기존 steps) + motion scene(HTML 템플릿)       │
│   + callout 오버레이를 타임라인으로 합성                     │
├─────────────────────────────────────────────────────────────┤
│ Layer 1 · Capture & Compose 엔진                  현재      │
│   CDP 녹화 · Sharp 합성 · 이펙트 파이프라인 · ffmpeg 인코딩  │
└─────────────────────────────────────────────────────────────┘
```

핵심 원칙: **두뇌는 사용자의 에이전트(Claude Code), 손발과 검증 도구는 Clipwise.**
Clipwise 자체에 LLM API 호출을 내장하지 않는다. 이미 검증된 skill 배포 인프라
(`npx clipwise install-skill`)가 있고, 이 분리가 최소 침습 원칙과도 합치한다 —
Clipwise는 결정론적 CLI 도구로 남고, 지능은 에이전트 레이어에 둔다.

## 4. Layer 2 — Scene System (v0.9)

### 4.1 핵심 결정: Remotion과 경쟁하지 않고 흡수한다

Remotion의 본질은 React가 아니라 **"프레임별 deterministic 렌더"**다:
headless 브라우저에서 시간 `t`를 주입하고 그 시점의 화면을 스크린샷으로 떠서
프레임을 쌓는다. Clipwise는 이미 이 파이프라인의 모든 구성요소를 갖고 있다 —
Playwright 브라우저, `screenshot.ts`, png-sequence 경로, Sharp 합성, ffmpeg 인코딩.

빠진 것은 **시간 주입**뿐이다:

```typescript
// motion scene 캡처 루프 (의사코드)
for (let frame = 0; frame < totalFrames; frame++) {
  const t = (frame / fps) * 1000;
  await page.evaluate((t) => window.__clipwiseSeek(t), t);
  frames.push(await page.screenshot({ type: "png" }));
}
```

`__clipwiseSeek(t)`는 Web Animations API로 구현한다:

```javascript
window.__clipwiseSeek = (t) => {
  document.getAnimations().forEach((a) => { a.currentTime = t; a.pause(); });
};
```

CSS `@keyframes`와 WAAPI 애니메이션은 모두 `document.getAnimations()`로 잡히므로,
**모션 템플릿을 CSS/WAAPI만으로 작성한다는 규약**을 지키면 rAF 하이재킹 같은
복잡한 기법 없이 완전한 결정론을 얻는다. 템플릿은 우리가 만들므로 이 규약은
통제 가능하다. (이전에 "기술력 부족"으로 막혔던 지점의 정공법이 바로 이것이다 —
실시간 screencast로 애니메이션을 찍으려 하면 프레임 드랍과 비결정성에 부딪히지만,
프레임별 seek 방식은 그 문제 자체가 없다. Remotion도 정확히 이 방식이다.)

실시간성이 없으므로 CDP screencast 경로(`recorder.ts`)와 분리된 별도 캡처 경로로
구현한다. 60fps도 가능해진다 (screencast는 실질 30fps 한계).

### 4.2 YAML 확장: `scenes`

기존 `steps`는 그대로 두고(하위 호환), 상위 개념으로 `scenes`를 도입한다:

```yaml
name: "Clipwise v0.8 Introduce"
brand:                              # .clipwise/brand.yaml에서 로드 가능
  logo: ./assets/logo.svg
  primaryColor: "#6366f1"
  font: "Pretendard"

scenes:
  - type: motion                    # ① 타이틀 카드
    template: intro-title
    duration: 2500
    props:
      title: "Smart Speed"
      subtitle: "로딩은 빠르게, 콘텐츠는 또렷하게"

  - type: screen                    # ② 제품 데모 — 기존 steps 그대로
    transition: fade
    steps:
      - name: "대시보드 열기"
        actions:
          - action: navigate
            url: "http://localhost:3000"
    callouts:                       # ③ 데모 위 오버레이 콜아웃
      - text: "로딩 구간 4× 자동 압축"
        anchor: ".spinner"          # 셀렉터 기준 위치 (또는 position: top-right)
        at: 3000                    # 신 내 상대 시각 ms
        duration: 2000

  - type: motion                    # ④ 아웃트로
    template: outro-logo
    duration: 2000
    props:
      tagline: "npx clipwise demo"
```

- **motion scene**: 내장 HTML 템플릿 + props → 프레임별 seek 캡처. 커스텀 HTML
  파일 경로도 허용 (`template: ./my-intro.html`).
- **screen scene**: 기존 steps 의미론 그대로. 기존 이펙트 파이프라인 전부 적용.
- **callout**: screen scene 위에 얹는 오버레이 레이어. 구현은 기존
  `OverlayDescriptor` 패턴 재사용 — keystroke HUD와 동일 계층에서 Sharp 배치
  합성에 합류하므로 새 합성 경로가 필요 없다.
- **타임라인 합성**: 신별로 프레임 스트림을 생성한 뒤 이어붙인다. 신 경계 전환은
  기존 `transition.ts`(fade/blur/slide) 재사용. ffmpeg concat이 아니라 프레임
  스트림 차원에서 잇는 것이 기존 스트리밍 파이프라인과 자연스럽게 맞물린다.

### 4.3 내장 템플릿 팩 (v0.9 — 3종으로 시작)

| 템플릿 | 구성 | 참고 스타일 |
|--------|------|------------|
| `intro-title` | 타이틀/서브타이틀 staggered fade-up, 브랜드 컬러 악센트 | Anthropic 발표 영상 |
| `outro-logo` | 로고 스케일 인 + 태그라인(설치 커맨드) | 〃 |
| `feature-callout` | 풀스크린 텍스트 브릿지 (신 사이 챕터 구분) | Linear 릴리스 영상 |

미니멀 타이포 + 충분한 여백 + 브랜드 컬러 1개 — 템플릿이 단순할수록 props
주입만으로 "그 회사 영상"처럼 보인다. 브랜드 토큰(`brand:`)이 모든 템플릿에
관통되는 것이 품질의 핵심이다.

### 4.4 Brand Kit — 톤앤매너와 카피의 단일 설정 표면

> 사용자가 init 때 한 번 정의하면, 이후 모든 영상이 "그 회사 영상"으로 나온다.

`.clipwise/brand.yaml` (v0.8에서 스캐폴딩 선행 구현):

```yaml
product: "Pulse"
tone: midnight            # 톤앤매너 프리셋 (아래 3종)
accent: "#6366f1"
tagline: "Revenue intelligence for SaaS teams"
catchphrases:             # 자주 쓰는 한 줄 문구 — 템플릿 카피의 기본값
  intro: "Introducing Smart Reports"
  introSub: "..."
  outro: "Pulse"
  outroSub: "pulse.io/start"
chapters:                 # introduce 챕터 카드 카피
  - { num: "01", title: "...", desc: "..." }
```

**톤앤매너 프리셋 3종** — 각 프리셋은 모션 템플릿의 디자인 토큰(배경, 전경,
글로우 강도, 타이포 웨이트)과 스크린 신의 배경 그라데이션·브라우저 크롬
다크모드까지 영상 전체를 관통한다:

| tone | 미감 | 용도 |
|------|------|------|
| `midnight` | 딥블랙 + 소프트 글로우, 화이트 타이포 | 발표/키노트 영상 (기본) |
| `daylight` | 라이트 에디토리얼, 다크 타이포 | 문서·블로그 임베드 |
| `neon` | 딥퍼플 + 그라데이션 타이포, 강한 글로우 | 런치 하이프 영상 |

**폰트 프리셋** (`font:`) — 런치 영상 타이포 관행 조사에 근거한 3종:

| font | 구성 | 근거 |
|------|------|------|
| `editorial` (기본) | Inter + Instrument Serif 이탤릭 강조 + JetBrains Mono | Inter는 SaaS 표준(Google Fonts 연 4,140억 요청), Instrument Serif는 Tiempos 무드의 무료 대체 |
| `grotesk` | Space Grotesk 디스플레이 + Inter | 테크 런치 무드 |
| `system` | 시스템 스택 | 네트워크 불필요 폴백 |

한글은 모든 프리셋에서 Pretendard로 폴백한다. 캡처 전 `document.fonts.ready`를
대기하므로 웹폰트도 결정론을 깨지 않는다.

**선 드로잉 강조** (`annotations:`) — "갑자기 선이 그어지는" 키네틱 주석 레이어.
SVG `pathLength=1` + `stroke-dashoffset` CSS 키프레임으로 구현되어 seek 캡처와
호환된다:

| 종류 | 위치 | 구현 |
|------|------|------|
| underline | 키네틱 타이포 강조 단어 밑 | 손그림 곡선 path 드로잉 |
| marker | 강조 단어 뒤 | 형광펜 스와이프 (scaleX) |
| circle | 푸티지 위 UI 요소 | 오버슈트 타원 + 미세 회전, 좌표는 `boundingBox()` 실측 |
| arrow | 푸티지 위 | 곡선 path + 지연 드로잉 화살촉 |

circle/arrow는 비네트의 `.pusher`(푸시인 레이어) 안에 부착되어 카메라 워크를
푸티지와 함께 타므로 대상 픽셀에 정확히 앵커링된다.

설계 원칙:

1. **톤은 enum, 토큰은 내부** — 사용자는 `tone: midnight` 한 줄만 고르고,
   색·간격·웨이트 토큰 조합은 우리가 큐레이션한다. 자유 커스텀(임의 CSS)은
   커스텀 템플릿 경로로 열어두되 1급 표면은 프리셋이다. 선택지가 적을수록
   결과물의 하한이 높다.
2. **카피는 데이터** — 캐치프레이즈가 brand.yaml에 있으므로 영상 문구 수정에
   템플릿/코드 수정이 필요 없고, Director(에이전트)가 Discover 단계에서
   캐치프레이즈 후보를 생성해 이 파일에 제안하는 흐름과 자연스럽게 잇닿는다.
3. **검증 가능** — tone 토큰 적용·3종 변별성·캡처 결정론은 스코어카드
   M 카테고리가 회귀 감시한다.

### 4.5 Composite Scene — 푸티지를 레이어로 (Keynote 문법)

Anthropic introduce 영상의 문법을 분해하면 4가지다: ① 변하지 않는 아이보리
무대(하드컷이 한 장면처럼 이어짐), ② **푸티지는 풀블리드가 아니라 무대 위에
떠 있는 카드 레이어**이고 카메라(푸시인·크롭·팬)는 후반 합성이 담당, ③ 짧은
선언문의 키네틱 타이포 인터스티셜, ④ 캡션이 푸티지와 공존하는 2~5초 비네트
호흡. (팔레트 근거: Anthropic 브랜드 — ink `#141413`, ivory `#faf9f5`,
악센트 `#d97757` 계열, Styrene 그로테스크 + Tiempos 세리프 혼용)

이를 자체 기술로 구현하는 것이 **Composite Scene**이다 (프로토타입:
`scripts/make-keynote.ts` + `scripts/motion-templates/keynote/`):

1. 데모를 1회 녹화하고 커서 이펙트만 입힌 "클린 푸티지"(줌·프레임·배경 없음)
   프레임을 로컬 HTTP로 서빙한다 — 카메라 워크를 엔진 줌이 아니라 합성
   레이어에 맡기기 위해.
2. 비네트 템플릿(HTML)이 푸티지를 `<img>` 레이어로 임베드한다. 크롭은
   `overflow:hidden` + transform, 푸시인은 CSS 키프레임, 분할·캡션·레이블은
   일반 레이아웃 — **HTML/CSS의 전체 표현력이 곧 합성 엔진**이 된다.
3. `__clipwiseSeek(t)`가 CSS 애니메이션과 푸티지 프레임 인덱스를 동시에
   구동한다(배속 `rate`, 시작 오프셋 `start` 지원) — 완전 결정론 유지.
4. **anchor 자동 산출**: 녹화 메타데이터(`session.frames[].stepIndex`)에서
   각 step이 시작되는 푸티지 초를 계산해, 비네트가 "타이핑 구간", "결과 리빌
   구간"을 좌표 추측 없이 정확히 인용한다. 크롭 좌표도 Playwright
   `boundingBox()`로 실측한다.

한 번의 녹화를 여러 비네트가 서로 다른 구간·영역·배속으로 인용하므로,
"포맷이 단조롭다"는 문제가 구조적으로 해소된다 — 같은 푸티지로 히어로 푸시인,
패널 클로즈업, 분할 화면을 모두 만든다. v0.9 Scene System의 `scenes` YAML은
이 문법(vignette/kinetic 신 타입 + crop/push/rate 속성)을 선언형으로 노출하는
것이 목표다.

### 4.6 래핑 철학 — 렌더러가 아니라 성격을 판다

명시적으로 기록한다: **Clipwise는 Remotion/Hyperframes 등 외부 영상
프레임워크를 사용하지 않는다.** 모션 신은 자체 HTML/CSS 템플릿 +
`__clipwiseSeek` 프레임 캡처 + 기존 인코딩 파이프라인으로 만들어지며,
외부 의존성은 playwright/sharp/ffmpeg/gifenc뿐이다 (버전 고정 이슈 없음).

다만 원칙은 렌더러 독립적이다 — 설령 미래에 특정 신 타입을 위해 외부
렌더러를 쓰게 되더라도, 사용자에게 노출되는 표면은 항상 우리의 것이어야
한다: `tone:` 프리셋, `brand.yaml`, scenes YAML. Compose 2.5가 Kimi를
래핑하고도 자기 제품 경험으로 사랑받듯, 가치는 기반 기술이 아니라
**큐레이션된 표면(설정 한 줄 → 일관된 결과물)**에서 나온다. 렌더러는
교체 가능한 구현 세부사항으로 남긴다.

## 5. Layer 3 — Director (v0.10–v1.0)

### 5.1 파이프라인: `clipwise introduce`

에이전트(skill)가 지휘하는 4단계 루프:

```
① Discover ──→ ② Probe ──→ ③ Storyboard ──→ ④ Draft & Review ──┐
                   ↑                                            │
                   └────────── 수정 (셀렉터/타이밍/스토리) ←─────┘
                                                      → 최종 렌더
```

**① Discover — 무엇을 소개할 것인가.**
`git diff <since-tag>`, CHANGELOG, README, 라우트/컴포넌트 구조를 읽어 신기능
후보와 그 가치를 파악한다. 전부 read-only — 사용자 코드를 건드리지 않는다.
진입점: `/clipwise introduce --since v0.7.1` (skill), 또는 자연어 "이번 릴리스
소개 영상 만들어줘".

**② Probe — 화면의 사실 확인.**
에이전트가 셀렉터를 추측으로 쓰는 것이 현재 시나리오 실패의 1순위 원인이다.
엔진에 `clipwise probe <url>` 명령을 추가해, Playwright로 페이지를 열고
인터랙터블 요소 맵을 JSON으로 반환한다:

```json
{
  "elements": [
    { "selector": "[data-testid=submit]", "role": "button", "text": "분석 시작",
      "confidence": "high", "visible": true, "rect": {...} }
  ]
}
```

confidence는 `data-testid > #id > [name] > .class+text` 순. 에이전트는 추측이
아니라 이 사실 목록 위에서 시나리오를 쓴다.

**③ Storyboard — 스토리 아크.**
skill에 스토리 프레임을 내장한다: `Hook(타이틀 2–3s) → Context(문제/이전 모습,
선택) → Demo(기능 시연 15–40s) → Callout(핵심 가치 1–3개) → CTA(아웃트로 2s)`.
산출물은 scenes YAML 하나.

**④ Draft & Self-review — "최상의 결과물"의 메커니즘.**
엔진에 드래프트 모드를 추가한다:

```bash
clipwise record scenario.yaml --draft
# → 0.5× 해상도 · 10fps · 이펙트 간소화로 빠르게 렌더
# → output/draft-contact-sheet.png  (키프레임 격자 1장)
```

에이전트는 콘택트 시트 1장을 vision으로 검토한다 — 셀렉터가 빗나갔는지, 요소가
잘렸는지, 줌이 과한지, 텍스트가 읽히는 길이인지. 문제를 찾으면 YAML을 고치고
다시 드래프트. 통과하면 최종 고품질 렌더. **사람이 영상을 보고 고치던 루프를
에이전트가 도구 안에서 수행**하는 것이 품질 보증 격차의 해소책이다.
(프레임 수십 장이 아니라 콘택트 시트 1장으로 제한해 토큰 비용을 통제한다.)

### 5.2 엔진에 추가할 에이전트-친화 기능 (v0.10)

| 기능 | 설명 |
|------|------|
| `clipwise probe <url>` | 인터랙터블 요소/셀렉터 맵 JSON |
| `clipwise validate --against <url>` | 시나리오 셀렉터를 실제 페이지에 dry-run 검사 |
| `clipwise record --draft` | 저해상도 드래프트 + 콘택트 시트 |
| 구조화된 에러 | 셀렉터 실패 시 유사 후보 제안 포함 JSON 에러 |
| dev server 감지 | 일반 포트(3000/5173/8080 등) 스캔 → URL 자동 제안 |

이 기능들은 에이전트 없이 사람에게도 그대로 유용하다 — 좋은 에이전트 도구는
좋은 CLI 도구라는 원칙을 유지한다.

### 5.3 배포 형태의 진화

1. **v1.0 — Claude Code skill 확장**: 기존 `skills/clipwise.md`에 introduce
   워크플로(① ~ ④)를 추가. 인프라 변경 없음.
2. **v1.1+ — MCP 서버 검토**: probe/draft/record를 MCP tool로 노출하면 Claude
   Code 외 에이전트(Cursor 등)도 사용 가능. skill로 워크플로가 검증된 뒤 진행.
3. **그 이후 — CI 통합**: release tag push → GitHub Action이 introduce 영상
   초안을 생성해 PR/Release에 첨부. "Anthropic처럼"의 완성형.

## 6. Layer 1 개선 — Zero-Footprint 계약과 Prepare 시스템

### 6.1 현재 footprint 진단 (v0.7.2 사실 기반)

Layer 1은 "외부 브라우저에서 녹화"하지만, 실제로는 사용자 저장소 곳곳에 흔적을
남기고, 더 나쁘게는 **사용자가 앱 코드를 수정하도록 압력**을 만든다:

**직접 흔적:**

| 흔적 | 출처 |
|------|------|
| `clipwise.yaml` (repo 루트) | `clipwise init` (`src/cli/index.ts:264`) |
| `./output/` (repo 루트) | 기본 outputDir |
| `package.json` + node_modules 변경 | README의 `npm install -D clipwise` 권장 |
| `.claude/skills/clipwise.md` | `install-skill` |

**간접 압력 (더 심각함 — 사용자가 앱 코드를 고치게 되는 원인):**

1. 안정적인 셀렉터가 없음 → `data-testid` 추가 유혹
2. dev 오버레이(Next.js 인디케이터, Vite HMR 뱃지), 쿠키 배너, 온보딩 모달이
   영상에 찍힘 → 조건부 숨김 코드 추가
3. 비결정적 데이터(실 API, 빈 DB, 현재 날짜, 랜덤) → 데모 모드/시드 코드 추가
4. 데모용 상태(로그인됨, 온보딩 완료) 만들기 → 테스트 전용 분기 추가

### 6.2 Zero-Footprint 계약

> **모든 흔적은 `.clipwise/` 디렉토리 하나에 담는다.
> `rm -rf .clipwise` 한 줄로 의존이 깨끗하게 사라진다.**

```
.clipwise/
  config.yaml         # brand(로고·컬러·폰트), output 기본값
  scenarios/          # 시나리오 YAML (커밋 → 릴리스마다 재촬영)
  prepare/            # 녹화 시 주입할 CSS/JS
  fixtures/           # 네트워크 목(mock) 응답 JSON
  auth/               # storageState (gitignore)
  output/             # 결과물 (gitignore)
  cache/              # 드래프트, 콘택트 시트 등 임시물 (gitignore)
  .gitignore          # init이 자동 생성 (auth/ output/ cache/)
```

이를 위한 엔진 변경:

- `clipwise init` — 루트 `clipwise.yaml` 대신 `.clipwise/` 스캐폴딩 생성
- 기본 outputDir — `./output` → `.clipwise/output`
- 설치 — README 권장을 `npm install -D` 에서 `npx clipwise@latest` 로 전환.
  package.json을 건드리지 않으며, devDependency 없이 동작 보장
- 경로 해석 — 시나리오 내 상대 경로(`fixture:`, `inject:`, `storageState:`)는
  `.clipwise/` 기준으로 해석
- **예외 1개를 명시** — `.claude/skills/clipwise.md` 는 에이전트 생태계 컨벤션상
  `.clipwise/` 밖에 둘 수밖에 없다. `install-skill` 이 설치 위치를 출력하고,
  `install-skill --remove` 로 대칭적인 제거 경로를 제공한다

### 6.3 Prepare 시스템 — 코드 수정 압력을 런타임 주입으로 대체

핵심 아이디어: 사용자가 앱 코드를 고치게 되는 4대 원인을 전부 **녹화 브라우저에만
적용되는 스크립트 주입**으로 흡수한다. 소스·빌드·배포는 무접촉이고, 주입 자산은
전부 `.clipwise/` 안에 산다.

| 코드 수정 압력 | Prepare 해법 | Playwright 메커니즘 |
|----------------|--------------|---------------------|
| dev 오버레이·쿠키 배너·HMR 뱃지 | `hide:` 셀렉터 목록 | `addStyleTag` (display:none) |
| 비결정 데이터 (실 API, 빈 DB) | `mock:` 네트워크 픽스처 | `page.route` 응답 대체 |
| 날짜·시간·랜덤 | `freezeTime:`, `seedRandom:` | `addInitScript` (Date/Math.random 스텁) |
| 데모 상태 (로그인, 온보딩 완료) | `storage:` 시드 + 기존 `auth:` | `addInitScript` + storageState |
| 그 외 모든 것 | `inject:` 임의 CSS/JS | `addStyleTag` / `addInitScript` |

YAML 표면:

```yaml
prepare:
  hide:
    - "#cookie-banner"
    - "[data-nextjs-toast]"          # Next.js dev 인디케이터
  freezeTime: "2026-06-10T09:00:00Z" # Date가 항상 이 시각
  seedRandom: 42                     # Math.random 결정론화
  storage:
    localStorage:
      onboarding_done: "true"
  mock:
    - url: "/api/dashboard/stats"    # 부분 문자열 매칭 (waitForResponse와 동일)
      fixture: ./fixtures/stats.json
  inject:
    css: ./prepare/demo.css
    js: ./prepare/demo.js
```

`mock:` 이 특히 중요하다 — **사용자 DB를 시드하지 않고도** 데모 데이터를
결정론적으로 보여줄 수 있어, "데모 모드를 앱에 구현"하는 가장 큰 코드 수정
압력을 제거한다. 픽스처 JSON은 Director(에이전트)가 Probe 단계에서 실제 응답을
캡처해 다듬어 생성할 수도 있다 (`clipwise probe --capture-fixtures`).

`data-testid` 압력은 Prepare가 아니라 probe의 셀렉터 전략으로 해소한다 —
role/text 기반(`getByRole` 의미론) 셀렉터를 1급으로 지원하면 코드에 식별자를
추가할 이유가 사라진다.

### 6.4 최소 침습 3원칙 (요약)

1. **코드 수정 0** — 분석은 read-only, 녹화 환경 조작은 전부 런타임 주입(Prepare).
   SDK, 코드 계측, 빌드 훅, DB 시드 없음.
2. **단일 설정 표면** — `.clipwise/` 하나. 삭제 한 번으로 의존 제거.
   (명시된 예외: `.claude/skills/` 스킬 파일 — 대칭적 제거 명령 제공)
3. **권장하되 강제하지 않는 컨벤션** — `data-testid`가 있으면 probe confidence가
   올라가지만, 없어도 role/text 기반으로 동작한다.

## 7. 로드맵

| 버전 | 테마 | 핵심 산출물 |
|------|------|------------|
| **v0.8** | Zero-Footprint & Prepare | `.clipwise/` 계약(init 재설계, 기본 경로 이전, npx 권장 전환), `prepare:` 시스템(hide/mock/freezeTime/storage/inject), `install-skill --remove` |
| **v0.9** | Scene System | deterministic motion 캡처(`__clipwiseSeek`), `scenes` YAML, 템플릿 3종, callout 오버레이, 프레임 스트림 타임라인 합성 |
| **v0.10** | Agent-Ready Engine | `probe`(+`--capture-fixtures`), `--draft` + 콘택트 시트, `validate --against`, 구조화 에러 |
| **v1.0** | Director | skill introduce 워크플로 (Discover→Probe→Storyboard→Draft&Review) |
| v1.1+ | 확장 | MCP 서버, CI 통합(GitHub Action), 레코더 스트리밍화(장편 테이크) |

**내레이션(TTS) — 보류 (2026-06-11 결정)**: 무료 TTS(macOS `say` 등)는 품질이
기준 미달이라 채택하지 않는다. 추후 **BYOK**(사용자 API 키 — OpenAI/ElevenLabs 등)로
지원하되, 엔진은 변경 불필요: TTS 어댑터가 `audio.file`(음성)과
`captions`(단어 타이밍)를 생성해 기존 프리미티브에 꽂는 구조. whisper.cpp 자동
전사도 같은 이유로 우선순위 하향(선언형 captions로 에이전트 경로는 이미 충족).

Zero-Footprint를 첫 마일스톤으로 두는 이유: 구현 위험이 가장 낮으면서 모든 후속
레이어의 기반(경로 계약, 픽스처 디렉토리, brand 설정 위치)이 되고, 기존 사용자
경험도 즉시 개선되기 때문이다. 각 버전은 독립적으로 출시 가치를 가진다 —
v0.8만으로 "내 repo를 더럽히지 않는 데모 도구"가 되고, v0.9로 인트로/아웃트로
있는 소개 영상이, v0.10으로 에이전트 신뢰성이, v1.0에서 비전이 완성된다.

## 8. 리스크와 대응

| 리스크 | 대응 |
|--------|------|
| rAF 기반 JS 애니메이션은 seek 불가 | 내장 템플릿은 CSS/WAAPI만 사용 규약. 커스텀 HTML은 문서로 규약 안내 |
| 사용자 앱의 상태 의존성 (빈 DB, 권한) | storageState 패턴과 동일한 옵트인 문서화. probe가 빈 화면을 감지해 경고 |
| self-review 토큰 비용 | 콘택트 시트 1장으로 제한, 드래프트는 10fps·0.5× |
| screencast(가변 타이밍)와 seek 캡처(고정 타이밍)의 프레임 정합 | 신 경계에서만 합류하므로 신 내부 타이밍 체계가 섞이지 않음 — scenes 설계가 이를 구조적으로 보장 |
| 템플릿 미감의 주관성 | 템플릿 수를 늘리기보다 brand 토큰 주입 품질에 집중. 레퍼런스(Anthropic, Linear) 기준 시각 회귀 테스트 |

## 9. 결론

원래 비전의 두 축 — Screen Studio류 자동 기록(목표 1)과 Remotion류 HTML 영상
(목표 2) — 중 목표 1은 v0.7.2에서 이미 상용 수준에 도달했다. 목표 2는 "Remotion을
만들겠다"가 아니라 "프레임별 seek 캡처"라는 핵심 기법 하나를 기존 파이프라인에
이식하는 문제로 축소되었고, 이는 현재 코드베이스(screenshot 경로, Sharp 합성,
스트리밍 인코딩)로 충분히 구현 가능하다.

그 위에 Director 레이어(에이전트 skill + probe/draft 도구)를 얹으면, "개발자는
기능 개발에 집중하고 Clipwise가 소개 영상을 만든다"는 비전이 — 사용자 코드를
한 줄도 건드리지 않고, 결과물을 스스로 검토하는 루프와 함께 — 완성된다.
