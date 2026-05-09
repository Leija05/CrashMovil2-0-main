# C.R.A.S.H. 2.0 — Arquitectura integral

## 1. Diagrama textual de conexión

```text
[Arduino Nano + MPU6050]
  └─ BLE/HC-05 telemetry frames (ax, ay, az, gx, gy, gz, g_force)
      ↓
[React Native Driver App]
  ├─ BluetoothContext: sesión de casco y lectura de sensores
  ├─ AppSettingsContext: consentimiento GPS y umbrales
  ├─ ForegroundTelemetryService:
  │   ├─ inicia solo si helmet_connected=true y gps_tracking_enabled=true
  │   ├─ notificación persistente: coordenadas + fuerza G con throttle
  │   └─ acción rápida Cancelar -> POST /api/false-alarms
  └─ Offline queue: client_event_id + reintentos idempotentes
      ↓ HTTPS JWT
[FastAPI Backend]
  ├─ REST: auth, settings, impacts, telemetry, false alarms, monitor routes
  ├─ MongoDB: users, user_settings, telemetry, impact_events, false_alarms
  ├─ WebSocket /api/ws/monitor: broadcast de telemetry.update y alert.false_alarm
  ├─ structured logs + health checks
  └─ integrations: WhatsApp/Gemini para alertas y diagnóstico
      ↓ WebSocket JWT
[Web Monitoring Dashboard]
  ├─ Bento grid ejecutivo: mapa, KPIs, centro de alertas, salud del sistema
  ├─ Leaflet/Mapbox: marcadores por estado
  └─ Driver detail: ruta histórica + serie de g-force
```

## 2. Diseño de datos

### `users`
| Campo | Tipo | Notas |
|---|---|---|
| `_id` | ObjectId | PK Mongo |
| `email` | string unique | Login |
| `password_hash` | string | bcrypt |
| `name` | string | Visible en monitoreo |
| `role` | enum | `driver`, `monitor`, `admin`; compatibilidad con `user` como driver |
| `created_at`, `updated_at` | ISO string | Auditoría |

### `user_settings`
| Campo | Tipo | Notas |
|---|---|---|
| `user_id` | string indexed | Dueño |
| `alert_threshold` | number | Umbral G |
| `countdown_seconds` | int | 3 a 60 s |
| `auto_call`, `auto_whatsapp` | boolean | Canales automáticos |
| `gps_tracking_enabled` | boolean | Consentimiento explícito de GPS |

### `telemetry`
| Campo | Tipo | Notas |
|---|---|---|
| `user_id` | string indexed | Conductor |
| `client_event_id` | string | Idempotencia por dispositivo |
| `acceleration`, `gyroscope` | object | Ejes x/y/z |
| `g_force` | number | Magnitud resultante |
| `severity` | enum | `low`, `medium`, `high`, `critical` |
| `helmet_connected`, `gps_consent` | boolean | Pruebas de privacidad |
| `location` | object/null | Solo si casco conectado + consentimiento + coordenadas |
| `occurred_at`, `received_at` | ISO string | Ordenamiento y latencia |

### `false_alarms`
| Campo | Tipo | Notas |
|---|---|---|
| `user_id` | string indexed | Conductor |
| `client_event_id` | string unique por usuario | Idempotencia de cancelación |
| `alert_id` | string/null | Impacto asociado |
| `event_type` | string | `false_alarm` |
| `reason` | string | Ej. `cancelled_from_notification` |
| `telemetry` | object | Contexto al cancelar |
| `location` | object/null | Último punto permitido |
| `created_at`, `occurred_at` | ISO string | Auditoría |

## 3. Contratos API/WebSockets

### Enviar telemetría
`POST /api/telemetry`

```json
{
  "acceleration_x": 0.12,
  "acceleration_y": 0.04,
  "acceleration_z": 1.01,
  "gyroscope_x": 0.4,
  "gyroscope_y": 0.2,
  "gyroscope_z": 0.1,
  "g_force": 1.04,
  "latitude": 19.43261,
  "longitude": -99.13321,
  "gps_accuracy_m": 8.5,
  "helmet_connected": true,
  "gps_consent": true,
  "client_event_id": "telemetry-2026-05-09T10:15:30.000Z-001",
  "occurred_at": "2026-05-09T10:15:30.000Z"
}
```

Respuesta:

