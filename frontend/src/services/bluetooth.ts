import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Subscription, State, LogLevel } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

if (!global.Buffer) {
  global.Buffer = Buffer;
}

export type BluetoothStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

export interface TelemetryData {
  acceleration_x: number;
  acceleration_y: number;
  acceleration_z: number;
  gyroscope_x: number;
  gyroscope_y: number;
  gyroscope_z: number;
  g_force: number;
  timestamp: number;
}

export interface ScanDevice {
  id: string;
  address: string;
  name: string;
  isCompatible: boolean;
  moduleType: string;
  connected: boolean;
}

export type TelemetrySeverity = 'critical' | 'normal';

// UUIDs estándar para módulos BLE tipo HM-10 / MLT-BT05 / CRASH
const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
const FALLBACK_SERVICE_UUIDS = [
  SERVICE_UUID,
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000dfb0-0000-1000-8000-00805f9b34fb',
];
const FALLBACK_CHARACTERISTIC_UUIDS = [
  CHARACTERISTIC_UUID,
  '0000fff1-0000-1000-8000-00805f9b34fb',
  '0000ffe2-0000-1000-8000-00805f9b34fb',
];

class BluetoothTelemetryService {
  private bleManager = new BleManager();
  private telemetryListeners = new Set<(data: TelemetryData) => void>();
  private statusListeners = new Set<(status: BluetoothStatus, detail?: string) => void>();
  private deviceListeners = new Set<(device: any | null) => void>();

  private connectedDevice: Device | null = null;
  private monitorSubscription: Subscription | null = null;
  private readBuffer = '';
  private connected = false;
  private lastTelemetryAt = 0;
  private reconnectAttempts = 0;
  private lastCriticalG = 0;

  constructor() {
    this.bleManager.setLogLevel(LogLevel.None);
  }

  // --- Helpers de Estado ---
  isNativeAvailable() { return Platform.OS !== 'web'; }
  isConnected() { return this.connected; }
  getConnectedDevice() { return this.connectedDevice; }

  // --- Gestión de Listeners ---
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

  getConnectedDeviceId() { return this.connectedDevice?.id ?? null; }

