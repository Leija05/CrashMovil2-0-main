import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AppSettings = {
  developerMode: boolean;
  deviceName: string; // Name pattern to match (e.g., "HC-05", "HC-10", "CRASH")
  // actions
  setDeveloperMode: (v: boolean) => Promise<void>;
  setDeviceName: (v: string) => Promise<void>;
  alertsConfigVersion: number;
  notifyAlertsConfigChanged: () => void;
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
  alertsConfigVersion: 0,
  notifyAlertsConfigChanged: () => {},
  ready: false,
});

export const useAppSettings = () => useContext(AppSettingsContext);

const STORAGE_KEY = 'crash.appSettings.v1';

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [developerMode, setDevMode] = useState(DEFAULTS.developerMode);
  const [deviceName, setDevName] = useState(DEFAULTS.deviceName);
  const [ready, setReady] = useState(false);
  const [alertsConfigVersion, setAlertsConfigVersion] = useState(0);

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

  const notifyAlertsConfigChanged = useCallback(() => {
    setAlertsConfigVersion((v) => v + 1);
  }, []);

  return (
    <AppSettingsContext.Provider
      value={{ developerMode, deviceName, setDeveloperMode, setDeviceName, alertsConfigVersion, notifyAlertsConfigChanged, ready }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}
