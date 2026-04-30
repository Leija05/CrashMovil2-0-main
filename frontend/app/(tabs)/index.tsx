import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING, severityColor, severityLabel } from '../../src/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useBluetooth } from '../../src/context/BluetoothContext';
import { useAppSettings } from '../../src/context/AppSettingsContext';
import { contactsAPI, impactsAPI, settingsAPI } from '../../src/services/api';

const MAX_G_RING = 12;
const SEGMENTS = 40;

export default function DashboardScreen() {
  const { user } = useAuth();
  const { token } = useAuth();
  const router = useRouter();
  const { developerMode, deviceName: pattern } = useAppSettings();
  const {
    connected, telemetry, statusDetail, deviceName,
    startSimulation, stopSimulation, disconnect, nativeAvailable,
  } = useBluetooth();

  const [refreshing, setRefreshing] = useState(false);
  const [peakG, setPeakG] = useState(0);
  const lastDataRef = useRef<number>(0);
  const [staleData, setStaleData] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [alertResult, setAlertResult] = useState<any | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(8);
  const [hasEmergencyContacts, setHasEmergencyContacts] = useState(true);

  useEffect(() => {
    if (telemetry) {
      lastDataRef.current = Date.now();
      setStaleData(false);
      if (telemetry.g_force > peakG) setPeakG(telemetry.g_force);
    }
  }, [telemetry, peakG]);


  useEffect(() => {
    const loadSettings = async () => {
      if (!token) return;
      try {
        const s = await settingsAPI.get(token);
        const fromServer = Number(s?.countdown_seconds ?? s?.emergency_countdown_seconds ?? 8);
        if (!Number.isNaN(fromServer) && fromServer >= 3 && fromServer <= 60) {
          setCountdownSeconds(Math.round(fromServer));
        }
      } catch (e) {
        console.warn('No se pudo cargar countdown de usuario', e);
      }
    };
    loadSettings();
  }, [token]);

  useEffect(() => {
    const loadContactsState = async () => {
      if (!token) return;
      try {
        const contacts = await contactsAPI.list(token);
        setHasEmergencyContacts(Array.isArray(contacts) && contacts.length > 0);
      } catch (e) {
        console.warn('No se pudo validar contactos de emergencia', e);
      }
    };
    loadContactsState();
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => {
      if (connected && Date.now() - lastDataRef.current > 6000) {
        setStaleData(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [connected]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPeakG(0);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const handleDevStart = () => {
    if (connected) stopSimulation();
    else startSimulation();
  };

  const gForce = telemetry?.g_force ?? 0;
  const sevColor = severityColor(gForce);
  const sevLabel = severityLabel(gForce);
  const liveData = connected && !staleData && !!telemetry;
  const highImpact = liveData && gForce >= 10;

  useEffect(() => {
    if (highImpact && countdown === null && !sending) {
      setCountdown(countdownSeconds);
    }
  }, [highImpact, countdown, sending, countdownSeconds]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      triggerEmergencyFlow();
      return;
    }
    const t = setTimeout(() => setCountdown((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, triggerEmergencyFlow]);

  const triggerEmergencyFlow = useCallback(async () => {
    if (!token || !telemetry || sending) return;
    if (!hasEmergencyContacts) {
      Alert.alert(
        'No tienes contactos agregados',
        'Antes de enviar alertas, registra al menos un contacto de emergencia.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir a Contactos', onPress: () => router.push('/contacts') },
        ]
      );
      return;
    }
    setSending(true);
    try {
      const impact = await impactsAPI.create(token, {
        acceleration_x: telemetry.acceleration_x,
        acceleration_y: telemetry.acceleration_y,
        acceleration_z: telemetry.acceleration_z,
        gyroscope_x: telemetry.gyroscope_x,
        gyroscope_y: telemetry.gyroscope_y,
        gyroscope_z: telemetry.gyroscope_z,
        g_force: telemetry.g_force,
        latitude: 19.4326,
        longitude: -99.1332,
      });
      if (impact?.alerted_contacts?.length === 0 && telemetry.g_force >= 10) {
        Alert.alert('No tienes contactos agregados', 'No se pudo notificar a nadie porque no hay contactos de emergencia.');
      }
      setAlertResult(impact);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo enviar la alerta');
    } finally {
      setSending(false);
    }
  }, [token, telemetry, sending, hasEmergencyContacts, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] || 'Rider'}</Text>
            <Text style={styles.appName}>C.R.A.S.H.</Text>
          </View>
          <View style={[styles.modePill, developerMode && styles.modePillDev]}>
            <Ionicons
              name={developerMode ? 'construct' : 'shield-checkmark'}
              size={12}
              color={developerMode ? COLORS.warning : COLORS.success}
            />
            <Text style={[styles.modeText, { color: developerMode ? COLORS.warning : COLORS.success }]}>
              {developerMode ? 'DEV' : 'REAL'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.statusBar, liveData && styles.statusBarConnected]}
          onPress={() => !developerMode && router.push('/devices')}
          activeOpacity={developerMode ? 1 : 0.7}
          testID="dashboard-status-bar"
        >
          <View style={[styles.statusDot, { backgroundColor: liveData ? COLORS.success : connected ? COLORS.warning : COLORS.textDim }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>
              {liveData ? 'CONECTADO' : connected ? 'SIN DATOS' : developerMode ? 'MODO SIMULACIÓN' : 'DESCONECTADO'}
            </Text>
            <Text style={styles.statusDetail} numberOfLines={1}>
              {developerMode
                ? connected ? `${deviceName || 'Simulador'}` : 'Pulsa "Iniciar simulación"'
                : connected
                  ? staleData ? (statusDetail || 'Esperando telemetría...') : deviceName
                  : 'Toca para conectar tu casco'}
            </Text>
          </View>
          {!developerMode && (
            <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
          )}
        </TouchableOpacity>

        <View style={styles.ringCard}>
          <ForceRing gForce={gForce} liveData={liveData} color={sevColor} severity={sevLabel} />
          <View style={styles.peakRow}>
            <Text style={styles.peakLabel}>PICO</Text>
            <Text style={styles.peakValue}>{peakG.toFixed(2)} G</Text>
          </View>
        </View>

        <View style={styles.coordsCard}>
          <Text style={styles.coordsTitle}>COORDENADAS / ACELERACIÓN (m/s²)</Text>
        <View style={styles.coordsGrid}>
          <CoordItem label="X" value={telemetry?.acceleration_x} live={liveData} />
          <CoordItem label="Y" value={telemetry?.acceleration_y} live={liveData} />
          <CoordItem label="Z" value={telemetry?.acceleration_z} live={liveData} />
        </View>
        <Text style={styles.coordsGeo}>Lat: 19.4326 · Lon: -99.1332</Text>
      </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>TELEMETRÍA DEL CIRCUITO</Text>
          <View style={[styles.liveBadge, liveData && styles.liveBadgeOn]}>
            <View style={[styles.liveDot, { backgroundColor: liveData ? COLORS.success : COLORS.textDim }]} />
            <Text style={[styles.liveText, { color: liveData ? COLORS.success : COLORS.textDim }]}>LIVE</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <MetricCard label="GIRO X" value={telemetry?.gyroscope_x} unit="rad/s" color={COLORS.warning} live={liveData} />
          <MetricCard label="GIRO Y" value={telemetry?.gyroscope_y} unit="rad/s" color={COLORS.warning} live={liveData} />
          <MetricCard label="GIRO Z" value={telemetry?.gyroscope_z} unit="rad/s" color="#FB923C" live={liveData} />
          <MetricCard label="FUERZA G" value={telemetry?.g_force} unit="g" color={COLORS.accent} live={liveData} />
        </View>

        {!developerMode ? (
          connected ? (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.primaryBtnDanger]}
              onPress={disconnect}
              activeOpacity={0.8}
              testID="disconnect-btn"
            >
              <Ionicons name="bluetooth" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>DESCONECTAR</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push('/devices')}
              activeOpacity={0.8}
              testID="connect-btn"
            >
              <Ionicons name="bluetooth" size={18} color="#0A0A0A" />
              <Text style={[styles.primaryBtnText, { color: '#0A0A0A' }]}>CONECTAR CASCO BLE</Text>
            </TouchableOpacity>
          )
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, connected ? styles.primaryBtnDanger : styles.primaryBtnDev]}
            onPress={handleDevStart}
            activeOpacity={0.8}
            testID="dev-toggle-btn"
          >
            <Ionicons name="construct" size={18} color={connected ? '#FFF' : '#0A0A0A'} />
            <Text style={[styles.primaryBtnText, { color: connected ? '#FFF' : '#0A0A0A' }]}>
              {connected ? 'DETENER SIMULACIÓN' : 'INICIAR SIMULACIÓN'}
            </Text>
          </TouchableOpacity>
        )}

        {!developerMode && !nativeAvailable && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={14} color={COLORS.info} />
            <Text style={styles.infoText}>Bluetooth real disponible solo en build nativa (expo-dev-client).</Text>
          </View>
        )}
        {!developerMode && nativeAvailable && !connected && (
          <View style={styles.infoBox}>
            <Ionicons name="radio" size={14} color={COLORS.info} />
            <Text style={styles.infoText}>Buscando: {pattern} · HC-05 · HC-10 · HM-10 · MLT-BT05 · CRASH</Text>
          </View>
        )}
        {!hasEmergencyContacts && (
          <TouchableOpacity style={styles.warningCard} onPress={() => router.push('/contacts')} activeOpacity={0.85}>
            <Ionicons name="alert-circle" size={18} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>No tienes contactos de emergencia</Text>
              <Text style={styles.warningText}>Toca aquí para agregar contactos y habilitar alertas reales.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textDim} />
          </TouchableOpacity>
        )}
      </ScrollView>
      <Modal visible={countdown !== null} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={styles.countdownIconWrap}>
              <Ionicons name="warning" size={24} color="#0A0A0A" />
            </View>
            <Text style={styles.dialogTitle}>Impacto alto detectado</Text>
            <Text style={styles.dialogText}>Se enviarán alertas a tus contactos de emergencia.</Text>
            <Text style={styles.countdownLabel}>Tiempo restante</Text>
            <Text style={styles.countdownValue}>{countdown}s</Text>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.cancelBtnSoft} onPress={() => setCountdown(null)}>
                <Text style={styles.cancelSoftText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setCountdown(null); triggerEmergencyFlow(); }}>
                <Text style={styles.cancelText}>Enviar ahora</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!alertResult} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Mensajes enviados</Text>
            <Text style={styles.dialogText}>Se notificó a contactos de emergencia:</Text>
            {(alertResult?.alerted_contacts || []).map((c: any) => (
              <Text key={c.id} style={styles.contactSent}>{`• ${c.name} (${c.phone})`}</Text>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAlertResult(null)}>
              <Text style={styles.cancelText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ForceRing({ gForce, liveData, color, severity }: { gForce: number; liveData: boolean; color: string; severity: string }) {
  const progress = Math.max(0, Math.min(gForce / MAX_G_RING, 1));
  const filled = Math.round(progress * SEGMENTS);

  return (
    <View style={styles.ringWrap}>
      <View style={styles.ringTrack}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const active = liveData && i < filled;
          return (
            <View
              key={`seg-${i}`}
              style={[
                styles.segment,
                {
                  transform: [{ rotate: `${(360 / SEGMENTS) * i}deg` }, { translateY: -126 }],
                  backgroundColor: active ? color : 'rgba(148,163,184,0.14)',
                  opacity: active ? 1 : 0.65,
                },
              ]}
            />
          );
        })}

        <View style={styles.ringInner}>
          <Text style={[styles.gValue, { color: liveData ? COLORS.text : COLORS.textDim }]}>{liveData ? gForce.toFixed(2) : '0.00'}</Text>
          <Text style={styles.gTitle}>G - FORCE</Text>
          <View style={styles.gSubRow}>
            <View style={[styles.gBullet, { backgroundColor: liveData ? color : COLORS.textDim }]} />
            <Text style={styles.gSubText}>{liveData ? `${gForce.toFixed(2)}G` : '--'}</Text>
          </View>
          <Text style={styles.severityText}>{liveData ? severity : 'SIN DATOS'}</Text>
        </View>
      </View>
      <Text style={styles.ms2}>m / s²</Text>
    </View>
  );
}

