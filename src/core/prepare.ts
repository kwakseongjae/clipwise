import { readFile } from "fs/promises";
import type { BrowserContext } from "playwright";
import type { PrepareConfig, MockRoute } from "../script/types.js";

/**
 * Prepare — 녹화 브라우저에만 적용되는 런타임 주입.
 *
 * 모든 주입은 BrowserContext 레벨에 등록되어 컨텍스트의 모든 페이지와
 * 모든 네비게이션에 적용된다. 사용자의 소스·빌드·DB는 건드리지 않는다.
 *
 * 빌더 함수들(build*)은 순수 함수로 분리되어 단위 테스트 대상이며,
 * applyPrepare()가 파일 IO와 Playwright 등록을 담당한다.
 */

/** hide 셀렉터 목록 → 주입할 CSS 텍스트. */
export function buildHideCss(selectors: string[]): string {
  return `${selectors.join(",\n")} {\n  display: none !important;\n  visibility: hidden !important;\n}`;
}

/**
 * mask 셀렉터 목록 → 블러 CSS.
 * 합성 단계의 박스 블러와 달리 요소에 직접 적용되므로 스크롤·리스트 재정렬을
 * 자동으로 따라간다 — 셀렉터를 아는 도구만이 가능한 방식.
 */
export function buildMaskCss(selectors: string[]): string {
  return `${selectors.join(",\n")} {\n  filter: blur(10px) !important;\n  border-radius: 4px;\n}`;
}

/**
 * CSS 텍스트 → init script.
 * document_start 시점에는 head가 없을 수 있으므로 readyState에 따라
 * DOMContentLoaded까지 지연한다. 모든 네비게이션에서 재적용된다.
 */
export function buildCssInjectionScript(css: string): string {
  return `(() => {
  const apply = () => {
    const style = document.createElement("style");
    style.setAttribute("data-clipwise", "prepare");
    style.textContent = ${JSON.stringify(css)};
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();`;
}

/**
 * Date를 고정 시각으로 동결하는 init script.
 * - `new Date()` (인자 없음) → 고정 시각
 * - `Date.now()` → 고정 시각
 * - 인자 있는 생성, Date.parse/UTC는 원본 동작 유지
 */
export function buildFreezeTimeScript(epochMs: number): string {
  return `(() => {
  const frozen = ${epochMs};
  const OrigDate = Date;
  class FrozenDate extends OrigDate {
    constructor(...args) {
      if (args.length === 0) { super(frozen); } else { super(...args); }
    }
    static now() { return frozen; }
  }
  FrozenDate.parse = OrigDate.parse;
  FrozenDate.UTC = OrigDate.UTC;
  Object.defineProperty(globalThis, "Date", { value: FrozenDate, writable: true, configurable: true });
})();`;
}

/**
 * Math.random을 mulberry32 PRNG로 대체하는 init script.
 * 동일 시드 → 모든 페이지 로드에서 동일 난수열 (결정론적 데모 데이터).
 */
export function buildSeedRandomScript(seed: number): string {
  return `(() => {
  let s = (${seed}) >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;
}

/**
 * localStorage/sessionStorage 시드 init script.
 * 페이지 스크립트 실행 전에 적용되므로 앱은 시드된 상태로 부팅된다.
 * opaque origin(about:blank 등)에서는 접근이 throw하므로 무시한다.
 */
export function buildStorageScript(storage: {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}): string {
  return `(() => {
  try {
    const seed = ${JSON.stringify(storage)};
    for (const [k, v] of Object.entries(seed.localStorage)) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(seed.sessionStorage)) sessionStorage.setItem(k, v);
  } catch { /* opaque origin — storage unavailable */ }
})();`;
}

/** mock 항목의 응답 본문을 결정한다 (fixture 파일 또는 인라인 body). */
async function resolveMockBody(route: MockRoute): Promise<string> {
  if (route.fixture) {
    return readFile(route.fixture, "utf-8");
  }
  if (route.body !== undefined) {
    return typeof route.body === "string" ? route.body : JSON.stringify(route.body);
  }
  throw new Error(`prepare.mock "${route.url}": either "fixture" or "body" is required`);
}

/**
 * PrepareConfig를 브라우저 컨텍스트에 적용한다.
 * recorder.init()에서 페이지 생성 전에 호출되어야 모든 페이지에 적용된다.
 */
export async function applyPrepare(
  context: BrowserContext,
  prepare: PrepareConfig,
): Promise<void> {
  // 1. 시간 동결 — 다른 init script보다 먼저 (앱 부팅 전 적용 보장)
  if (prepare.freezeTime) {
    const epochMs = Date.parse(prepare.freezeTime);
    if (Number.isNaN(epochMs)) {
      throw new Error(`prepare.freezeTime: invalid date "${prepare.freezeTime}" (use ISO 8601, e.g. "2026-06-10T09:00:00Z")`);
    }
    await context.addInitScript(buildFreezeTimeScript(epochMs));
  }

  // 2. 랜덤 시드
  if (prepare.seedRandom !== undefined) {
    await context.addInitScript(buildSeedRandomScript(prepare.seedRandom));
  }

  // 3. 스토리지 시드
  if (prepare.storage) {
    await context.addInitScript(buildStorageScript(prepare.storage));
  }

  // 4. 요소 숨김 + 커스텀 CSS — 하나의 스타일 주입으로 합침
  const cssChunks: string[] = [];
  if (prepare.hide.length > 0) {
    cssChunks.push(buildHideCss(prepare.hide));
  }
  if (prepare.mask.length > 0) {
    cssChunks.push(buildMaskCss(prepare.mask));
  }
  if (prepare.inject?.css) {
    const cssFiles = Array.isArray(prepare.inject.css) ? prepare.inject.css : [prepare.inject.css];
    for (const file of cssFiles) {
      cssChunks.push(await readFile(file, "utf-8"));
    }
  }
  if (cssChunks.length > 0) {
    await context.addInitScript(buildCssInjectionScript(cssChunks.join("\n\n")));
  }

  // 5. 커스텀 JS
  if (prepare.inject?.js) {
    const jsFiles = Array.isArray(prepare.inject.js) ? prepare.inject.js : [prepare.inject.js];
    for (const file of jsFiles) {
      await context.addInitScript(await readFile(file, "utf-8"));
    }
  }

  // 6. 네트워크 목 — 픽스처는 적용 시점에 1회 로드 (녹화 중 파일 IO 없음)
  for (const mock of prepare.mock) {
    const body = await resolveMockBody(mock);
    await context.route(
      (url) => url.href.includes(mock.url),
      (route) => route.fulfill({ status: mock.status, contentType: mock.contentType, body }),
    );
  }
}
