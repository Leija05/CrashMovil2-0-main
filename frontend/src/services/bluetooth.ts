import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Subscription, State, LogLevel } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

if (!global.Buffer) {
    global.Buffer = Buffer;
}

export type BluetoothStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

export interface TelemetryData {
  acceleration_x: number; acceleration_y: number; acceleration_z: number; 
  gyroscope_x: number; gyroscope_y: number; gyroscope_z: number; 
  g_force: number; timestamp: number;
}

export interface ScanDevice {
  id: string;
  address: string;
  name: string;
  isCompatible: boolean;
  moduleType: string;
  connected: boolean;
}

export type ImpactSeverity = 'low' | 'medium' | 'high' | 'critical';

const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

class BluetoothTelemetryService {
  private bleManager = new BleManager();
  private telemetryListeners = new Set<(data: TelemetryData) => void>();
  private statusListeners = new Set<(status: BluetoothStatus, detail?: string) => void>();
  private deviceListeners = new Set<(device: any | null) => void>();
  
  private connectedDevice: Device | null = null;
  private monitorSubscription: Subscription | null = null;
  private simulationTimer: any = null;
  private readBuffer = '';
  private connected = false;
  private simulationEnabled = false;

  constructor() {
    this.bleManager.setLogLevel(LogLevel.None);
  }

  isNativeAvailable() { return Platform.OS !== 'web'; }
  isConnected() { return this.connected; }
  isSimulationMode() { return this.simulationEnabled; }
  getConnectedDevice() { return this.connectedDevice; }

  onDeviceChange(l: (d: any | null) => void) { 
    this.deviceListeners.add(l); 
    return () => this.deviceListeners.delete(l); 
  }
  onTelemetry(l: (d: TelemetryData) => void) { 
    this.telemetryListeners.add(l); 
    return () => this.telemetryListeners.delete(l); 
  }
  onStatus(l: (s: BluetoothStatus, d?: string) => void) { 
    this.statusListeners.add(l); 
    return () => this.statusListeners.delete(l); 
  }

  private emitDevice(d: any | null) { this.deviceListeners.forEach(l => l(d)); }
  private emitStatus(s: BluetoothStatus, d?: string) { this.statusListeners.forEach(l => l(s, d)); }
  private emitTelemetry(d: TelemetryData) { this.telemetryListeners.forEach(l => l(d)); }

  async isBluetoothEnabled() {
    const state = await this.bleManager.state();
    return state === State.PoweredOn;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const api = parseInt(Platform.Version.toString(), 10);
      const perms = api >= 31 
        ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const granted = await PermissionsAndroid.requestMultiple(perms);
      return Object.values(granted).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
    } catch { return false; }
  }

  async startDeviceScan(onDeviceFound: (device: Device) => void) {
    if (this.simulationEnabled) return;
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) { this.emitStatus('error', 'Permisos denegados'); return; }

    this.emitStatus('scanning', 'Buscando...');
    this.bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) { this.emitStatus('error', 'Error escaneo'); this.bleManager.stopDeviceScan(); return; }
      if (device && (device.name || device.localName)) onDeviceFound(device);
    });

    setTimeout(() => {
      this.bleManager.stopDeviceScan();
      if (!this.connected) this.emitStatus('idle');
    }, 10000);
  }

  async connectToDevice(id: string): Promise<boolean> {
    try {
      this.bleManager.stopDeviceScan();
      this.emitStatus('connecting', 'Conectando...');
      const device = await this.bleManager.connectToDevice(id);
      await device.discoverAllServicesAndCharacteristics();
      
      this.connectedDevice = device;
      this.connected = true;
      this.emitDevice(device);
      this.emitStatus('connected', device.name || 'HC-05 BLE');

      this.monitorSubscription = device.monitorCharacteristicForService(
        SERVICE_UUID, CHARACTERISTIC_UUID, (error, char) => {
          if (error) { this.disconnect(); return; }
          if (char?.value) {
            const raw = Buffer.from(char.value, 'base64').toString('utf-8');
            this.processBleData(raw);
          }
        }
      );
      return true;
    } catch (e) {
      this.emitStatus('error', 'Fallo conexión');
      return false;
    }
  }

  private processBleData(data: string) {
    this.readBuffer += data;
    let idx = this.readBuffer.indexOf('\n');
    while (idx !== -1) {
      const line = this.readBuffer.slice(0, idx).trim();
      this.readBuffer = this.readBuffer.slice(idx + 1);
      const parsed = this.parseLine(line);
      if (parsed) this.emitTelemetry(parsed);
      idx = this.readBuffer.indexOf('\n');
    }
  }

  private parseLine(raw: string): TelemetryData | null {
    const n = raw.split(',').map(parseFloat);
    if (n.length >= 7 && n.every(val => !isNaN(val))) {
      return { 
        acceleration_x: n[0], acceleration_y: n[1], acceleration_z: n[2], 
        gyroscope_x: n[3], gyroscope_y: n[4], gyroscope_z: n[5], 
        g_force: n[6], timestamp: Date.now() 
      };
    }
    return null;
  }

  setSimulationMode(e: boolean) { this.simulationEnabled = e; if (!e) this.stopSimulation(); }
  startSimulation() {
    this.simulationEnabled = true; this.connected = true;
    this.emitStatus('connected', 'Simulador');
    this.simulationTimer = setInterval(() => {
      this.emitTelemetry({ acceleration_x: 0, acceleration_y: 0, acceleration_z: 1, gyroscope_x: 0, gyroscope_y: 0, gyroscope_z: 0, g_force: 1, timestamp: Date.now() });
    }, 500);
  }
  stopSimulation() { if (this.simulationTimer) clearInterval(this.simulationTimer); this.connected = false; this.emitStatus('idle'); }

  simulateImpact(severity: ImpactSeverity): TelemetryData {
    const gRanges: Record<ImpactSeverity, [number, number]> = {
      low: [2.5, 4.9],
      medium: [5.0, 9.9],
      high: [10.0, 14.9],
      critical: [15.0, 22.0],
    };
    const [minG, maxG] = gRanges[severity];
    const g_force = Number((Math.random() * (maxG - minG) + minG).toFixed(2));
    const telemetry: TelemetryData = {
      acceleration_x: Number(((Math.random() * 2 - 1) * g_force).toFixed(2)),
      acceleration_y: Number(((Math.random() * 2 - 1) * g_force).toFixed(2)),
      acceleration_z: Number((1 + (Math.random() * 2 - 1) * (g_force * 0.35)).toFixed(2)),
      gyroscope_x: Number(((Math.random() * 2 - 1) * 380).toFixed(2)),
      gyroscope_y: Number(((Math.random() * 2 - 1) * 380).toFixed(2)),
      gyroscope_z: Number(((Math.random() * 2 - 1) * 380).toFixed(2)),
      g_force,
      timestamp: Date.now(),
    };
    this.emitTelemetry(telemetry);
    return telemetry;
  }

  async disconnect() {
    if (this.monitorSubscription) this.monitorSubscription.remove();
    if (this.connectedDevice) await this.connectedDevice.cancelConnection();
    this.connected = false;
    this.connectedDevice = null;
    this.emitDevice(null);
    this.emitStatus('idle');
  }
}
export const bluetoothService = new BluetoothTelemetryService();
