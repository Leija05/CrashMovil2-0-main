from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import json
import uuid
import secrets
import httpx
import asyncio
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional

# ─── Config ───
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES"))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-lite")
ALERT_COUNTDOWN_SECONDS = int(os.environ.get("ALERT_COUNTDOWN_SECONDS", "10"))
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_INCIDENTS_TABLE = os.environ.get("SUPABASE_INCIDENTS_TABLE", "incidents")
WHATSAPP_ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_API_VERSION = os.environ.get("WHATSAPP_API_VERSION", "v20.0")
WHATSAPP_COLLISION_TEMPLATE_NAME = os.environ.get("WHATSAPP_COLLISION_TEMPLATE_NAME", "")
WHATSAPP_TEMPLATE_LANGUAGE = os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "es_MX")
WHATSAPP_TEMPLATE_FALLBACK_ON_24H = os.environ.get("WHATSAPP_TEMPLATE_FALLBACK_ON_24H", "true").lower() == "true"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="C.R.A.S.H. API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

class ContactVerifyInput(BaseModel):
    token: str

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

class TelemetryInput(BaseModel):
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float
    gyroscope_x: float
    gyroscope_y: float
    gyroscope_z: float
    g_force: float

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
    token = secrets.token_hex(4).upper()  # 8-char hex token
    contact_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": body.name.strip(),
        "phone": body.phone.strip(),
        "relationship": body.relationship.strip() if body.relationship else "",
        "verified": False,
        "verification_token": token,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.emergency_contacts.insert_one(contact_doc)
    # Try to send WhatsApp verification
    try:
        await send_whatsapp_message(
            body.phone.strip(),
            f"🏍️ C.R.A.S.H. - Verificación de Contacto de Emergencia\n\n"
            f"{user.get('name', 'Un usuario')} te ha agregado como contacto de emergencia.\n\n"
            f"Tu token de verificación es: {token}\n\n"
            f"Responde 'ACEPTO' para confirmar."
        )
    except Exception as e:
        logger.warning(f"WhatsApp send failed (expected in dev): {e}")
    contact_doc.pop("_id", None)
    return contact_doc

@api_router.post("/contacts/{contact_id}/verify")
async def verify_contact(contact_id: str, body: ContactVerifyInput, user: dict = Depends(get_current_user)):
    contact = await db.emergency_contacts.find_one({"id": contact_id, "user_id": user["id"]})
    if not contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    if contact["verification_token"].upper() != body.token.strip().upper():
        raise HTTPException(status_code=400, detail="Token inválido")
    await db.emergency_contacts.update_one(
        {"id": contact_id},
        {"$set": {"verified": True, "verified_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Contacto verificado exitosamente", "verified": True}

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
    settings = await db.user_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    threshold = settings.get("alert_threshold", 5.0) if settings else 5.0

    # Generate AI diagnosis
    diagnosis = None
    if body.g_force > 5:
        try:
            diagnosis = await generate_ai_diagnosis(impact_doc, profile)
            await db.impact_events.update_one(
                {"id": impact_id},
                {"$set": {"ai_diagnosis": diagnosis}}
            )
            impact_doc["ai_diagnosis"] = diagnosis
        except Exception as e:
            logger.error(f"AI diagnosis failed: {e}")

    # Send alerts if above threshold
    if body.g_force >= threshold:
        try:
            if ALERT_COUNTDOWN_SECONDS > 0:
                logger.info(f"Starting emergency countdown ({ALERT_COUNTDOWN_SECONDS}s) for impact {impact_id}")
                await asyncio.sleep(ALERT_COUNTDOWN_SECONDS)
            await send_emergency_alerts(user, impact_doc, profile, diagnosis)
            await db.impact_events.update_one({"id": impact_id}, {"$set": {"alerts_sent": True}})
            impact_doc["alerts_sent"] = True
        except Exception as e:
            logger.error(f"Alert sending failed: {e}")

    impact_doc.pop("_id", None)
    await persist_incident_supabase(user, impact_doc, diagnosis)
    return impact_doc

# ─── Settings Routes ───

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    settings = await db.user_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {"user_id": user["id"], "alert_threshold": 5.0, "auto_call": True, "auto_whatsapp": True}
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
    doc = {
        "user_id": user["id"],
        "acceleration": {"x": body.acceleration_x, "y": body.acceleration_y, "z": body.acceleration_z},
        "gyroscope": {"x": body.gyroscope_x, "y": body.gyroscope_y, "z": body.gyroscope_z},
        "g_force": body.g_force,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.telemetry.insert_one(doc)
    return {"status": "ok", "g_force": body.g_force, "severity": classify_severity(body.g_force)}

# ─── AI Diagnosis (Gemini 2.5 Flash) ───

async def generate_ai_diagnosis(impact: dict, profile: dict | None) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

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

    llm_api_key = EMERGENT_LLM_KEY or GOOGLE_API_KEY
    if not llm_api_key:
        raise ValueError("No hay clave LLM configurada (EMERGENT_LLM_KEY/GOOGLE_API_KEY)")

    chat = LlmChat(
        api_key=llm_api_key,
        session_id=f"diagnosis-{impact.get('id', uuid.uuid4())}",
        system_message=system_msg
    ).with_model("gemini", GEMINI_MODEL or "gemini-1.5-flash")

    response = await chat.send_message(UserMessage(text=prompt))

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

async def persist_incident_supabase(user: dict, impact: dict, diagnosis: dict | None):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    payload = {
        "impact_id": impact.get("id"),
        "user_id": user.get("id"),
        "user_email": user.get("email"),
        "g_force": impact.get("g_force"),
        "severity": impact.get("severity"),
        "severity_label": impact.get("severity_label"),
        "location": impact.get("location"),
        "telemetry": {
            "acceleration": impact.get("acceleration"),
            "gyroscope": impact.get("gyroscope"),
        },
        "diagnosis": diagnosis,
        "created_at": impact.get("created_at"),
    }
    try:
        url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{SUPABASE_INCIDENTS_TABLE}"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        async with httpx.AsyncClient(timeout=8.0) as http_client:
            resp = await http_client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.warning(f"Supabase persist failed: {resp.status_code} - {resp.text}")
    except Exception as exc:
        logger.warning(f"Supabase persist exception: {exc}")

# ─── WhatsApp Service ───

async def send_whatsapp_message(phone: str, message: str):
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
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.post(url, json=payload, headers=headers)
        logger.info(f"WhatsApp response: {resp.status_code} - {resp.text}")
        return resp.json()

async def send_whatsapp_template_message(phone: str, variables: List[str]):
    if not WHATSAPP_COLLISION_TEMPLATE_NAME:
        raise ValueError("WHATSAPP_COLLISION_TEMPLATE_NAME no está configurado")

    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": WHATSAPP_COLLISION_TEMPLATE_NAME,
            "language": {
                "code": WHATSAPP_TEMPLATE_LANGUAGE
            },
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": value} for value in variables]
                }
            ]
        }
    }
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.post(url, json=payload, headers=headers)
        logger.info(f"WhatsApp template response: {resp.status_code} - {resp.text}")
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"Error enviando plantilla WhatsApp: {resp.text}")
        return resp.json()

