import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { bluetoothService, TelemetryData, ScanDevice, BluetoothStatus } from '../services/bluetooth';
import AsyncStorage from '@react-native-async-storage/async-storage';

type BluetoothCtx = {
  status: BluetoothStatus;
  statusDetail?: string;
  connected: boolean;
  device: ScanDevice | null;
  deviceName: string;
  telemetry: TelemetryData | null;
  nativeAvailable: boolean;
  bluetoothEnabled: boolean;
  requestPermissions: () => Promise<boolean>;
  startDeviceScan: (onFound: (d: ScanDevice) => void) => Promise<void>;
  connect: (id: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

const LAST_DEVICE_KEY = 'crash.lastDevice.v1';
const DEVICE_ALIAS_KEY = 'crash.deviceAlias.v1';

const BluetoothContext = createContext<BluetoothCtx>({} as any);
export const useBluetooth = () => useContext(BluetoothContext);

export function BluetoothProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BluetoothStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<ScanDevice | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [bluetoothEnabled] = useState(false);
  const [deviceName, setDeviceName] = useState('Sin dispositivo');
  const nativeAvailable = bluetoothService.isNativeAvailable();

  useEffect(() => {
    const unsubT = bluetoothService.onTelemetry(setTelemetry);
    const unsubS = bluetoothService.onStatus((s, detail) => {
      setStatus(s); setStatusDetail(detail);
      setConnected(bluetoothService.isConnected());
    });
    const unsubD = bluetoothService.onDeviceChange(setDevice);
    return () => { unsubT(); unsubS(); unsubD(); };
  }, []);

  useEffect(() => {
    (async () => {
      const lastDeviceId = await AsyncStorage.getItem(LAST_DEVICE_KEY);
      const alias = await AsyncStorage.getItem(DEVICE_ALIAS_KEY);
      if (alias) setDeviceName(alias);
      if (lastDeviceId) {
        await bluetoothService.reconnectToLastDevice(lastDeviceId);
      }
    })();
  }, []);

  const requestPermissions = useCallback(() => bluetoothService.requestPermissions(), []);
  const startDeviceScan = useCallback(async (onFound: (d: ScanDevice) => void) => {
    await bluetoothService.startDeviceScan((dev) => {
      onFound({
        id: dev.id, address: dev.id, name: dev.name || dev.localName || 'Dispositivo CRASH',
        isCompatible: true, moduleType: 'HC-05 BLE', connected: false
      });
    });
  }, []);

  const connect = useCallback(async (id: string) => {
    const ok = await bluetoothService.connectToDevice(id);
    if (ok) {
      await AsyncStorage.setItem(LAST_DEVICE_KEY, id);
      const connectedDevice = bluetoothService.getConnectedDevice();
      const existingAlias = await AsyncStorage.getItem(DEVICE_ALIAS_KEY);
      const newName = existingAlias || connectedDevice?.name || 'C.R.A.S.H. Module';
      setDeviceName(newName);
      await AsyncStorage.setItem(DEVICE_ALIAS_KEY, newName);
    }
    return ok;
  }, []);
  const disconnect = useCallback(() => bluetoothService.disconnect(), []);

  return (
    <BluetoothContext.Provider value={{
      status, statusDetail, connected, device, deviceName, telemetry, nativeAvailable, bluetoothEnabled,
      requestPermissions, startDeviceScan, connect, disconnect,
    }}>
      {children}
    </BluetoothContext.Provider>
  );
}