function CoordItem({ label, value, live }: { label: string; value?: number; live: boolean }) {
  return (
    <View style={styles.coordCell}>
      <Text style={styles.coordLabel}>{label}</Text>
      <Text style={styles.coordValue}>{live && value !== undefined ? value.toFixed(2) : '--.--'}</Text>
    </View>
  );
}

function MetricCard({ label, value, unit, color, live }: {
  label: string; value?: number; unit: string; color: string; live: boolean;
}) {
  return (
    <View style={styles.metric} testID={`metric-${label.toLowerCase().replace(' ', '-')}`}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: live ? color : COLORS.textDim }]}>
        {live && value !== undefined ? value.toFixed(3) : '—.——'}
      </Text>
      <Text style={styles.metricUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06080F' },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  greeting: { fontSize: 13, color: COLORS.textSec },
  appName: { fontSize: 26, fontWeight: '900', color: COLORS.text, letterSpacing: 3, marginTop: 2 },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(52,211,153,0.12)',
  },
  modePillDev: { backgroundColor: 'rgba(251,191,36,0.14)' },
  modeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0B0F1A', borderWidth: 1, borderColor: '#151B2B',
    borderRadius: RADIUS.lg, padding: 14, marginBottom: SPACING.md,
  },
  statusBarConnected: { borderColor: 'rgba(52,211,153,0.3)', backgroundColor: 'rgba(52,211,153,0.05)' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 10, fontWeight: '900', color: COLORS.text, letterSpacing: 1.5 },
  statusDetail: { fontSize: 12, color: COLORS.textSec, marginTop: 2 },

  ringCard: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#151B2B',
    backgroundColor: '#070B16',
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: SPACING.md,
  },
  ringWrap: { alignItems: 'center' },
  ringTrack: {
    width: 280,
    height: 280,
    borderRadius: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  segment: {
    width: 4,
    height: 18,
    borderRadius: 999,
    position: 'absolute',
  },
  ringInner: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    borderColor: '#1A2033',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,11,22,0.9)',
  },
  gValue: { fontSize: 66, fontWeight: '900', color: COLORS.text, lineHeight: 72 },
  gTitle: { color: '#A9B2C8', letterSpacing: 3, fontSize: 12, fontWeight: '700' },
  gSubRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  gBullet: { width: 8, height: 8, borderRadius: 999 },
  gSubText: { color: '#D0D6E5', fontWeight: '600' },
  severityText: { marginTop: 6, fontSize: 10, letterSpacing: 1.5, color: COLORS.textSec, fontWeight: '700' },
  ms2: { color: '#7F879A', marginTop: 8, fontSize: 13, letterSpacing: 3 },
  peakRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    backgroundColor: '#0E1320',
  },
  peakLabel: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  peakValue: { color: COLORS.text, fontSize: 13, fontWeight: '900' },

  coordsCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#151B2B',
    backgroundColor: '#0B0F1A',
    padding: 14,
    marginBottom: SPACING.md,
  },
  coordsTitle: { color: COLORS.textSec, fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginBottom: 10 },
  coordsGrid: { flexDirection: 'row', gap: 10 },
  coordsGeo: { color: COLORS.textSec, marginTop: 10, fontSize: 12, textAlign: 'center' },
  coordCell: {
    flex: 1,
    borderRadius: RADIUS.md,
    backgroundColor: '#060A14',
    borderWidth: 1,
    borderColor: '#1A2033',
    paddingVertical: 12,
    alignItems: 'center',
  },
  coordLabel: { color: COLORS.textDim, fontSize: 11, fontWeight: '900', marginBottom: 4 },
  coordValue: { color: COLORS.text, fontSize: 18, fontWeight: '800' },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: COLORS.textSec, letterSpacing: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill, backgroundColor: '#0E1320' },
  liveBadgeOn: { backgroundColor: 'rgba(52,211,153,0.1)' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: SPACING.md },
  metric: {
    width: '48%', flexGrow: 1, backgroundColor: '#0B0F1A',
    borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: '#151B2B',
  },
  metricLabel: { fontSize: 9, fontWeight: '900', color: COLORS.textSec, letterSpacing: 2, marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: '900', color: COLORS.textDim },
  metricUnit: { fontSize: 10, color: COLORS.textDim, marginTop: 2 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.pill, height: 54,
    marginBottom: SPACING.md,
  },
  primaryBtnDev: { backgroundColor: COLORS.warning },
  primaryBtnDanger: { backgroundColor: COLORS.primary },
  primaryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 2 },

  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0B0F1A', padding: 12, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: '#151B2B', marginTop: 4,
  },
  infoText: { fontSize: 11, color: COLORS.textSec, flex: 1 },
  warningCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.35)', borderWidth: 1,
    borderRadius: RADIUS.md, padding: 12, marginTop: 4,
  },
  warningTitle: { color: COLORS.warning, fontWeight: '800', fontSize: 13, marginBottom: 2 },
  warningText: { color: COLORS.textSec, fontSize: 11 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', backgroundColor: '#0B0F1A', borderWidth: 1, borderColor: '#1A2033', borderRadius: 16, padding: 18 },
  countdownIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.warning, marginBottom: 10 },
  dialogTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  dialogText: { color: COLORS.textSec, fontSize: 14, marginBottom: 6 },
  countdownLabel: { color: COLORS.textDim, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 4 },
  countdownValue: { color: COLORS.warning, fontSize: 44, fontWeight: '900', marginTop: 2, marginBottom: 12 },
  dialogActions: { flexDirection: 'row', gap: 8 },
  cancelBtnSoft: { flex: 1, backgroundColor: '#151B2B', borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  cancelSoftText: { color: COLORS.text, fontWeight: '800', letterSpacing: 0.7 },
  cancelBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#FFF', fontWeight: '900', letterSpacing: 1 },
  contactSent: { color: COLORS.text, fontSize: 13, marginBottom: 4 },
});
