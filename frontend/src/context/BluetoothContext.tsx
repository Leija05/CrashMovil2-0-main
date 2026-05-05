import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bluetoothService, TelemetryData, ScanDevice, BluetoothStatus } from '../services/bluetooth';

type BluetoothCtx = {
  status: BluetoothStatus;
  statusDetail?: string;
  connected: boolean;
  device: ScanDevice | null;
  telemetry: TelemetryData | null;
  nativeAvailable: boolean;
  bluetoothEnabled: boolean;
  savedDeviceName?: string;
  setSavedDeviceName: (name: string) => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  startDeviceScan: (onFound: (d: ScanDevice) => void) => Promise<void>;
  connect: (id: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

const BluetoothContext = createContext<BluetoothCtx>({} as any);
const LAST_DEVICE_KEY = 'crash.lastDevice.v1';
const SAVED_DEVICE_NAME_KEY = 'crash.savedDeviceName.v1';
export const useBluetooth = () => useContext(BluetoothContext);

export function BluetoothProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BluetoothStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<ScanDevice | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [savedDeviceName, setSavedDeviceNameState] = useState<string>('');
  const nativeAvailable = bluetoothService.isNativeAvailable();

  useEffect(() => {
    const bootstrap = async () => {
      const isEnabled = await bluetoothService.isBluetoothEnabled().catch(() => false);
      setBluetoothEnabled(isEnabled);
      const storedName = await AsyncStorage.getItem(SAVED_DEVICE_NAME_KEY);
      if (storedName) setSavedDeviceNameState(storedName);
      const lastDeviceId = await AsyncStorage.getItem(LAST_DEVICE_KEY);
      if (lastDeviceId && nativeAvailable) {
        await bluetoothService.connectToDevice(lastDeviceId);
      }
    };
    bootstrap();

    const unsubT = bluetoothService.onTelemetry(setTelemetry);
    const unsubS = bluetoothService.onStatus((s, detail) => {
      setStatus(s); setStatusDetail(detail);
      setConnected(bluetoothService.isConnected());
    });
    const unsubD = bluetoothService.onDeviceChange(async (next) => {
      setDevice(next);
      if (next?.id) await AsyncStorage.setItem(LAST_DEVICE_KEY, next.id);
    });
    return () => { unsubT(); unsubS(); unsubD(); };
  }, []);

  const requestPermissions = useCallback(() => bluetoothService.requestPermissions(), []);
  const startDeviceScan = useCallback(async (onFound: (d: ScanDevice) => void) => {
    await bluetoothService.startDeviceScan((dev) => {
      onFound({
        id: device?.id || dev.id, address: dev.id, name: dev.name || dev.localName || 'Desconocido',
        isCompatible: true, moduleType: 'HC-05 BLE', connected: false
      });
    });
  }, []);

  const connect = useCallback(async (id: string) => {
    const ok = await bluetoothService.connectToDevice(id);
    if (ok) await AsyncStorage.setItem(LAST_DEVICE_KEY, id);
    return ok;
  }, []);
  const setSavedDeviceName = useCallback(async (name: string) => {
    setSavedDeviceNameState(name);
    await AsyncStorage.setItem(SAVED_DEVICE_NAME_KEY, name);
  }, []);
  const disconnect = useCallback(() => bluetoothService.disconnect(), []);

  return (
    <BluetoothContext.Provider value={{
      status, statusDetail, connected, device, telemetry, nativeAvailable, bluetoothEnabled,
      savedDeviceName, setSavedDeviceName,
      requestPermissions, startDeviceScan, connect, disconnect,
    }}>
      {children}
    </BluetoothContext.Provider>
  );
}