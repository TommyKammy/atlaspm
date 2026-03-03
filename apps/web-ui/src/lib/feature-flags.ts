'use client';

import { useEffect, useState } from 'react';

const TIMELINE_OVERRIDE_KEY = 'atlaspm:feature:timeline';

function readTimelineOverride(): boolean | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(TIMELINE_OVERRIDE_KEY);
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'enabled') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'disabled') return false;
  return null;
}

export const timelineEnabledByEnv = process.env.NEXT_PUBLIC_TIMELINE_ENABLED === 'true';

export function computeTimelineEnabled(): boolean {
  if (timelineEnabledByEnv) return true;
  return readTimelineOverride() === true;
}

export function useTimelineEnabled(): { timelineEnabled: boolean; timelineFlagHydrated: boolean } {
  const [timelineEnabled, setTimelineEnabled] = useState(timelineEnabledByEnv);
  const [timelineFlagHydrated, setTimelineFlagHydrated] = useState(false);

  useEffect(() => {
    const refresh = () => setTimelineEnabled(computeTimelineEnabled());
    refresh();
    setTimelineFlagHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== TIMELINE_OVERRIDE_KEY) return;
      refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { timelineEnabled, timelineFlagHydrated };
}
