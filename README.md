# CrashMovil 2.0

## Opción gratis recomendada (para uso público con internet)

La mejor opción **gratis** y simple para que cualquier persona use la app móvil y envíe datos al backend es:

- **Backend en Render (free web service)**
- **Base de datos en MongoDB Atlas M0 (free tier)**

> Nota: en planes gratis puede haber “sleep” por inactividad, pero funciona para pruebas reales sin costo.

---

## 1) Desplegar backend gratis en Render

Este repo incluye `render.yaml` para desplegar el backend FastAPI.

### Variables de entorno mínimas en Render

- `MONGO_URL` = URI de Atlas (M0)
- `DB_NAME` = `crash_database` (o el nombre que uses)
- `JWT_SECRET` = una clave larga/segura
- `JWT_ALGORITHM` = `HS256`
- `JWT_EXPIRE_MINUTES` = `60`
- `ALLOWED_ORIGINS` = `*` (pruebas) o `https://tu-web.com,https://tu-app-web.com`

Si usas WhatsApp/IA, agrega también esas llaves opcionales.

---

## 2) MongoDB Atlas gratis

1. Crea clúster M0.
2. Crea usuario DB.
3. Permite acceso de red (`0.0.0.0/0`) para pruebas rápidas.
4. Copia `mongodb+srv://...` como `MONGO_URL`.

---

## 3) Conectar la app móvil al backend público

En la app Expo/React Native, define:

- `EXPO_PUBLIC_BACKEND_URL=https://tu-backend.onrender.com`

Con eso, cualquier usuario con internet puede autenticarse y enviar telemetría al backend público.

---

## 4) Recomendaciones de producción (sin costo inicial)

- Mantén `ALLOWED_ORIGINS` restringido cuando pases de pruebas.
- Usa `JWT_SECRET` fuerte y rótalo periódicamente.
- Monitorea errores 4xx/5xx en Render logs.
- Mantén TTL e historial de ubicación ligero para no saturar la base.
