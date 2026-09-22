import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

export async function startMockWorker() {
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}

/** Stop intercepting in this tab and unregister the worker so it cannot come back after a reload. */
export async function stopMockWorker() {
  worker.stop();
  const registration = await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL);
  await registration?.unregister();
}