async def send_emergency_alerts(user: dict, impact: dict, profile: dict | None, diagnosis: dict | None):
    contacts = await db.emergency_contacts.find(
        {"user_id": user["id"], "verified": True}
    ).to_list(50)

    if not contacts:
        logger.warning("No verified contacts to alert")
        return

    location_str = ""
    if impact.get("location") and impact["location"].get("latitude"):
        lat = impact["location"]["latitude"]
        lon = impact["location"]["longitude"]
        location_str = f"📍 Ubicación: https://maps.google.com/?q={lat},{lon}\n"

    diagnosis_summary = "Sin diagnóstico IA disponible"
    recommendation_summary = "Comunícate de inmediato con el usuario y servicios de emergencia."
    if diagnosis:
        diagnosis_summary = diagnosis.get("severity_assessment") or diagnosis_summary
        recs = diagnosis.get("emergency_recommendations") or []
        if isinstance(recs, list) and recs:
            recommendation_summary = recs[0]

    location_url = "Ubicación no disponible"
    if impact.get("location") and impact["location"].get("latitude"):
        lat = impact["location"]["latitude"]
        lon = impact["location"]["longitude"]
        location_url = f"https://maps.google.com/?q={lat},{lon}"

    message = (
        f"🚨 ALERTA DE EMERGENCIA C.R.A.S.H. 🚨\n\n"
        f"Se ha detectado un impacto de {impact['g_force']:.1f}G ({impact['severity_label']})\n"
        f"Fecha: {impact['created_at']}\n\n"
        f"{location_str}"
        f"🏥 Diagnóstico IA:\n"
        f"Severidad: {diagnosis_summary}\n"
        f"Recomendación: {recommendation_summary}\n\n"
        f"Por favor, contacte a {user.get('name', 'el usuario')} inmediatamente."
    )

    for contact in contacts:
        try:
            template_vars = [
                impact.get("severity_label", "N/A"),
                diagnosis_summary,
                recommendation_summary,
                location_url
            ]
            try:
                await send_whatsapp_template_message(contact["phone"], template_vars)
            except Exception as template_error:
                logger.warning(f"Template send failed for {contact['phone']}: {template_error}")
                if WHATSAPP_TEMPLATE_FALLBACK_ON_24H:
                    await send_whatsapp_message(contact["phone"], message)
                else:
                    raise template_error
            logger.info(f"Alert sent to {contact['name']} ({contact['phone']})")
        except Exception as e:
            logger.error(f"Failed to alert {contact['name']}: {e}")

# ─── Health Check ───

@api_router.get("/")
async def root():
    return {"status": "ok", "app": "C.R.A.S.H.", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "database": "connected"}

# ─── Startup ───

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.emergency_contacts.create_index("user_id")
    await db.impact_events.create_index("user_id")
    await db.telemetry.create_index("user_id")
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
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