```json
{
  "status": "ok",
  "idempotent": false,
  "telemetry_id": "663f...",
  "client_event_id": "telemetry-2026-05-09T10:15:30.000Z-001",
  "g_force": 1.04,
  "severity": "low"
}
```

### Cancelar alerta desde notificación
`POST /api/false-alarms`

```json
{
  "alert_id": "impact-123",
  "client_event_id": "false-alarm-impact-123",
  "reason": "cancelled_from_notification",
  "telemetry": { "g_force": 7.2, "battery": 91 },
  "latitude": 19.43261,
  "longitude": -99.13321,
  "occurred_at": "2026-05-09T10:15:45.000Z"
}
```

### WebSocket monitor
`WS /api/ws/monitor?token=<JWT de monitor/admin>`

```json
{ "type": "system.ready", "data": { "connected_at": "2026-05-09T10:15:00Z" } }
```

```json
{
  "type": "telemetry.update",
  "data": {
    "user_id": "driver-1",
    "driver_name": "Ana Rider",
    "g_force": 1.04,
    "severity": "low",
    "location": { "latitude": 19.43261, "longitude": -99.13321 }
  }
}
```

## 4. Lógica del Foreground Service

1. El usuario habilita `gps_tracking_enabled` en Ajustes.
2. Al conectar casco, la app inicia el servicio nativo Android con canal `CRASH_TELEMETRY`.
3. Cada lectura BLE actualiza estado interno; el envío HTTP y texto de notificación se limita por throttle (`TELEMETRY_THROTTLE_MS`).
4. La notificación persistente muestra `lat, lon, g-force`; sin consentimiento muestra coordenadas como `--`.
5. Acción rápida `Cancelar alerta` invoca JS/native bridge `cancelAlertFromNotification`, que registra `false_alarm` idempotente sin abrir la app.
6. Si no hay red, el payload queda en cola offline conservando `client_event_id` hasta recibir `status=ok`.

## 5. Propuesta UI/UX Bento Grid

### App móvil
- **Home bento 2x2**: tarjeta casco conectado, tarjeta fuerza G, tarjeta GPS/privacidad, tarjeta cuenta regresiva.
- **Ajustes**: secciones tipo glass card para Bluetooth, privacidad GPS, tiempo de confirmación y canales de alerta.
- **Impact detail**: hero con severidad, mapa pequeño, diagnóstico IA, contactos notificados y botón “Marcar falsa alarma”.
- **Tokens visuales**: fondo `#050506`, superficies translúcidas, bordes blancos 8–14%, acento lima `#CCFF00`, peligro `#FF3B30`.

### Dashboard web
- **Bento principal**:
  - Mapa grande (col-span-8) con color: verde activo, rojo alerta, gris offline.
  - Centro de notificaciones (col-span-4) con impactos, GPS fallido, conductores sin señal.
  - KPIs: conductores activos, alertas abiertas, latencia WS, tasa de falsas alarmas.
- **Detalle conductor**: ruta Leaflet/Mapbox, gráfico de g-force, timeline de eventos y ficha médica resumida.
- **Admin**: gestión de roles, auditoría de cancelaciones, salud del backend y métricas de cola offline.

## 6. Plan de implementación

### Sprint 0 — Fundaciones
- Normalizar roles `driver/monitor/admin`.
- Definir índices Mongo e idempotencia con `client_event_id`.
- Instrumentar health checks y logs estructurados.

### Sprint 1 — MVP conectado
- Lectura BLE estable desde Arduino/MPU6050.
- Telemetría REST con consentimiento GPS.
- Ajustes móviles para umbral, countdown y GPS.
- Dashboard básico con lista de conductores y WebSocket.

### Sprint 2 — Alertas operables
- Foreground service nativo Android con notificación persistente.
- Acción rápida cancelar y registro `false_alarm`.
- Centro de notificaciones web para impactos y errores de GPS.

### Sprint 3 — Monitoreo avanzado
- Mapa interactivo con estados en tiempo real.
- Historial de ruta y gráfico g-force por conductor.
- Reintentos offline con backoff e idempotencia.

### Sprint 4 — C.R.A.S.H. 2.0 funcional
- RBAC completo, auditoría y métricas Prometheus/OpenTelemetry.
- Hardening de seguridad, rate limiting y rotación de tokens.
- Pruebas E2E de impacto, cancelación y mala señal.
