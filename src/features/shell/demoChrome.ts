// The demo's banner and welcome share these: kept apart from the components so Fast Refresh can reload them.

/** The banner's height in pixels; the app shell's header grows by this much while the demo runs. */
export const DEMO_BANNER_HEIGHT = 36;

/** "mxsalata.com" for "https://mxsalata.com/": the home link names the site it goes back to. */
export function homeLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Where the demo's welcome keeps its dismissal, on this device. */
export const DEMO_WELCOME_KEY = 'aperture.demo-welcome.v1';

/** True once the welcome has been closed on this device (or when storage is refused, so it never nags). */
export function welcomeSeen(): boolean {
  try {
    return window.localStorage.getItem(DEMO_WELCOME_KEY) !== null;
  } catch {
    return true;
  }
}

export function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(DEMO_WELCOME_KEY, new Date().toISOString());
  } catch {
    // Storage refused: the window closes for this visit only
  }
}
