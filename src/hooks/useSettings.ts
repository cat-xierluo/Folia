import { useEffect, useState } from 'react';
import {
  getSettings,
  SETTINGS_CHANGED_EVENT,
  type AppSettings,
} from '../services/settingsService';

export function useSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  useEffect(() => {
    const refresh = () => setSettings(getSettings());
    window.addEventListener(SETTINGS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return settings;
}
