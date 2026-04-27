import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AppSettings = {
  developerMode: boolean;
  deviceName: string; // Name pattern to match (e.g., "HC-05", "HC-10", "CRASH")
  // actions
  setDeveloperMode: (v: boolean) => Promise<void>;
  setDeviceName: (v: string) => Promise<void>;
  ready: boolean;
};

const DEFAULTS = {
  developerMode: false,
  deviceName: 'HC-05',
};

const AppSettingsContext = createContext<AppSettings>({
  ...DEFAULTS,
  setDeveloperMode: async () => {},
  setDeviceName: async () => {},
  ready: false,
});

export const useAppSettings = () => useContext(AppSettingsContext);

const STORAGE_KEY = 'crash.appSettings.v1';

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [developerMode, setDevMode] = useState(DEFAULTS.developerMode);
  const [deviceName, setDevName] = useState(DEFAULTS.deviceName);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setDevMode(!!parsed.developerMode);
          setDevName(parsed.deviceName || DEFAULTS.deviceName);
        }
      } catch (e) {
        console.warn('Failed to load app settings', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = async (next: { developerMode: boolean; deviceName: string }) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const setDeveloperMode = useCallback(async (v: boolean) => {
    setDevMode(v);
    await persist({ developerMode: v, deviceName });
  }, [deviceName]);

  const setDeviceName = useCallback(async (v: string) => {
    setDevName(v);
    await persist({ developerMode, deviceName: v });
  }, [developerMode]);

  return (
    <AppSettingsContext.Provider
      value={{ developerMode, deviceName, setDeveloperMode, setDeviceName, ready }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}
