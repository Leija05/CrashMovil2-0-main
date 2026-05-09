from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from fastapi.responses import PlainTextResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
import os
import logging
import bcrypt
import jwt
import json
import uuid
import httpx
import hmac
import hashlib
import asyncio
from datetime import datetime, timezone, timedelta
from math import radians, sin, cos, sqrt, atan2
from pydantic import BaseModel, Field
from typing import List, Optional


# ─── Config ───
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES"))
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"
WHATSAPP_ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_API_VERSION = os.environ.get("WHATSAPP_API_VERSION", "v20.0")
WHATSAPP_WEBHOOK_VERIFY_TOKEN = os.environ.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")
WHATSAPP_APP_SECRET = os.environ.get("WHATSAPP_APP_SECRET", "")
WHATSAPP_COLLISION_TEMPLATE_NAME = os.environ.get("WHATSAPP_COLLISION_TEMPLATE_NAME", "")
WHATSAPP_TEMPLATE_LANGUAGE = os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "es_MX")
WHATSAPP_TEMPLATE_FALLBACK_ON_24H = os.environ.get("WHATSAPP_TEMPLATE_FALLBACK_ON_24H", "true").lower() == "true"
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
COHERE_API_KEY = os.environ.get("COHERE_API_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="C.R.A.S.H. API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Evita ráfagas de alertas duplicadas por múltiples POST /impacts casi simultáneos.
impact_alert_locks: dict[str, asyncio.Lock] = {}
last_alert_sent_at: dict[str, datetime] = {}
ALERT_COOLDOWN_SECONDS = 25

# ─── Pydantic Models ───

class RegisterInput(BaseModel):
    email: str
    password: str
    name: str

class LoginInput(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str

class ProfileInput(BaseModel):
    full_name: Optional[str] = ""
    blood_type: Optional[str] = ""
    allergies: Optional[List[str]] = []
    medical_conditions: Optional[List[str]] = []
    disabilities: Optional[List[str]] = []
    emergency_notes: Optional[str] = ""

class ContactInput(BaseModel):
    name: str
    phone: str
    relationship: Optional[str] = ""

class ImpactInput(BaseModel):
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float
    gyroscope_x: float
    gyroscope_y: float
    gyroscope_z: float
    g_force: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ThresholdInput(BaseModel):
    alert_threshold: float = 5.0
    auto_call: Optional[bool] = True
    auto_whatsapp: Optional[bool] = True
    location_tracking_enabled: Optional[bool] = True

class TelemetryInput(BaseModel):
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float
    gyroscope_x: float
    gyroscope_y: float
    gyroscope_z: float
    g_force: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gps_accuracy_m: Optional[float] = None
    helmet_connected: Optional[bool] = None
    client_event_id: Optional[str] = None

# ─── Auth Helpers ───

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.headers.get("Authorization", "")
    if token.startswith("Bearer "):
        token = token[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        del user["_id"]
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def classify_severity(g_force: float) -> str:
    if g_force < 5:
        return "low"
    elif g_force < 10:
        return "medium"
    elif g_force < 15:
        return "high"
    return "critical"

def severity_label(sev: str) -> str:
    return {"low": "Bajo", "medium": "Medio", "high": "Alto", "critical": "Crítico"}.get(sev, sev)

# ─── Auth Routes ───

@api_router.post("/auth/register")
async def register(body: RegisterInput):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    user_doc = {
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    # Create default profile
    await db.user_profiles.insert_one({
        "user_id": user_id,
        "full_name": body.name.strip(),
        "blood_type": "",
        "allergies": [],
        "medical_conditions": [],
        "disabilities": [],
        "emergency_notes": "",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    # Create default settings
    await db.user_settings.insert_one({
        "user_id": user_id,
        "alert_threshold": 5.0,
        "auto_call": True,
        "auto_whatsapp": True,
        "location_tracking_enabled": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "user": {"id": user_id, "email": email, "name": body.name.strip(), "role": "user", "created_at": user_doc["created_at"]}
    }

@api_router.post("/auth/login")
async def login(body: LoginInput):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    user_id = str(user["_id"])
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "user": {"id": user_id, "email": user["email"], "name": user["name"], "role": user["role"], "created_at": user.get("created_at", "")}
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"], "created_at": user.get("created_at", "")}

@api_router.post("/auth/refresh")
async def refresh_token(request: Request):
    body = await request.json()
    token = body.get("refresh_token", "")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user_id = str(user["_id"])
        access = create_access_token(user_id, user["email"])
        return {"access_token": access}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# ─── Profile Routes ───

@api_router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    profile = await db.user_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not profile:
        profile = {"user_id": user["id"], "full_name": user.get("name", ""), "blood_type": "", "allergies": [], "medical_conditions": [], "disabilities": [], "emergency_notes": ""}
    return profile

@api_router.put("/profile")
async def update_profile(body: ProfileInput, user: dict = Depends(get_current_user)):
    update_data = body.dict()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.user_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": update_data},
        upsert=True
    )
    profile = await db.user_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return profile

# ─── Emergency Contacts Routes ───

@api_router.get("/contacts")
async def get_contacts(user: dict = Depends(get_current_user)):
    contacts = await db.emergency_contacts.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return contacts

@api_router.post("/contacts")
async def add_contact(body: ContactInput, user: dict = Depends(get_current_user)):
    whatsapp_validation = await validate_whatsapp_contact(body.phone.strip())
    contact_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": body.name.strip(),
        "phone": body.phone.strip(),
        "relationship": body.relationship.strip() if body.relationship else "",
        "verified": True,
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "whatsapp_validation": whatsapp_validation,
    }
    await db.emergency_contacts.insert_one(contact_doc)
    contact_doc.pop("_id", None)
    return contact_doc

@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    result = await db.emergency_contacts.delete_one({"id": contact_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    return {"message": "Contacto eliminado"}

# ─── Impact Events Routes ───

@api_router.get("/impacts")
async def get_impacts(user: dict = Depends(get_current_user)):
    impacts = await db.impact_events.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return impacts

@api_router.get("/impacts/{impact_id}")
async def get_impact(impact_id: str, user: dict = Depends(get_current_user)):
    impact = await db.impact_events.find_one({"id": impact_id, "user_id": user["id"]}, {"_id": 0})
    if not impact:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return impact

@api_router.post("/impacts")
async def create_impact(body: ImpactInput, user: dict = Depends(get_current_user)):
    severity = classify_severity(body.g_force)
    impact_id = str(uuid.uuid4())
    impact_doc = {
        "id": impact_id,
        "user_id": user["id"],
        "acceleration": {"x": body.acceleration_x, "y": body.acceleration_y, "z": body.acceleration_z},
        "gyroscope": {"x": body.gyroscope_x, "y": body.gyroscope_y, "z": body.gyroscope_z},
        "g_force": body.g_force,
        "severity": severity,
        "severity_label": severity_label(severity),
        "location": {"latitude": body.latitude, "longitude": body.longitude} if body.latitude else None,
        "ai_diagnosis": None,
        "alerts_sent": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.impact_events.insert_one(impact_doc)

    # Get user profile for AI diagnosis
    profile = await db.user_profiles.find_one({"user_id": user["id"]}, {"_id": 0})

    # Generate AI diagnosis
    diagnosis = None
    try:
        diagnosis = await generate_ai_diagnosis(impact_doc, profile)
        await db.impact_events.update_one(
            {"id": impact_id},
            {"$set": {"ai_diagnosis": diagnosis}}
        )
        impact_doc["ai_diagnosis"] = diagnosis
    except Exception as e:
        logger.error(f"AI diagnosis failed: {e}")

    # Send alerts for every impact event (threshold is controlled by frontend)
    contact_count = await db.emergency_contacts.count_documents({"user_id": user["id"], "verified": True})
    if contact_count == 0:
        msg = "No tienes contactos de emergencia verificados"
        logger.warning(msg)
        await db.impact_events.update_one({"id": impact_id}, {"$set": {"alerts_sent": False, "alert_error": msg, "alerted_contacts": []}})
        impact_doc["alerts_sent"] = False
        impact_doc["alerted_contacts"] = []
        impact_doc["alert_error"] = msg
        impact_doc.pop("_id", None)
        return impact_doc

    user_id = user["id"]
    lock = impact_alert_locks.setdefault(user_id, asyncio.Lock())
    async with lock:
        last_sent = last_alert_sent_at.get(user_id)
        now = datetime.now(timezone.utc)
        if last_sent and (now - last_sent).total_seconds() < ALERT_COOLDOWN_SECONDS:
            msg = f"Alerta duplicada suprimida: ya se notificó un impacto en los últimos {ALERT_COOLDOWN_SECONDS} segundos."
            # Eliminamos el registro duplicado para no ensuciar el historial con el mismo evento.
            await db.impact_events.delete_one({"id": impact_id, "user_id": user_id})
            impact_doc["alerts_sent"] = True
            impact_doc["alerted_contacts"] = []
            impact_doc["alert_error"] = None
            impact_doc["deduplicated"] = True
            impact_doc["deduplication_reason"] = msg
            impact_doc.pop("_id", None)
            return impact_doc

        try:
            alerted_contacts = await send_emergency_alerts(user, impact_doc, profile, diagnosis)
            if alerted_contacts:
                last_alert_sent_at[user_id] = now
                await db.impact_events.update_one({"id": impact_id}, {"$set": {"alerts_sent": True, "alerted_contacts": alerted_contacts}})
                impact_doc["alerts_sent"] = True
                impact_doc["alerted_contacts"] = alerted_contacts
            else:
                msg = "No hubo contactos notificados en esta ejecución."
                await db.impact_events.update_one({"id": impact_id}, {"$set": {"alerts_sent": False, "alerted_contacts": [], "alert_error": None, "delivery_note": msg}})
                impact_doc["alerts_sent"] = False
                impact_doc["alerted_contacts"] = []
                impact_doc["alert_error"] = None
                impact_doc["delivery_note"] = msg
        except Exception as e:
            msg = f"Error al enviar alertas WhatsApp: {e}"
            logger.error(f"Alert sending failed: {e}")
            await db.impact_events.update_one({"id": impact_id}, {"$set": {"alerts_sent": False, "alerted_contacts": [], "alert_error": msg}})
            impact_doc["alerts_sent"] = False
            impact_doc["alerted_contacts"] = []
            impact_doc["alert_error"] = msg

    impact_doc.pop("_id", None)
    return impact_doc

# ─── Settings Routes ───

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    settings = await db.user_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {"user_id": user["id"], "alert_threshold": 5.0, "auto_call": True, "auto_whatsapp": True, "location_tracking_enabled": True}
    return settings

@api_router.put("/settings")
async def update_settings(body: ThresholdInput, user: dict = Depends(get_current_user)):
    update_data = body.dict()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.user_settings.update_one(
        {"user_id": user["id"]},
        {"$set": update_data},
        upsert=True
    )
    settings = await db.user_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    return settings

# ─── Telemetry Route ───

@api_router.post("/telemetry")
async def receive_telemetry(body: TelemetryInput, user: dict = Depends(get_current_user)):
    settings = await db.user_settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    track_location = settings.get("location_tracking_enabled", True)
    location = None
    if track_location and body.latitude is not None and body.longitude is not None:
        location = {
            "latitude": body.latitude,
            "longitude": body.longitude,
            "gps_accuracy_m": body.gps_accuracy_m
        }

    client_event_id = body.client_event_id or f"telemetry-{uuid.uuid4()}"
    doc = {
        "user_id": user["id"],
        "client_event_id": client_event_id,
        "acceleration": {"x": body.acceleration_x, "y": body.acceleration_y, "z": body.acceleration_z},
        "gyroscope": {"x": body.gyroscope_x, "y": body.gyroscope_y, "z": body.gyroscope_z},
        "g_force": body.g_force,
        "helmet_connected": body.helmet_connected,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    try:
        await db.telemetry.insert_one(doc)
    except DuplicateKeyError:
        return {
            "status": "duplicate_ignored",
            "g_force": body.g_force,
            "severity": classify_severity(body.g_force),
            "location_tracking_enabled": track_location
        }
    if location:
        latest_live = await db.user_live_locations.find_one({"user_id": user["id"]}, {"_id": 0})
        await db.user_live_locations.update_one(
            {"user_id": user["id"]},
            {"$set": {
                "user_id": user["id"],
                "location": location,
                "helmet_connected": body.helmet_connected,
                "g_force": body.g_force,
                "timestamp": doc["timestamp"]
            }},
            upsert=True
        )

        # Guardar historial ligero solo si hay cambio relevante (anti-saturación).
        should_store_history = False
        if not latest_live or not latest_live.get("location"):
            should_store_history = True
        else:
            prev = latest_live["location"]
            prev_lat = prev.get("latitude")
            prev_lon = prev.get("longitude")
            curr_lat = location.get("latitude")
            curr_lon = location.get("longitude")
            if prev_lat is not None and prev_lon is not None and curr_lat is not None and curr_lon is not None:
                r = 6371000.0
                dlat = radians(curr_lat - prev_lat)
                dlon = radians(curr_lon - prev_lon)
                a = sin(dlat / 2) ** 2 + cos(radians(prev_lat)) * cos(radians(curr_lat)) * sin(dlon / 2) ** 2
                c = 2 * atan2(sqrt(a), sqrt(1 - a))
                distance_m = r * c
                should_store_history = distance_m >= 25

                prev_ts_raw = latest_live.get("timestamp")
                if prev_ts_raw:
                    try:
                        prev_ts = datetime.fromisoformat(prev_ts_raw)
                        now_ts = datetime.fromisoformat(doc["timestamp"])
                        elapsed_seconds = (now_ts - prev_ts).total_seconds()
                        if elapsed_seconds >= 60:
                            should_store_history = True
                    except Exception:
                        pass

        if should_store_history:
            await db.location_history.insert_one({
                "user_id": user["id"],
                "location": location,
                "helmet_connected": body.helmet_connected,
                "g_force": body.g_force,
                "timestamp": doc["timestamp"]
            })
    return {"status": "ok", "g_force": body.g_force, "severity": classify_severity(body.g_force), "location_tracking_enabled": track_location}

@api_router.get("/tracking/live")
async def get_live_tracking(user: dict = Depends(get_current_user)):
    latest = await db.user_live_locations.find_one({"user_id": user["id"]}, {"_id": 0})
    if latest:
        return latest
    telemetry = await db.telemetry.find_one({"user_id": user["id"], "location": {"$ne": None}}, {"_id": 0}, sort=[("timestamp", -1)])
    if telemetry:
        return {
            "user_id": user["id"],
            "location": telemetry.get("location"),
            "helmet_connected": telemetry.get("helmet_connected"),
            "g_force": telemetry.get("g_force"),
            "timestamp": telemetry.get("timestamp")
        }
    return {"user_id": user["id"], "location": None, "helmet_connected": False, "g_force": None, "timestamp": None}

# ─── AI Diagnosis (Gemini 2.5 Flash) ───

async def generate_ai_diagnosis(impact: dict, profile: dict | None) -> dict:
    profile_info = ""
    if profile:
        profile_info = (
            f"Nombre: {profile.get('full_name', 'N/A')}\n"
            f"Tipo de sangre: {profile.get('blood_type', 'N/A')}\n"
            f"Alergias: {', '.join(profile.get('allergies', [])) or 'Ninguna'}\n"
            f"Condiciones médicas: {', '.join(profile.get('medical_conditions', [])) or 'Ninguna'}\n"
            f"Discapacidades: {', '.join(profile.get('disabilities', [])) or 'Ninguna'}\n"
            f"Notas de emergencia: {profile.get('emergency_notes', 'N/A')}"
        )

    system_msg = (
        "Eres un asistente médico de emergencia especializado en accidentes de motocicleta. "
        "Analiza los datos de telemetría del impacto y el perfil médico del usuario. "
        "Responde SIEMPRE en formato JSON válido con las siguientes claves: "
        "severity_assessment (string), possible_injuries (array de strings), "
        "first_aid_steps (array de strings), emergency_recommendations (array de strings), "
        "priority_level (string: bajo/medio/alto/crítico). "
        "No incluyas markdown, solo JSON puro."
    )

    prompt = (
        f"DATOS DEL IMPACTO:\n"
        f"- Fuerza G: {impact.get('g_force', 0):.2f}G\n"
        f"- Severidad: {impact.get('severity_label', 'N/A')}\n"
        f"- Aceleración: X={impact['acceleration']['x']:.2f}, Y={impact['acceleration']['y']:.2f}, Z={impact['acceleration']['z']:.2f}\n"
        f"- Giroscopio: X={impact['gyroscope']['x']:.2f}, Y={impact['gyroscope']['y']:.2f}, Z={impact['gyroscope']['z']:.2f}\n"
        f"- Ubicación: {'Lat ' + str(impact['location']['latitude']) + ', Lon ' + str(impact['location']['longitude']) if impact.get('location') else 'No disponible'}\n\n"
        f"PERFIL MÉDICO DEL USUARIO:\n{profile_info or 'No disponible'}\n\n"
        f"Genera el diagnóstico de emergencia en JSON."
    )

    combined_prompt = f"{system_msg}\n\n{prompt}"
    response = None
    last_error = None

    # Probar 3 IAs en cadena: Gemini -> Groq -> Cohere
    for provider in ["gemini", "groq", "cohere"]:
        try:
            if provider == "gemini":
                if not GOOGLE_API_KEY:
                    raise RuntimeError("GOOGLE_API_KEY no configurada")
                from google import genai
                client = genai.Client(api_key=GOOGLE_API_KEY)
                gemini_resp = await asyncio.to_thread(
                    client.models.generate_content,
                    model=GEMINI_MODEL,
                    contents=combined_prompt
                )
                response = (getattr(gemini_resp, "text", "") or "").strip()

            elif provider == "groq":
                if not GROQ_API_KEY:
                    raise RuntimeError("GROQ_API_KEY no configurada")
                async with httpx.AsyncClient(timeout=30.0) as http_client:
                    groq_resp = await http_client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {GROQ_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "llama-3.1-8b-instant",
                            "temperature": 0.2,
                            "messages": [
                                {"role": "system", "content": system_msg},
                                {"role": "user", "content": prompt},
                            ],
                        },
                    )
                    groq_resp.raise_for_status()
                    data = groq_resp.json()
                    response = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()

            else:
                if not COHERE_API_KEY:
                    raise RuntimeError("COHERE_API_KEY no configurada")
                async with httpx.AsyncClient(timeout=30.0) as http_client:
                    cohere_resp = await http_client.post(
                        "https://api.cohere.com/v2/chat",
                        headers={
                            "Authorization": f"Bearer {COHERE_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "command-r-plus",
                            "temperature": 0.2,
                            "messages": [
                                {"role": "system", "content": system_msg},
                                {"role": "user", "content": prompt},
                            ],
                        },
                    )
                    cohere_resp.raise_for_status()
                    data = cohere_resp.json()
                    message_content = (data.get("message") or {}).get("content") or []
                    response = (message_content[0].get("text", "") if message_content else "").strip()

            if response:
                logger.info(f"AI diagnosis generated with {provider}")
                break
        except Exception as exc:
            last_error = exc
            logger.warning(f"AI provider {provider} failed: {exc}")

    if not response:
        raise RuntimeError(f"All AI providers failed. Last error: {last_error}")

    try:
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "severity_assessment": f"Impacto de {impact.get('g_force', 0):.1f}G clasificado como {impact.get('severity_label', 'N/A')}",
            "possible_injuries": ["Evaluación no disponible - consulte a un profesional médico"],
            "first_aid_steps": ["Llamar a servicios de emergencia", "No mover al paciente", "Mantener vías aéreas despejadas"],
            "emergency_recommendations": ["Activar servicios de emergencia 911"],
            "priority_level": impact.get("severity", "medio"),
            "raw_response": response
        }

# ─── WhatsApp Service ───

async def send_whatsapp_message(phone: str, message: str, template_params: Optional[List[str]] = None):
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message}
    }
    using_template = bool(WHATSAPP_COLLISION_TEMPLATE_NAME)
    if using_template:
        components = []
        if template_params:
            components = [{
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in template_params]
            }]
        payload = {
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "template",
            "template": {
                "name": WHATSAPP_COLLISION_TEMPLATE_NAME,
                "language": {"code": WHATSAPP_TEMPLATE_LANGUAGE},
                **({"components": components} if components else {})
            }
        }

    async with httpx.AsyncClient() as http_client:
        resp = await http_client.post(url, json=payload, headers=headers)
        logger.info(f"WhatsApp response: {resp.status_code} - {resp.text}")
        response_json = resp.json() if resp.text else {}
        error_code = (((response_json or {}).get("error") or {}).get("code"))

        # Error 131047 = fuera de ventana de 24h: solo se permite plantilla.
        # Si se usó plantilla y aún falla, devolvemos error directo.
        if resp.status_code >= 400 and error_code == 131047:
            raise HTTPException(status_code=resp.status_code, detail=f"WhatsApp 24h window error: {resp.text}")

        # Fallback a texto solo para errores que NO sean de ventana 24h y
        # únicamente cuando NO se requiere plantilla para re-contacto.
        if resp.status_code >= 400 and using_template and WHATSAPP_TEMPLATE_FALLBACK_ON_24H and error_code not in (131047,):
            fallback_payload = {
                "messaging_product": "whatsapp",
                "to": phone,
                "type": "text",
                "text": {"body": message}
            }
            fallback_resp = await http_client.post(url, json=fallback_payload, headers=headers)
            logger.info(f"WhatsApp fallback response: {fallback_resp.status_code} - {fallback_resp.text}")
            if fallback_resp.status_code < 400:
                return fallback_resp.json()
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"WhatsApp API error: {resp.text}")
        return resp.json()

async def validate_whatsapp_contact(phone: str) -> dict:
    """
    Valida si un teléfono existe en WhatsApp usando el endpoint /contacts.
    Nota: en modo desarrollo de Meta, esto NO registra automáticamente el número
    en la lista permitida; solo valida formato/existencia en WhatsApp.
    """
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/contacts"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {"blocking": "wait", "contacts": [phone], "force_check": True}
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.post(url, json=payload, headers=headers)
        if resp.status_code >= 400:
            return {
                "checked": False,
                "is_whatsapp_user": False,
                "can_receive_in_dev_mode": False,
                "reason": f"No se pudo validar en WhatsApp API: {resp.text}",
            }
        data = resp.json() if resp.text else {}
        first = ((data.get("contacts") or [{}])[0]) if isinstance(data, dict) else {}
        status = first.get("status")
        is_valid = status == "valid"
        return {
            "checked": True,
            "is_whatsapp_user": is_valid,
            # Importante: validación != aprobado en lista de recipients de modo desarrollo.
            "can_receive_in_dev_mode": False,
            "status": status or "unknown",
            "wa_id": first.get("wa_id"),
            "reason": (
                "Número válido en WhatsApp, pero en modo desarrollo debes agregarlo manualmente en "
                "Meta Dashboard > WhatsApp > API Setup > Add recipient phone number."
            ),
        }

def build_diagnosis_summary(diagnosis: dict | None) -> str:
    if not diagnosis:
        return "Sin diagnóstico IA disponible."

    severity = diagnosis.get("severity_assessment", "N/A")
    priority = diagnosis.get("priority_level", "N/A")
    injuries = diagnosis.get("possible_injuries") or []
    recommendation = (diagnosis.get("emergency_recommendations") or ["Contactar servicios de emergencia"])[0]
    injuries_text = ", ".join(injuries[:2]) if injuries else "No especificadas"

    return (
        f"Severidad: {severity}. "
        f"Prioridad: {priority}. "
        f"Lesiones posibles: {injuries_text}. "
        f"Acción recomendada: {recommendation}."
    )

async def send_emergency_alerts(user: dict, impact: dict, profile: dict | None, diagnosis: dict | None):
    contacts = await db.emergency_contacts.find(
        {"user_id": user["id"], "verified": True}
    ).to_list(50)

    if not contacts:
        logger.warning("No verified contacts to alert")
        return []

    location_str = ""
    if impact.get("location") and impact["location"].get("latitude"):
        lat = impact["location"]["latitude"]
        lon = impact["location"]["longitude"]
        location_str = f"📍 Ubicación: https://maps.google.com/?q={lat},{lon}\n"

    diagnosis_summary = build_diagnosis_summary(diagnosis)
    diagnosis_str = f"🏥 Diagnóstico IA (resumen):\n{diagnosis_summary}\n"

    message = (
        f"🚨 ALERTA DE EMERGENCIA C.R.A.S.H. 🚨\n\n"
        f"Se ha detectado un impacto de {impact['g_force']:.1f}G ({impact['severity_label']})\n"
        f"Fecha: {impact['created_at']}\n\n"
        f"{location_str}"
        f"{diagnosis_str}\n"
        f"Por favor, contacte a {user.get('name', 'el usuario')} inmediatamente."
    )

    # Evita múltiples envíos al mismo número si hay contactos duplicados.
    unique_contacts = []
    seen_phones = set()
    for contact in contacts:
        phone = (contact.get("phone") or "").strip()
        if not phone or phone in seen_phones:
            continue
        seen_phones.add(phone)
        unique_contacts.append(contact)

    alerted_contacts = []
    template_values = [
        impact.get("severity_label", "N/A"),
        diagnosis_summary,
        (diagnosis.get("emergency_recommendations") or ["Contactar servicios de emergencia"])[0] if diagnosis else "Contactar servicios de emergencia",
        f"https://maps.google.com/?q={impact['location']['latitude']},{impact['location']['longitude']}" if impact.get("location") and impact["location"].get("latitude") else "Ubicación no disponible"
    ]
    for contact in unique_contacts:
        try:
            await send_whatsapp_message(contact["phone"], message, template_params=template_values)
            logger.info(f"Alert sent to {contact['name']} ({contact['phone']})")
            alerted_contacts.append({"id": contact.get("id"), "name": contact.get("name"), "phone": contact.get("phone")})
        except Exception as e:
            logger.error(f"Failed to alert {contact['name']}: {e}")
    return alerted_contacts

# ─── Health Check ───

@api_router.get("/")
async def root():
    return {"status": "ok", "app": "C.R.A.S.H.", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "database": "connected"}

# ─── WhatsApp Webhook ───

@app.get("/webhook/whatsapp")
async def whatsapp_webhook_verify(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == WHATSAPP_WEBHOOK_VERIFY_TOKEN and challenge:
        logger.info("WhatsApp webhook verificado correctamente")
        return PlainTextResponse(content=challenge)
    logger.warning("Intento de verificación webhook inválido")
    raise HTTPException(status_code=403, detail="Webhook verification failed")

@app.post("/webhook/whatsapp")
async def whatsapp_webhook_receive(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    if WHATSAPP_APP_SECRET and signature.startswith("sha256="):
        expected_hash = hmac.new(
            WHATSAPP_APP_SECRET.encode("utf-8"),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature[7:], expected_hash):
            logger.warning("Firma inválida en webhook de WhatsApp")
            raise HTTPException(status_code=403, detail="Invalid webhook signature")

    payload = json.loads(raw_body.decode("utf-8"))
    logger.info(f"WhatsApp webhook event: {json.dumps(payload)}")
    return {"status": "received"}

# ─── Startup ───

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.emergency_contacts.create_index("user_id")
    await db.impact_events.create_index("user_id")
    await db.telemetry.create_index("user_id")
    await db.location_history.create_index("user_id")
    await db.location_history.create_index("timestamp", expireAfterSeconds=86400)
    await db.user_live_locations.create_index("user_id", unique=True)
    await db.user_profiles.create_index("user_id")
    await db.user_settings.create_index("user_id")
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@crash.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "CrashAdmin2024!")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin user seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Admin password updated")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
