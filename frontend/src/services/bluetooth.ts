import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Subscription, State, LogLevel, Characteristic } from 'react-native-ble-plx';
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

const HM10_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const HM10_CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

class BluetoothTelemetryService {
  private bleManager: BleManager | null = null;
  private telemetryListeners = new Set<(data: TelemetryData) => void>();
  private statusListeners = new Set<(status: BluetoothStatus, detail?: string) => void>();
  private deviceListeners = new Set<(device: any | null) => void>();
  
  private connectedDevice: Device | null = null;
  private monitorSubscription: Subscription | null = null;
  private simulationTimer: any = null;
  private readBuffer = '';
  private connected = false;
  private simulationEnabled = false;
  private connectedName = '';

  constructor() {
    if (Platform.OS !== 'web') {
      try {
        this.bleManager = new BleManager();
        this.bleManager.setLogLevel(LogLevel.None);
      } catch {
        this.bleManager = null;
      }
    }
  }

  private getManager(): BleManager {
    if (!this.bleManager) {
      throw new Error('Bluetooth BLE no disponible en este entorno');
    }
    return this.bleManager;
  }

  isNativeAvailable() { return Platform.OS !== 'web' && !!this.bleManager; }
  isConnected() { return this.connected; }
  getConnectedName() { return this.connectedName; }
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
    if (!this.isNativeAvailable()) return false;
    const state = await this.getManager().state();
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
    if (!this.isNativeAvailable()) {
      this.emitStatus('error', 'Bluetooth no disponible');
      return;
    }
    const manager = this.getManager();
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) { this.emitStatus('error', 'Permisos denegados'); return; }

    this.emitStatus('scanning', 'Buscando...');
    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) { this.emitStatus('error', 'Error escaneo'); manager.stopDeviceScan(); return; }
      if (device && (device.name || device.localName)) onDeviceFound(device);
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      if (!this.connected) this.emitStatus('idle');
    }, 10000);
  }

  async connectToDevice(id: string): Promise<boolean> {
    try {
      if (!this.isNativeAvailable()) {
        this.emitStatus('error', 'Bluetooth no disponible');
        return false;
      }
      const manager = this.getManager();
      manager.stopDeviceScan();
      this.emitStatus('connecting', 'Conectando...');
      const device = await manager.connectToDevice(id);
      await device.discoverAllServicesAndCharacteristics();
      
      this.connectedDevice = device;
      this.connectedName = device.name || device.localName || 'Módulo BLE';
      this.connected = true;
      this.emitDevice(device);
      this.emitStatus('connected', this.connectedName);

      const monitorTarget = await this.resolveTelemetryCharacteristic(device);
      this.monitorSubscription = device.monitorCharacteristicForService(
        monitorTarget.serviceUUID,
        monitorTarget.uuid,
        (error, char) => {
          if (error) {
            this.emitStatus('error', `Error telemetría: ${error.message || 'monitor caído'}`);
            this.disconnect();
            return;
          }
          if (char?.value) {
            const raw = Buffer.from(char.value, 'base64').toString('utf-8');
            this.processBleData(raw);
          }
        }
      );
      return true;
    } catch {
      this.emitStatus('error', 'Fallo conexión');
      return false;
    }
  }

  private async resolveTelemetryCharacteristic(device: Device): Promise<Characteristic> {
    // 1) Ruta preferida HM-10 / BT05
    try {
      const chars = await device.characteristicsForService(HM10_SERVICE_UUID);
      const hm10Char = chars.find((char) =>
        char.uuid.toLowerCase() === HM10_CHARACTERISTIC_UUID && (char.isNotifiable || char.isIndicatable || char.isReadable)
      );
      if (hm10Char) return hm10Char;
    } catch {}

    // 2) Fallback: buscar cualquier característica con notify/indicate/read
    const services = await device.services();
    for (const service of services) {
      try {
        const chars = await service.characteristics();
        const candidate = chars.find((char) => char.isNotifiable || char.isIndicatable || char.isReadable);
        if (candidate) return candidate;
      } catch {}
    }
    throw new Error('No se encontró característica de telemetría en el dispositivo BLE');
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
    this.connectedName = 'SIMULADOR CRASH';
    this.emitStatus('connected', this.connectedName);
    this.simulationTimer = setInterval(() => {
      this.emitTelemetry({ acceleration_x: 0, acceleration_y: 0, acceleration_z: 1, gyroscope_x: 0, gyroscope_y: 0, gyroscope_z: 0, g_force: 1, timestamp: Date.now() });
    }, 500);
  }
  stopSimulation() {
    if (this.simulationTimer) clearInterval(this.simulationTimer);
    this.connected = false;
    this.connectedName = '';
    this.emitStatus('idle');
  }

  simulateImpact(severity: 'low' | 'medium' | 'high' | 'critical'): TelemetryData {
    const gMap = { low: 4.2, medium: 8.5, high: 13.2, critical: 18.5 };
    const g = gMap[severity];
    return {
      acceleration_x: Number((Math.random() * g * 0.8).toFixed(2)),
      acceleration_y: Number((Math.random() * g * 0.6).toFixed(2)),
      acceleration_z: Number((Math.random() * g).toFixed(2)),
      gyroscope_x: Number((Math.random() * 3).toFixed(2)),
      gyroscope_y: Number((Math.random() * 3).toFixed(2)),
      gyroscope_z: Number((Math.random() * 3).toFixed(2)),
      g_force: g,
      timestamp: Date.now(),
    };
  }

  async disconnect() {
    if (this.monitorSubscription) this.monitorSubscription.remove();
    if (this.connectedDevice) await this.connectedDevice.cancelConnection();
    this.connected = false;
    this.connectedName = '';
    this.connectedDevice = null;
    this.emitDevice(null);
    this.emitStatus('idle');
  }
}
export const bluetoothService = new BluetoothTelemetryService();
