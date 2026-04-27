import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { bluetoothService, TelemetryData, ScanDevice, BluetoothStatus } from '../services/bluetooth';
import { useAppSettings } from './AppSettingsContext';

type BluetoothCtx = {
  status: BluetoothStatus;
  statusDetail?: string;
  connected: boolean;
  deviceName: string;
  device: ScanDevice | null;
  telemetry: TelemetryData | null;
  nativeAvailable: boolean;
  bluetoothEnabled: boolean;
  requestPermissions: () => Promise<boolean>;
  startDeviceScan: (onFound: (d: ScanDevice) => void) => Promise<void>;
  connect: (id: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  startSimulation: () => void;
  stopSimulation: () => void;
};

const BluetoothContext = createContext<BluetoothCtx>({} as any);
export const useBluetooth = () => useContext(BluetoothContext);

export function BluetoothProvider({ children }: { children: React.ReactNode }) {
  const { developerMode, ready, deviceName: preferredPattern } = useAppSettings();
  const [status, setStatus] = useState<BluetoothStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [device, setDevice] = useState<ScanDevice | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const nativeAvailable = bluetoothService.isNativeAvailable();

  useEffect(() => {
    const unsubT = bluetoothService.onTelemetry(setTelemetry);
    const unsubS = bluetoothService.onStatus((s, detail) => {
      setStatus(s); setStatusDetail(detail);
      setConnected(bluetoothService.isConnected());
      setDeviceName(bluetoothService.getConnectedName());
    });
    const unsubD = bluetoothService.onDeviceChange(setDevice);
    return () => { unsubT(); unsubS(); unsubD(); };
  }, []);

  useEffect(() => {
    if (ready) bluetoothService.setSimulationMode(developerMode);
  }, [developerMode, ready]);

  useEffect(() => {
    const sync = async () => setBluetoothEnabled(await bluetoothService.isBluetoothEnabled());
    sync();
    const timer = setInterval(sync, 3000);
    return () => clearInterval(timer);
  }, []);

  const requestPermissions = useCallback(() => bluetoothService.requestPermissions(), []);
  const startDeviceScan = useCallback(async (onFound: (d: ScanDevice) => void) => {
    const patterns = [preferredPattern, 'HM-10', 'HMSOFT', 'BT05', 'AT-09', 'CRASH']
      .filter(Boolean)
      .map(p => p.toUpperCase().trim());

    await bluetoothService.startDeviceScan((dev) => {
      const name = (dev.name || dev.localName || '').trim();
      const normalizedName = name.toUpperCase();
      const isLikelyHm10 = patterns.some(p => normalizedName.includes(p)) || normalizedName.length === 0;
      onFound({
        id: dev.id,
        address: dev.id,
        name: name || `BLE-${dev.id.slice(-4)}`,
        isCompatible: isLikelyHm10,
        moduleType: isLikelyHm10 ? 'HM-10/BLE' : 'BLE genérico',
        connected: false
      });
    });
  }, [preferredPattern]);

  const connect = useCallback((id: string) => bluetoothService.connectToDevice(id), []);
  const disconnect = useCallback(() => bluetoothService.disconnect(), []);

  return (
    <BluetoothContext.Provider value={{
      status, statusDetail, connected, deviceName, device, telemetry, nativeAvailable, bluetoothEnabled,
      requestPermissions, startDeviceScan, connect, disconnect,
      startSimulation: () => bluetoothService.startSimulation(),
      stopSimulation: () => bluetoothService.stopSimulation(),
    }}>
      {children}
    </BluetoothContext.Provider>
  );
}
