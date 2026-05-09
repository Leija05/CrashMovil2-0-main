import * as Location from 'expo-location';
import { telemetryAPI, falseAlarmAPI } from './api';
import { TelemetryData } from './bluetooth';

type ForegroundTelemetrySnapshot = {
  latitude: number | null;
  longitude: number | null;
  gpsAccuracyM?: number | null;
  gForce: number;
  updatedAt: string;
};

type QuickActionPayload = {
  token: string;
  alertId?: string;
  telemetry?: TelemetryData | null;
  location?: ForegroundTelemetrySnapshot | null;
};

const TELEMETRY_THROTTLE_MS = 5000;

/**
 * Thin orchestration layer for the Android foreground service contract.
 *
 * Expo managed builds cannot create the persistent Android notification by
 * themselves; production builds should bind these methods to a small native
 * module (or a library such as Notifee) that owns the notification channel and
 * action buttons. Keeping the policy here makes the privacy/idempotency rules
 * testable from JS and reusable by the native bridge.
 */
class ForegroundTelemetryService {
  private lastSentAt = 0;
  private lastSnapshot: ForegroundTelemetrySnapshot | null = null;

  async shouldTrackLocation(helmetConnected: boolean, gpsConsent: boolean) {
    return helmetConnected && gpsConsent;
  }

  async resolveLocation(helmetConnected: boolean, gpsConsent: boolean) {
    if (!(await this.shouldTrackLocation(helmetConnected, gpsConsent))) return null;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    this.lastSnapshot = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      gpsAccuracyM: position.coords.accuracy,
      gForce: this.lastSnapshot?.gForce ?? 0,
      updatedAt: new Date().toISOString(),
    };
    return this.lastSnapshot;
  }

  async sendThrottledTelemetry(token: string, telemetry: TelemetryData, helmetConnected: boolean, gpsConsent: boolean) {
    const now = Date.now();
    if (now - this.lastSentAt < TELEMETRY_THROTTLE_MS) return { skipped: true };

    const location = await this.resolveLocation(helmetConnected, gpsConsent);
    this.lastSentAt = now;
    this.lastSnapshot = {
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      gpsAccuracyM: location?.gpsAccuracyM,
      gForce: telemetry.g_force,
      updatedAt: new Date().toISOString(),
    };

    return telemetryAPI.send(token, {
      ...telemetry,
      latitude: location?.latitude,
      longitude: location?.longitude,
      gps_accuracy_m: location?.gpsAccuracyM,
      helmet_connected: helmetConnected,
      gps_consent: gpsConsent,
      client_event_id: `telemetry-${now}`,
      occurred_at: new Date(now).toISOString(),
    });
  }

  /**
   * Native quick action handler: notification button -> false_alarm audit row.
   * The native side should call this without opening the React Native screen.
   */
  async cancelAlertFromNotification({ token, alertId, telemetry, location }: QuickActionPayload) {
    const now = Date.now();
    return falseAlarmAPI.create(token, {
      alert_id: alertId,
      client_event_id: `false-alarm-${alertId || now}`,
      reason: 'cancelled_from_notification',
      telemetry,
      latitude: location?.latitude,
      longitude: location?.longitude,
      occurred_at: new Date(now).toISOString(),
    });
  }

  getNotificationText() {
    const lat = this.lastSnapshot?.latitude?.toFixed(5) ?? '--';
    const lon = this.lastSnapshot?.longitude?.toFixed(5) ?? '--';
    const g = this.lastSnapshot?.gForce?.toFixed(2) ?? '0.00';
    return `C.R.A.S.H. activo · ${lat}, ${lon} · ${g}G`;
  }
}

export const foregroundTelemetryService = new ForegroundTelemetryService();
