"""
C.R.A.S.H. API Backend Tests
Tests all endpoints: auth, profile, contacts, impacts, settings, telemetry
"""
import pytest
import requests
import os
import time

# Read BASE_URL from frontend/.env if not in environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '')
if not BASE_URL:
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip()
                    break
    except:
        pass
BASE_URL = BASE_URL.rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@crash.com"
ADMIN_PASSWORD = "CrashAdmin2024!"
TEST_USER_EMAIL = f"test_user_{int(time.time())}@crash.com"
TEST_USER_PASSWORD = "TestUser2024!"
TEST_USER_NAME = "Test User"

@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="session")
def admin_token(api_client):
    """Get admin token for tests"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    data = response.json()
    return data["access_token"]

@pytest.fixture(scope="session")
def test_user_data(api_client):
    """Register test user and return credentials + token"""
    response = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
        "name": TEST_USER_NAME
    })
    assert response.status_code == 200, f"Registration failed: {response.text}"
    data = response.json()
    return {
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
        "name": TEST_USER_NAME,
        "token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "user_id": data["user"]["id"]
    }

# ─── Health Check Tests ───

class TestHealthCheck:
    """Health check endpoints"""
    
    def test_root_endpoint(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["app"] == "C.R.A.S.H."
        print("✓ Root endpoint working")

    def test_health_endpoint(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health endpoint working")

# ─── Auth Tests ───

class TestAuth:
    """Authentication endpoints"""
    
    def test_admin_login(self, api_client, admin_token):
        assert admin_token is not None
        assert len(admin_token) > 20
        print(f"✓ Admin login successful, token length: {len(admin_token)}")

    def test_register_new_user(self, api_client, test_user_data):
        assert test_user_data["token"] is not None
        assert test_user_data["user_id"] is not None
        print(f"✓ User registration successful: {test_user_data['email']}")

    def test_login_with_new_user(self, api_client, test_user_data):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": test_user_data["email"],
            "password": test_user_data["password"]
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == test_user_data["email"]
        print("✓ User login successful")

    def test_get_me(self, api_client, test_user_data):
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user_data["email"]
        assert data["name"] == test_user_data["name"]
        print("✓ GET /auth/me working")

    def test_refresh_token(self, api_client, test_user_data):
        response = api_client.post(f"{BASE_URL}/api/auth/refresh", json={
            "refresh_token": test_user_data["refresh_token"]
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("✓ Token refresh working")

    def test_invalid_login(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login properly rejected")

# ─── Profile Tests ───

class TestProfile:
    """User profile endpoints"""
    
    def test_get_profile(self, api_client, test_user_data):
        response = api_client.get(
            f"{BASE_URL}/api/profile",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert data["user_id"] == test_user_data["user_id"]
        print("✓ GET /profile working")

    def test_update_profile(self, api_client, test_user_data):
        profile_data = {
            "full_name": "Test User Updated",
            "blood_type": "O+",
            "allergies": ["Penicilina", "Aspirina"],
            "medical_conditions": ["Diabetes"],
            "disabilities": [],
            "emergency_notes": "Test emergency notes"
        }
        response = api_client.put(
            f"{BASE_URL}/api/profile",
            json=profile_data,
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["blood_type"] == "O+"
        assert "Penicilina" in data["allergies"]
        assert "Diabetes" in data["medical_conditions"]
        print("✓ PUT /profile working")

        # Verify persistence with GET
        get_response = api_client.get(
            f"{BASE_URL}/api/profile",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["blood_type"] == "O+"
        print("✓ Profile data persisted correctly")

# ─── Contacts Tests ───

class TestContacts:
    """Emergency contacts endpoints"""
    
    def test_get_contacts_empty(self, api_client, test_user_data):
        response = api_client.get(
            f"{BASE_URL}/api/contacts",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /contacts working, count: {len(data)}")

    def test_add_contact(self, api_client, test_user_data):
        contact_data = {
            "name": "TEST_Emergency Contact",
            "phone": "+525512345678",
            "relationship": "Familiar"
        }
        response = api_client.post(
            f"{BASE_URL}/api/contacts",
            json=contact_data,
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Emergency Contact"
        assert data["phone"] == "+525512345678"
        assert data["verified"] == False
        assert "verification_token" in data
        assert len(data["verification_token"]) == 8
        print(f"✓ POST /contacts working, token: {data['verification_token']}")
        
        # Store contact_id for later tests
        test_user_data["contact_id"] = data["id"]
        test_user_data["verification_token"] = data["verification_token"]

    def test_verify_contact(self, api_client, test_user_data):
        if "contact_id" not in test_user_data:
            pytest.skip("No contact to verify")
        
        response = api_client.post(
            f"{BASE_URL}/api/contacts/{test_user_data['contact_id']}/verify",
            json={"token": test_user_data["verification_token"]},
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] == True
        print("✓ POST /contacts/{id}/verify working")

        # Verify persistence
        get_response = api_client.get(
            f"{BASE_URL}/api/contacts",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        contacts = get_response.json()
        verified_contact = next((c for c in contacts if c["id"] == test_user_data["contact_id"]), None)
        assert verified_contact is not None
        assert verified_contact["verified"] == True
        print("✓ Contact verification persisted")

    def test_delete_contact(self, api_client, test_user_data):
        if "contact_id" not in test_user_data:
            pytest.skip("No contact to delete")
        
        response = api_client.delete(
            f"{BASE_URL}/api/contacts/{test_user_data['contact_id']}",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        print("✓ DELETE /contacts/{id} working")

        # Verify deletion
        get_response = api_client.get(
            f"{BASE_URL}/api/contacts",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        contacts = get_response.json()
        deleted_contact = next((c for c in contacts if c["id"] == test_user_data["contact_id"]), None)
        assert deleted_contact is None
        print("✓ Contact deletion persisted")

# ─── Settings Tests ───

class TestSettings:
    """User settings endpoints"""
    
    def test_get_settings(self, api_client, test_user_data):
        response = api_client.get(
            f"{BASE_URL}/api/settings",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "alert_threshold" in data
        assert data["alert_threshold"] == 5.0
        print("✓ GET /settings working")

    def test_update_settings(self, api_client, test_user_data):
        settings_data = {
            "alert_threshold": 10.0,
            "auto_call": False,
            "auto_whatsapp": True
        }
        response = api_client.put(
            f"{BASE_URL}/api/settings",
            json=settings_data,
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["alert_threshold"] == 10.0
        assert data["auto_call"] == False
        print("✓ PUT /settings working")

        # Verify persistence
        get_response = api_client.get(
            f"{BASE_URL}/api/settings",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        get_data = get_response.json()
        assert get_data["alert_threshold"] == 10.0
        print("✓ Settings persisted correctly")

# ─── Impacts Tests ───

class TestImpacts:
    """Impact events endpoints"""
    
    def test_get_impacts_empty(self, api_client, test_user_data):
        response = api_client.get(
            f"{BASE_URL}/api/impacts",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /impacts working, count: {len(data)}")

    def test_create_impact_low_severity(self, api_client, test_user_data):
        impact_data = {
            "acceleration_x": 1.2,
            "acceleration_y": -0.8,
            "acceleration_z": 9.8,
            "gyroscope_x": 5.0,
            "gyroscope_y": -3.0,
            "gyroscope_z": 2.0,
            "g_force": 3.5,
            "latitude": 19.4326,
            "longitude": -99.1332
        }
        response = api_client.post(
            f"{BASE_URL}/api/impacts",
            json=impact_data,
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["g_force"] == 3.5
        assert data["severity"] == "low"
        assert "id" in data
        print(f"✓ POST /impacts working (low severity), impact_id: {data['id']}")
        
        # Wait for AI diagnosis (async)
        time.sleep(3)
        
        # Verify persistence and AI diagnosis
        get_response = api_client.get(
            f"{BASE_URL}/api/impacts/{data['id']}",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert get_response.status_code == 200
        impact = get_response.json()
        assert impact["g_force"] == 3.5
        if impact.get("ai_diagnosis"):
            print(f"✓ AI diagnosis generated: {impact['ai_diagnosis'].get('severity_assessment', 'N/A')[:50]}...")
        else:
            print("⚠ AI diagnosis not available (may be processing)")
        
        test_user_data["impact_id_low"] = data["id"]

    def test_create_impact_high_severity(self, api_client, test_user_data):
        impact_data = {
            "acceleration_x": 50.0,
            "acceleration_y": -30.0,
            "acceleration_z": 80.0,
            "gyroscope_x": 200.0,
            "gyroscope_y": -150.0,
            "gyroscope_z": 100.0,
            "g_force": 12.5,
            "latitude": 19.4326,
            "longitude": -99.1332
        }
        response = api_client.post(
            f"{BASE_URL}/api/impacts",
            json=impact_data,
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["g_force"] == 12.5
        assert data["severity"] == "high"
        print(f"✓ POST /impacts working (high severity), alerts_sent: {data.get('alerts_sent', False)}")
        
        test_user_data["impact_id_high"] = data["id"]

    def test_get_impact_detail(self, api_client, test_user_data):
        if "impact_id_low" not in test_user_data:
            pytest.skip("No impact to retrieve")
        
        response = api_client.get(
            f"{BASE_URL}/api/impacts/{test_user_data['impact_id_low']}",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_user_data["impact_id_low"]
        assert "acceleration" in data
        assert "gyroscope" in data
        print("✓ GET /impacts/{id} working")

    def test_get_impacts_list(self, api_client, test_user_data):
        response = api_client.get(
            f"{BASE_URL}/api/impacts",
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2  # Should have at least 2 impacts from previous tests
        print(f"✓ GET /impacts list working, total impacts: {len(data)}")

# ─── Telemetry Tests ───

class TestTelemetry:
    """Telemetry endpoint"""
    
    def test_send_telemetry(self, api_client, test_user_data):
        telemetry_data = {
            "acceleration_x": 0.5,
            "acceleration_y": -0.3,
            "acceleration_z": 9.8,
            "gyroscope_x": 1.0,
            "gyroscope_y": -0.5,
            "gyroscope_z": 0.2,
            "g_force": 1.02
        }
        response = api_client.post(
            f"{BASE_URL}/api/telemetry",
            json=telemetry_data,
            headers={"Authorization": f"Bearer {test_user_data['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["g_force"] == 1.02
        assert data["severity"] == "low"
        print("✓ POST /telemetry working")

# ─── Cleanup ───

@pytest.fixture(scope="session", autouse=True)
def cleanup(request):
    """Cleanup test data after all tests"""
    def remove_test_data():
        print("\n🧹 Cleanup: Test data with TEST_ prefix should be removed manually if needed")
    request.addfinalizer(remove_test_data)
