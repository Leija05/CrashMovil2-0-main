import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
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
  batteryLevel: number | null;
  deviceName: string;
  requestPermissions: () => Promise<boolean>;
  startDeviceScan: (onFound: (d: ScanDevice) => void) => Promise<void>;
  connect: (id: string, customName?: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

const BluetoothContext = createContext<BluetoothCtx>({} as any);
export const useBluetooth = () => useContext(BluetoothContext);
const LAST_DEVICE_KEY = 'crash.lastDevice.v1';

export function BluetoothProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BluetoothStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<ScanDevice | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState('C.R.A.S.H. Module');
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeAvailable = bluetoothService.isNativeAvailable();

  useEffect(() => {
    const unsubT = bluetoothService.onTelemetry((data) => {
      setTelemetry(data);
      setBatteryLevel(data.battery ?? bluetoothService.getBatteryLevel());
    });
    const unsubS = bluetoothService.onStatus((s, detail) => {
      setStatus(s); setStatusDetail(detail);
      setConnected(bluetoothService.isConnected());
    });
    const unsubD = bluetoothService.onDeviceChange(async (nextDevice) => {
      setDevice(nextDevice);
      if (nextDevice) {
        const label = nextDevice.name || 'C.R.A.S.H. Module';
        setDeviceName(label);
        reconnectAttempts.current = 0;
        await AsyncStorage.setItem(LAST_DEVICE_KEY, JSON.stringify({ id: nextDevice.id, name: label }));
      } else if (nativeAvailable) {
        const raw = await AsyncStorage.getItem(LAST_DEVICE_KEY);
        if (raw && !reconnectTimeout.current) {
          const saved = JSON.parse(raw);
          const delay = Math.min(15000, 2000 * (reconnectAttempts.current + 1));
          reconnectTimeout.current = setTimeout(async () => {
            reconnectTimeout.current = null;
            reconnectAttempts.current += 1;
            setStatusDetail(`Reconectando (${reconnectAttempts.current})...`);
            await bluetoothService.connectToDevice(saved.id);
          }, delay);
        }
      }
    });
    return () => { unsubT(); unsubS(); unsubD(); if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current); };
  }, [nativeAvailable]);

  const requestPermissions = useCallback(async () => {
    const granted = await bluetoothService.requestPermissions();
    if (nativeAvailable) {
      const enabled = await bluetoothService.isBluetoothEnabled();
      setBluetoothEnabled(enabled);
    }
    return granted;
  }, [nativeAvailable]);

  const startDeviceScan = useCallback(async (onFound: (d: ScanDevice) => void) => {
    await bluetoothService.startDeviceScan((dev) => {
      onFound({
        id: dev.id, address: dev.id, name: dev.name || dev.localName || 'Desconocido',
        isCompatible: true, moduleType: 'HC-05 BLE', connected: false,
      });
    });
  }, []);

  const connect = useCallback(async (id: string, customName?: string) => {
    const ok = await bluetoothService.connectToDevice(id);
    if (ok && customName?.trim()) {
      setDeviceName(customName.trim());
      await AsyncStorage.setItem(LAST_DEVICE_KEY, JSON.stringify({ id, name: customName.trim() }));
    }
    return ok;
  }, []);
  const disconnect = useCallback(() => bluetoothService.disconnect(), []);

  return (
    <BluetoothContext.Provider value={{
      status, statusDetail, connected, device, telemetry, nativeAvailable, bluetoothEnabled,
      batteryLevel, deviceName, requestPermissions, startDeviceScan, connect, disconnect,
    }}>
      {children}
    </BluetoothContext.Provider>
  );
}
