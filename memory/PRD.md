# C.R.A.S.H. - Collision Response & Alert Safety Hub

## Product Overview
Motorcycle safety application that connects a smart helmet (Arduino Nano + MPU-6050) with a robust backend infrastructure for real-time crash detection, AI medical diagnosis, and emergency alerts.

## Architecture
- **Backend**: FastAPI + MongoDB (crash_database)
- **Frontend**: Expo Router (React Native) with dark tactical theme
- **AI**: Gemini 2.5 Flash via Emergent LLM Key for medical diagnosis
- **Alerts**: WhatsApp Business API (Meta Graph API)
- **Auth**: JWT (email/password with bcrypt)

## Features

### 1. Authentication
- JWT-based registration and login
- Bearer token stored in AsyncStorage
- Admin seeded: admin@crash.com

### 2. Dashboard (Real-time Telemetry)
- G-Force display with severity color coding
- Acceleration (X, Y, Z) and Gyroscope (X, Y, Z) metric cards
- Bluetooth connection status
- Simulation mode for testing without hardware

### 3. Impact History & AI Diagnosis
- Impact events logged with telemetry data
- Severity classification: Low (<5G), Medium (5-10G), High (10-15G), Critical (>15G)
- AI diagnosis via Gemini 2.5 Flash generates:
  - Severity assessment
  - Possible injuries list
  - First aid steps
  - Emergency recommendations
  - Priority level

### 4. Emergency Contacts
- CRUD for emergency contacts
- 8-character verification tokens sent via WhatsApp
- Opt-in verification: contact responds "ACEPTO" or user enters token
- Only verified contacts receive emergency alerts

### 5. Medical Profile
- Full name, blood type, allergies, medical conditions, disabilities
- Emergency notes for first responders
- Data fed to AI for personalized diagnosis

### 6. Settings
- Configurable alert threshold (G-force level)
- Auto-call toggle
- Auto-WhatsApp toggle
- Quick preset buttons (Low 5G, Medium 10G, High 15G, Critical 20G)

### 7. Bluetooth Service
- HC-05 (Classic) and HC-10 (BLE) support
- Arduino data format parser
- Simulation mode for testing

## API Endpoints
- POST /api/auth/register, /api/auth/login, GET /api/auth/me
- GET/PUT /api/profile
- GET/POST/DELETE /api/contacts, POST /api/contacts/{id}/verify
- GET/POST /api/impacts, GET /api/impacts/{id}
- GET/PUT /api/settings
- POST /api/telemetry

## Database Collections
- users, user_profiles, user_settings
- emergency_contacts, impact_events, telemetry

## WhatsApp Integration
- Uses Meta Graph API (dev credentials in .env)
- Ready for production with real WhatsApp Business credentials
- Sends emergency alerts with GPS location + AI diagnosis

## Tech Stack
- Backend: Python 3.11, FastAPI, Motor (MongoDB), bcrypt, PyJWT, httpx
- Frontend: Expo SDK 54, React Native, Expo Router, AsyncStorage
- AI: emergentintegrations library with Gemini 2.5 Flash
