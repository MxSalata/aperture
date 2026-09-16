import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/spotlight/styles.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useDemo } from './stores/demo';

async function bootstrap() {
  // Demo mode: start the in-browser mock of the SysAdmin API before rendering,
  // so the very first request already hits the service worker.
  if (useDemo.getState().enabled) {
    try {
      await useDemo.getState().enable();
    } catch (e) {
      console.error('Failed to start demo mode', e);
    }
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
