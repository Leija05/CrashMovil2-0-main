import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
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
  const { developerMode, ready } = useAppSettings();
  const [status, setStatus] = useState<BluetoothStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<ScanDevice | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
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
    if (ready) bluetoothService.setSimulationMode(developerMode);
  }, [developerMode, ready]);

  const requestPermissions = useCallback(() => bluetoothService.requestPermissions(), []);
  const startDeviceScan = useCallback(async (onFound: (d: ScanDevice) => void) => {
    await bluetoothService.startDeviceScan((dev) => {
      onFound({
        id: device?.id || dev.id, address: dev.id, name: dev.name || dev.localName || 'Desconocido',
        isCompatible: true, moduleType: 'HC-05 BLE', connected: false
      });
    });
  }, []);

  const connect = useCallback((id: string) => bluetoothService.connectToDevice(id), []);
  const disconnect = useCallback(() => bluetoothService.disconnect(), []);

  return (
    <BluetoothContext.Provider value={{
      status,
      statusDetail,
      connected,
      deviceName: device?.name || (connected ? 'SIMULADOR CRASH' : ''),
      device,
      telemetry,
      nativeAvailable,
      bluetoothEnabled,
      requestPermissions, startDeviceScan, connect, disconnect,
      startSimulation: () => bluetoothService.startSimulation(),
      stopSimulation: () => bluetoothService.stopSimulation(),
    }}>
      {children}
    </BluetoothContext.Provider>
  );
}
