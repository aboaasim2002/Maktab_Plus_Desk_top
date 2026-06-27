'use client';

import { useEffect, useState } from 'react';
import { defaultOfficeSettings, OfficeSettings } from './office-settings';

export default function useOfficeSettings(): OfficeSettings {
  const [settings, setSettings] = useState(defaultOfficeSettings);

  useEffect(() => {
    let active = true;

    const loadSettings = () => {
      fetch('/api/settings')
        .then((response) => response.json())
        .then((data: OfficeSettings) => {
          if (active) setSettings({ ...defaultOfficeSettings, ...data });
        })
        .catch(() => undefined);
    };

    loadSettings();
    window.addEventListener('office-settings-updated', loadSettings);

    return () => {
      active = false;
      window.removeEventListener('office-settings-updated', loadSettings);
    };
  }, []);

  return settings;
}