  // --- Permisos y Escaneo ---
  async isBluetoothEnabled() {
    const state = await this.bleManager.state();
    return state === State.PoweredOn;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const api = parseInt(Platform.Version.toString(), 10);
      const perms = api >= 31
        ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const granted = await PermissionsAndroid.requestMultiple(perms);
      return Object.values(granted).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
    } catch { return false; }
  }

  async startDeviceScan(onDeviceFound: (device: Device) => void) {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) { this.emitStatus('error', 'Permisos denegados'); return; }

    this.emitStatus('scanning', 'Buscando casco...');
    this.bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        this.emitStatus('error', 'Error en escaneo');
        this.bleManager.stopDeviceScan();
        return;
      }
      if (device && (device.name || device.localName)) onDeviceFound(device);
    });

    setTimeout(() => {
      this.bleManager.stopDeviceScan();
      if (!this.connected) this.emitStatus('idle');
    }, 10000);
  }

  // --- Conexión y Monitoreo ---
  async connectToDevice(id: string): Promise<boolean> {
    try {
      this.bleManager.stopDeviceScan();
      this.emitStatus('connecting', 'Estableciendo enlace...');

      const device = await this.bleManager.connectToDevice(id);
      await device.discoverAllServicesAndCharacteristics();

      this.connectedDevice = device;
      this.connected = true;
      this.emitDevice(device);
      this.emitStatus('connected', device.name || 'C.R.A.S.H. Module');

      // Limpiar buffer al conectar para evitar basura previa
      this.readBuffer = '';

      const monitored = await this.setupTelemetryMonitor(device);
      if (!monitored) {
        await this.disconnect();
        this.emitStatus('error', 'No se encontró característica de telemetría');
        return false;
      }

      return true;
    } catch (e) {
      console.error('Error de conexión:', e);
      const message = e instanceof Error ? e.message : String(e);
      if (/already connected|already in use|busy|133|status 8/i.test(message)) {
        this.emitStatus('error', 'El circuito ya está conectado en otro teléfono');
      } else {
        this.emitStatus('error', 'Fallo de conexión');
      }
      return false;
    }
  }

  async reconnectToLastDevice(id: string): Promise<boolean> {
    if (!id || this.connected || this.reconnectAttempts >= 3) return false;
    this.reconnectAttempts += 1;
    const ok = await this.connectToDevice(id);
    if (ok) this.reconnectAttempts = 0;
    return ok;
  }

  private normalizeUuid(uuid: string) {
    return uuid.toLowerCase();
  }

  private async setupTelemetryMonitor(device: Device): Promise<boolean> {
    const services = await device.services();
    const knownService = services.find((service) =>
      FALLBACK_SERVICE_UUIDS.includes(this.normalizeUuid(service.uuid))
    );

    const candidateServices = knownService ? [knownService] : services;

    for (const service of candidateServices) {
      const chars = await service.characteristics();
      const knownChar = chars.find((char) =>
        FALLBACK_CHARACTERISTIC_UUIDS.includes(this.normalizeUuid(char.uuid))
      );

      const telemetryChar = knownChar || chars.find((char) => char.isNotifiable || char.isIndicatable || char.isReadable);
      if (!telemetryChar) continue;

      this.emitStatus('connected', `Canal BLE: ${service.uuid.slice(4, 8).toUpperCase()}/${telemetryChar.uuid.slice(4, 8).toUpperCase()}`);

      this.monitorSubscription = device.monitorCharacteristicForService(
        service.uuid,
        telemetryChar.uuid,
        (error, char) => {
          if (error) {
            console.warn('Error en monitoreo BLE:', error);
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
    }

    return false;
  }

  // --- Procesamiento de Datos (Optimizado para fragmentación) ---
  private processBleData(data: string) {
    this.readBuffer += data;

    // Buscamos el delimitador que definiste en Arduino: Serial.println() -> \n
    let breakIndex = this.readBuffer.indexOf('\n');

    while (breakIndex !== -1) {
      const line = this.readBuffer.slice(0, breakIndex).trim();
      this.readBuffer = this.readBuffer.slice(breakIndex + 1);

      if (line.length > 0) {
        const parsed = this.parseLine(line);
        if (parsed) {
          const now = Date.now();
          const isCritical = parsed.g_force >= 5;
          const enoughTime = now - this.lastTelemetryAt > 120;
          if (isCritical || enoughTime) {
            this.lastTelemetryAt = now;
            this.emitTelemetry(parsed);
          }
        }
      }
      breakIndex = this.readBuffer.indexOf('\n');
    }
  }

  private parseLine(raw: string): TelemetryData | null {
    try {
      if (!/(AVG|CRASH):/i.test(raw)) return null;
      // 1. Separar el prefijo (AVG/CRASH) de los datos numéricos usando el ":"
      const parts = raw.split(':');
      const dataToParse = parts.length > 1 ? parts[1] : parts[0];

      // 2. Limpiar caracteres no numéricos y separar por comas
      const clean = dataToParse.replace(/\r/g, '').replace(/[^0-9.,-]/g, '');
      const n = clean.split(',').map(parseFloat);

      // 3. Validar que tengamos los 7 campos (ax, ay, az, gx, gy, gz, gForce)
      if (n.length >= 7 && n.every(val => !isNaN(val))) {
        const gForce = Math.max(0, n[6]);
        if (Math.abs(gForce - this.lastCriticalG) < 0.05 && gForce < 5) return null;
        if (gForce >= 5) this.lastCriticalG = gForce;
        return {
          acceleration_x: n[0],
          acceleration_y: n[1],
          acceleration_z: n[2],
          gyroscope_x: n[3],
          gyroscope_y: n[4],
          gyroscope_z: n[5],
          g_force: gForce,
          timestamp: Date.now()
        };
      }
    } catch (e) {
      console.warn("Error parseando línea:", raw);
    }
    return null;
  }

  // --- Desconexión ---
  async disconnect() {
    if (this.monitorSubscription) {
      this.monitorSubscription.remove();
      this.monitorSubscription = null;
    }
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch (e) {
        console.log('Error al cancelar conexión:', e);
      }
    }
    this.connected = false;
    this.lastTelemetryAt = 0;
    this.connectedDevice = null;
    this.readBuffer = '';
    this.emitDevice(null);
    this.emitStatus('idle');
  }
}

export const bluetoothService = new BluetoothTelemetryService();
