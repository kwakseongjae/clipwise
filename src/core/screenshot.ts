import type { Page } from "playwright";

export interface ScreenshotOptions {
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  quality?: number;
}

/**
 * Capture a screenshot of the current page state.
 */
export async function captureScreenshot(
  page: Page,
  options?: ScreenshotOptions,
): Promise<Buffer> {
  const screenshotOptions: Parameters<Page["screenshot"]>[0] = {
    type: "png",
  };

  if (options?.fullPage) {
    screenshotOptions.fullPage = true;
  }

  if (options?.clip) {
    screenshotOptions.clip = options.clip;
  }

  // PNG doesn't support quality, only apply for jpeg
  // We use PNG for lossless frame capture
  const buffer = await page.screenshot(screenshotOptions);
  return Buffer.from(buffer);
}

/**
 * Get the center coordinates of an element on the page.
 * Throws if the element is not found or not visible.
 */
export async function getElementCenter(
  page: Page,
  selector: string,
): Promise<{ x: number; y: number }> {
  if (!/^[\w\-#.\[\]="':\s,>+~*()@^$|]+$/.test(selector)) {
    throw new Error(`Invalid selector: ${selector}`);
  }

  const element = page.locator(selector).first();
  await element.waitFor({ state: "visible", timeout: 5000 });
  const box = await element.boundingBox();

  if (!box) {
    throw new Error(
      `Element "${selector}" not found or has no bounding box`,
    );
  }

  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}
