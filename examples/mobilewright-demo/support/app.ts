import type { Page } from '@playwright/test';

/** Minimum hold time (ms) the demo app treats as a long press. */
export const LONG_PRESS_MS = 500;

/**
 * A tiny self-contained onboarding "app" rendered in the emulated mobile browser,
 * so the demo runs without a real device or network access.
 */
const ONBOARDING_HTML = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: sans-serif; margin: 16px; }
      #carousel { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; width: 300px; }
      #carousel section { min-width: 300px; height: 120px; scroll-snap-align: start; background: #eef; }
      button { margin-top: 16px; padding: 12px 24px; font-size: 18px; }
    </style>
  </head>
  <body>
    <h1>Welcome to Mobile App</h1>
    <div id="carousel" aria-label="carousel_onboarding" data-testid="view_carousel">
      <section>Card 1</section>
      <section>Card 2</section>
      <section>Card 3</section>
    </div>
    <button id="get-started" data-testid="btn_get_started">Get Started</button>
    <p role="status" id="status"></p>
    <div role="dialog" aria-label="sheet_login" data-testid="sheet_login" hidden>Log in to continue</div>
    <script>
      const button = document.getElementById('get-started');
      const status = document.getElementById('status');
      let pressedAt = 0;
      button.addEventListener('pointerdown', () => { pressedAt = Date.now(); });
      button.addEventListener('pointerup', () => {
        if (Date.now() - pressedAt >= ${LONG_PRESS_MS}) status.textContent = 'long-press';
      });
      button.addEventListener('click', () => {
        document.querySelector('[role=dialog]').hidden = false;
      });
    </script>
  </body>
</html>`;

/** "Launch" the demo app in the current (mobile-emulated) page. */
export async function launchApp(page: Page): Promise<void> {
  await page.setContent(ONBOARDING_HTML);
}
