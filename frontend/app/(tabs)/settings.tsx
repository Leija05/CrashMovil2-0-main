import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING, severityColor } from '../../src/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useAppSettings } from '../../src/context/AppSettingsContext';
import { useBluetooth } from '../../src/context/BluetoothContext';
import { settingsAPI } from '../../src/services/api';

export default function SettingsScreen() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { deviceName, setDeviceName, notifyAlertsConfigChanged } = useAppSettings();
  const { connected, deviceName: liveDevice, disconnect, nativeAvailable } = useBluetooth();

  const [threshold, setThreshold] = useState('5');
  const [autoCall, setAutoCall] = useState(true);
  const [autoWhatsapp, setAutoWhatsapp] = useState(true);
  const [countdownSeconds, setCountdownSeconds] = useState('8');
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(true);
  const [deviceInput, setDeviceInput] = useState(deviceName);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDeviceInput(deviceName); }, [deviceName]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const s = await settingsAPI.get(token);
      setThreshold(String(s.alert_threshold ?? 5));
      setAutoCall(s.auto_call !== false);
      setAutoWhatsapp(s.auto_whatsapp !== false);
      setCountdownSeconds(String(s.countdown_seconds ?? 8));
      setLocationTrackingEnabled(s.location_tracking_enabled !== false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const saveServer = async () => {
    if (!token) return;
    const t = parseFloat(threshold);
    if (isNaN(t) || t <= 0) {
      Alert.alert('Error', 'El umbral debe ser un número positivo');
      return;
    }
    const c = parseInt(countdownSeconds, 10);
    if (isNaN(c) || c < 3 || c > 60) {
      Alert.alert('Error', 'La cuenta regresiva debe estar entre 3 y 60 segundos');
      return;
    }
    setSaving(true);
    try {
      await settingsAPI.update(token, { alert_threshold: t, auto_call: autoCall, auto_whatsapp: autoWhatsapp, countdown_seconds: c, location_tracking_enabled: locationTrackingEnabled });
      notifyAlertsConfigChanged();
      Alert.alert('Guardado', 'Configuración de alertas actualizada');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const saveDeviceName = async () => {
    await setDeviceName(deviceInput.trim() || 'HC-05');
    Alert.alert('Guardado', 'Nombre del dispositivo actualizado.');
  };


  const confirmLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Seguro que quieres salir de tu cuenta?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí',
          style: 'destructive',
          onPress: async () => {
            if (connected) disconnect();
            await logout();
            router.replace('/login');
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>AJUSTES</Text>
            <Text style={styles.subtitle}>Configura tu casco, alertas y modo de prueba.</Text>
          </View>

          {/* ─── Device ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DISPOSITIVO BLUETOOTH</Text>

            <View style={styles.deviceStatus}>
              <View style={[styles.statusDot, { backgroundColor: connected ? COLORS.success : COLORS.textDim }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusLabel}>{connected ? 'CONECTADO' : 'SIN CONEXIÓN'}</Text>
                <Text style={styles.statusDevice}>{connected ? liveDevice : 'Ningún módulo activo'}</Text>
              </View>
              {connected ? (
                <TouchableOpacity onPress={disconnect} style={styles.inlineBtn} testID="settings-disconnect-btn">
                  <Text style={styles.inlineBtnText}>DESCONECTAR</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => router.push('/devices')} style={[styles.inlineBtn, styles.inlineBtnAccent]} testID="settings-scan-btn">
                  <Text style={[styles.inlineBtnText, { color: '#0A0A0A' }]}>ESCANEAR</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOMBRE DEL DISPOSITIVO</Text>
              <Text style={styles.helper}>
                Se usará como patrón de búsqueda para identificar tu módulo. Por defecto se buscan HC-05, HC-10 y CRASH.
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  testID="device-name-input"
                  style={[styles.input, { flex: 1 }]}
                  value={deviceInput}
                  onChangeText={setDeviceInput}
                  placeholder="HC-05 CRASH"
                  placeholderTextColor={COLORS.textDim}
                  autoCapitalize="characters"
                />
                <TouchableOpacity onPress={saveDeviceName} style={styles.saveInlineBtn} testID="save-device-name-btn">
                  <Text style={styles.saveInlineBtnText}>GUARDAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ─── Emergencia ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TIEMPO DE CONFIRMACIÓN</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>CUENTA REGRESIVA DE EMERGENCIA</Text>
              <Text style={styles.helper}>Segundos antes de enviar mensajes tras detectar impacto alto.</Text>
              <View style={styles.thresholdRow}>
                <TextInput
                  style={[styles.input, { width: 100, textAlign: 'center', fontSize: 18, fontWeight: '800' }]}
                  value={countdownSeconds}
                  onChangeText={setCountdownSeconds}
                  keyboardType="numeric"
                />
                <Text style={styles.gSymbol}>s</Text>
              </View>
            </View>
            {!nativeAvailable && (
              <View style={styles.warnBox}>
                <Ionicons name="information-circle" size={14} color={COLORS.info} />
                <Text style={styles.warnBoxText}>
                  Bluetooth real requiere build nativa (expo-dev-client).
                </Text>
              </View>
            )}
          </View>

          {/* ─── Alerts ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ALERTAS DE IMPACTO</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>UMBRAL DE ALERTA</Text>
              <Text style={styles.helper}>Se envían alertas cuando la fuerza G supere este valor.</Text>
              <View style={styles.thresholdRow}>
                <TextInput
                  testID="threshold-input"
                  style={[styles.input, { width: 100, textAlign: 'center', fontSize: 18, fontWeight: '800' }]}
                  value={threshold}
                  onChangeText={setThreshold}
                  keyboardType="numeric"
                />
                <Text style={styles.gSymbol}>G</Text>
              </View>
              <View style={styles.thresholdScale}>
                {[{ l: 'Bajo', v: '5' }, { l: 'Medio', v: '10' }, { l: 'Alto', v: '15' }, { l: 'Crítico', v: '20' }].map((t) => (
                  <TouchableOpacity key={t.v} style={[styles.threshBtn, { borderColor: severityColor(parseFloat(t.v)) }]} onPress={() => setThreshold(t.v)}>
                    <Text style={[styles.threshText, { color: severityColor(parseFloat(t.v)) }]}>{t.l}</Text>
                    <Text style={[styles.threshVal, { color: severityColor(parseFloat(t.v)) }]}>{t.v}G</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Ionicons name="location-outline" size={20} color={COLORS.info} />
                <Text style={styles.toggleLabel}>Rastreo de ubicación en tiempo real</Text>
              </View>
              <Switch
                testID="location-tracking-switch"
                value={locationTrackingEnabled}
                onValueChange={setLocationTrackingEnabled}
                trackColor={{ false: '#2A2A34', true: 'rgba(96,165,250,0.45)' }}
                thumbColor={locationTrackingEnabled ? COLORS.info : '#9A9AA8'}
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Ionicons name="call-outline" size={20} color={COLORS.text} />
                <Text style={styles.toggleLabel}>Llamadas automáticas</Text>
              </View>
              <Switch
                testID="auto-call-switch"
                value={autoCall}
                onValueChange={setAutoCall}
                trackColor={{ false: '#2A2A34', true: 'rgba(204,255,0,0.45)' }}
                thumbColor={autoCall ? COLORS.accent : '#9A9AA8'}
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Ionicons name="logo-whatsapp" size={20} color={COLORS.success} />
                <Text style={styles.toggleLabel}>Alertas por WhatsApp</Text>
              </View>
              <Switch
                testID="auto-whatsapp-switch"
                value={autoWhatsapp}
                onValueChange={setAutoWhatsapp}
                trackColor={{ false: '#2A2A34', true: 'rgba(52,211,153,0.45)' }}
                thumbColor={autoWhatsapp ? COLORS.success : '#9A9AA8'}
              />
            </View>

            <TouchableOpacity testID="save-settings-btn" style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveServer} disabled={saving}>
              {saving ? <ActivityIndicator color="#0A0A0A" /> : (
                <>
                  <Ionicons name="save" size={16} color="#0A0A0A" />
                  <Text style={styles.saveBtnText}>GUARDAR ALERTAS</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ─── Session ─── */}
          <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={confirmLogout}>
            <Ionicons name="log-out-outline" size={18} color={COLORS.primary} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
          <Text style={styles.version}>C.R.A.S.H. v1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: SPACING.md },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text, letterSpacing: 3 },
  subtitle: { fontSize: 12, color: COLORS.textSec, marginTop: 4 },
  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: COLORS.textSec, letterSpacing: 2, marginBottom: SPACING.md },
  deviceStatus: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.md },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 10, fontWeight: '900', color: COLORS.text, letterSpacing: 1.5 },
  statusDevice: { fontSize: 13, color: COLORS.textSec, marginTop: 2 },
  inlineBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: COLORS.elevated },
  inlineBtnAccent: { backgroundColor: COLORS.accent },
  inlineBtnText: { fontSize: 10, fontWeight: '900', color: COLORS.text, letterSpacing: 1 },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 10, fontWeight: '800', color: COLORS.textSec, letterSpacing: 2, marginBottom: 6 },
  helper: { fontSize: 11, color: COLORS.textDim, marginBottom: 8, lineHeight: 16 },
  input: { backgroundColor: COLORS.bg, borderRadius: RADIUS.md, paddingHorizontal: 14, minHeight: 48, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  saveInlineBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12 },
  saveInlineBtnText: { fontSize: 11, fontWeight: '900', color: '#0A0A0A', letterSpacing: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  toggleHelper: { fontSize: 11, color: COLORS.textSec, marginTop: 3, lineHeight: 16 },
  toggleLabel: { fontSize: 14, color: COLORS.text },
  warnBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: 'rgba(96,165,250,0.08)', padding: 10, borderRadius: RADIUS.md, marginTop: 4 },
  warnBoxText: { fontSize: 11, color: COLORS.textSec, flex: 1, lineHeight: 16 },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  gSymbol: { fontSize: 22, fontWeight: '900', color: COLORS.textSec },
  thresholdScale: { flexDirection: 'row', gap: 8 },
  threshBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  threshText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  threshVal: { fontSize: 14, fontWeight: '900', marginTop: 2 },
  saveBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.accent, borderRadius: RADIUS.pill, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveBtnText: { color: '#0A0A0A', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: 'rgba(255,59,48,0.08)', borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(255,59,48,0.25)', marginTop: 8 },
  logoutText: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },
  version: { textAlign: 'center', color: COLORS.textDim, fontSize: 11, marginTop: 12 },
});
