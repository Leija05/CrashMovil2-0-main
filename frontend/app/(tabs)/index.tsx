import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING, severityColor, severityLabel } from '../../src/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useBluetooth } from '../../src/context/BluetoothContext';
import { useAppSettings } from '../../src/context/AppSettingsContext';

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { developerMode, deviceName: pattern } = useAppSettings();
  const {
    connected, telemetry, status, statusDetail, deviceName,
    startSimulation, stopSimulation, disconnect, nativeAvailable,
  } = useBluetooth();

  const [refreshing, setRefreshing] = useState(false);
  const [peakG, setPeakG] = useState(0);
  const lastDataRef = useRef<number>(0);
  const [staleData, setStaleData] = useState(false);

  // Track peak G
  useEffect(() => {
    if (telemetry) {
      lastDataRef.current = Date.now();
      setStaleData(false);
      if (telemetry.g_force > peakG) setPeakG(telemetry.g_force);
    }
  }, [telemetry, peakG]);

  // Stale data watchdog (no updates for 2s => not truly live)
  useEffect(() => {
    const t = setInterval(() => {
      if (connected && Date.now() - lastDataRef.current > 2000) {
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

  // In developer mode, when user taps "Iniciar simulación", we start simulation
  const handleDevStart = () => {
    if (connected) stopSimulation();
    else startSimulation();
  };

  const gForce = telemetry?.g_force ?? 0;
  const sevColor = severityColor(gForce);
  const sevLabel = severityLabel(gForce);
  const liveData = connected && !staleData && !!telemetry;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
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

        {/* Connection status bar */}
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

        {/* G-Force Main Display */}
        <View style={[styles.gForceCard, { borderColor: liveData ? `${sevColor}40` : COLORS.border }]}>
          <Text style={styles.gLabel}>FUERZA G</Text>
          <View style={styles.gRow}>
            <Text style={[styles.gValue, { color: liveData ? sevColor : COLORS.textDim }]}>
              {liveData ? gForce.toFixed(2) : '—.——'}
            </Text>
            <Text style={styles.gUnit}>G</Text>
          </View>
          <View style={styles.gMeta}>
            <View style={[styles.sevBadge, { backgroundColor: `${sevColor}20`, opacity: liveData ? 1 : 0.3 }]}>
              <Text style={[styles.sevText, { color: sevColor }]}>{sevLabel}</Text>
            </View>
            <View style={styles.peak}>
              <Text style={styles.peakLabel}>PICO</Text>
              <Text style={styles.peakValue}>{peakG.toFixed(2)} G</Text>
            </View>
          </View>
        </View>

        {/* Primary Action */}
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
              <Text style={[styles.primaryBtnText, { color: '#0A0A0A' }]}>CONECTAR CASCO</Text>
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

        {/* Telemetry Grid */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>TELEMETRÍA EN TIEMPO REAL</Text>
          <View style={[styles.liveBadge, liveData && styles.liveBadgeOn]}>
            <View style={[styles.liveDot, { backgroundColor: liveData ? COLORS.success : COLORS.textDim }]} />
            <Text style={[styles.liveText, { color: liveData ? COLORS.success : COLORS.textDim }]}>LIVE</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <MetricCard label="ACCEL X" value={telemetry?.acceleration_x} unit="G" color={COLORS.info} live={liveData} />
          <MetricCard label="ACCEL Y" value={telemetry?.acceleration_y} unit="G" color={COLORS.info} live={liveData} />
          <MetricCard label="ACCEL Z" value={telemetry?.acceleration_z} unit="G" color={COLORS.accent} live={liveData} />
          <MetricCard label="GYRO X" value={telemetry?.gyroscope_x} unit="°/s" color={COLORS.warning} live={liveData} />
          <MetricCard label="GYRO Y" value={telemetry?.gyroscope_y} unit="°/s" color={COLORS.warning} live={liveData} />
          <MetricCard label="GYRO Z" value={telemetry?.gyroscope_z} unit="°/s" color="#FB923C" live={liveData} />
        </View>

        {/* Info footer */}
        {!developerMode && !nativeAvailable && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={14} color={COLORS.info} />
            <Text style={styles.infoText}>Bluetooth real disponible solo en build nativa (expo-dev-client).</Text>
          </View>
        )}
        {!developerMode && nativeAvailable && !connected && (
          <View style={styles.infoBox}>
            <Ionicons name="radio" size={14} color={COLORS.info} />
            <Text style={styles.infoText}>Buscando: {pattern} · HC-05 · HC-10 · CRASH</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ label, value, unit, color, live }: {
  label: string; value?: number; unit: string; color: string; live: boolean;
}) {
  return (
    <View style={styles.metric} testID={`metric-${label.toLowerCase().replace(' ', '-')}`}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: live ? color : COLORS.textDim }]}>
        {live && value !== undefined ? value.toFixed(2) : '—.——'}
      </Text>
      <Text style={styles.metricUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
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
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: 14, marginBottom: SPACING.md,
  },
  statusBarConnected: { borderColor: 'rgba(52,211,153,0.3)', backgroundColor: 'rgba(52,211,153,0.05)' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 10, fontWeight: '900', color: COLORS.text, letterSpacing: 1.5 },
  statusDetail: { fontSize: 12, color: COLORS.textSec, marginTop: 2 },
  gForceCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md,
  },
  gLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textSec, letterSpacing: 3, marginBottom: 8 },
  gRow: { flexDirection: 'row', alignItems: 'flex-end' },
  gValue: { fontSize: 78, fontWeight: '900', lineHeight: 80, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  gUnit: { fontSize: 20, fontWeight: '700', color: COLORS.textSec, marginBottom: 14, marginLeft: 4 },
  gMeta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  sevBadge: { paddingHorizontal: 16, paddingVertical: 5, borderRadius: RADIUS.md },
  sevText: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  peak: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 4, borderRadius: RADIUS.md, backgroundColor: COLORS.bg },
  peakLabel: { fontSize: 8, fontWeight: '800', color: COLORS.textDim, letterSpacing: 1 },
  peakValue: { fontSize: 12, fontWeight: '900', color: COLORS.text, marginTop: 1 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.pill, height: 54,
    marginBottom: SPACING.md,
  },
  primaryBtnDev: { backgroundColor: COLORS.warning },
  primaryBtnDanger: { backgroundColor: COLORS.primary },
  primaryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: COLORS.textSec, letterSpacing: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface },
  liveBadgeOn: { backgroundColor: 'rgba(52,211,153,0.1)' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: SPACING.md },
  metric: {
    width: '48%', flexGrow: 1, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  metricLabel: { fontSize: 9, fontWeight: '900', color: COLORS.textSec, letterSpacing: 2, marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: '900', color: COLORS.textDim, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  metricUnit: { fontSize: 10, color: COLORS.textDim, marginTop: 2 },
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 4,
  },
  infoText: { fontSize: 11, color: COLORS.textSec, flex: 1 },
});
