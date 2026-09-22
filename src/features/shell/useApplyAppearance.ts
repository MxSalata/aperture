import { useEffect, useState } from 'react';
import { useAppearance } from '@/stores/appearance';

const QUERY = '(prefers-contrast: more)';

function systemPrefersMore(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** The contrast actually in effect: the explicit setting, or the OS preference when set to auto. */
export function useResolvedContrast(): 'normal' | 'high' {
  const setting = useAppearance((s) => s.contrast);
  const [system, setSystem] = useState(systemPrefersMore);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return setting === 'auto' ? (system ? 'high' : 'normal') : setting;
}

/**
 * Writes the resolved contrast to `<html data-aperture-contrast>`, the sibling of Mantine's
 * `data-mantine-color-scheme`, which `styles.css` keys its high-contrast layer on. Mounted
 * above the router so the login page and error screens are covered too.
 */
export function useApplyAppearance(): 'normal' | 'high' {
  const contrast = useResolvedContrast();
  useEffect(() => {
    document.documentElement.dataset.apertureContrast = contrast;
  }, [contrast]);
  return contrast;
}
