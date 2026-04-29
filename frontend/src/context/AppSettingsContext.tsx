import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AppSettings = {
  developerMode: boolean;
  deviceName: string; // Name pattern to match (e.g., "HC-05", "HC-10", "CRASH")
  alertCountdownSeconds: number;
  // actions
  setDeveloperMode: (v: boolean) => Promise<void>;
  setDeviceName: (v: string) => Promise<void>;
  setAlertCountdownSeconds: (v: number) => Promise<void>;
  ready: boolean;
};

const DEFAULTS = {
  developerMode: false,
  deviceName: 'HC-05',
  alertCountdownSeconds: 10,
};

const AppSettingsContext = createContext<AppSettings>({
  ...DEFAULTS,
  setDeveloperMode: async () => {},
  setDeviceName: async () => {},
  setAlertCountdownSeconds: async () => {},
  ready: false,
});

export const useAppSettings = () => useContext(AppSettingsContext);

const STORAGE_KEY = 'crash.appSettings.v1';

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [developerMode, setDevMode] = useState(DEFAULTS.developerMode);
  const [deviceName, setDevName] = useState(DEFAULTS.deviceName);
  const [alertCountdownSeconds, setAlertCountdown] = useState(DEFAULTS.alertCountdownSeconds);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setDevMode(!!parsed.developerMode);
          setDevName(parsed.deviceName || DEFAULTS.deviceName);
          setAlertCountdown(Number.isFinite(parsed.alertCountdownSeconds) ? parsed.alertCountdownSeconds : DEFAULTS.alertCountdownSeconds);
        }
      } catch (e) {
        console.warn('Failed to load app settings', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = async (next: { developerMode: boolean; deviceName: string; alertCountdownSeconds: number }) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const setDeveloperMode = useCallback(async (v: boolean) => {
    setDevMode(v);
    await persist({ developerMode: v, deviceName, alertCountdownSeconds });
  }, [deviceName, alertCountdownSeconds]);

  const setDeviceName = useCallback(async (v: string) => {
    setDevName(v);
    await persist({ developerMode, deviceName: v, alertCountdownSeconds });
  }, [developerMode, alertCountdownSeconds]);

  const setAlertCountdownSeconds = useCallback(async (v: number) => {
    const next = Math.max(0, Math.min(60, Math.floor(v)));
    setAlertCountdown(next);
    await persist({ developerMode, deviceName, alertCountdownSeconds: next });
  }, [developerMode, deviceName]);

  return (
    <AppSettingsContext.Provider
      value={{ developerMode, deviceName, alertCountdownSeconds, setDeveloperMode, setDeviceName, setAlertCountdownSeconds, ready }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}
