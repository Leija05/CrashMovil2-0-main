import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING, severityColor } from '../../src/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useBluetooth } from '../../src/context/BluetoothContext';
import { useAppSettings } from '../../src/context/AppSettingsContext';

const MAX_VISUAL_G = 12;
const RING_TICKS = 32;

export default function DashboardScreen() {
  const { user } = useAuth();
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

  useEffect(() => {
    if (telemetry) {
      lastDataRef.current = Date.now();
      setStaleData(false);
      if (telemetry.g_force > peakG) setPeakG(telemetry.g_force);
    }
  }, [telemetry, peakG]);

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

  const handleDevStart = () => {
    if (connected) stopSimulation();
    else startSimulation();
  };

  const gForce = telemetry?.g_force ?? 0;
  const ringProgress = Math.max(0, Math.min(gForce / MAX_VISUAL_G, 1));
  const sevColor = severityColor(gForce);
  const liveData = connected && !staleData && !!telemetry;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] || 'Rider'}</Text>
            <Text style={styles.appName}>G FORCE</Text>
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
          {!developerMode && <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />}
        </TouchableOpacity>

        <View style={styles.gaugeWrap}>
          <View style={styles.tickRing}>
            {Array.from({ length: RING_TICKS }).map((_, i) => (
              <View
                key={`tick-${i}`}
                style={[
                  styles.tick,
                  {
                    transform: [{ rotate: `${(360 / RING_TICKS) * i}deg` }, { translateY: -138 }],
                    opacity: liveData && i <= ringProgress * RING_TICKS ? 0.8 : 0.25,
                    backgroundColor: liveData && i <= ringProgress * RING_TICKS ? sevColor : '#273149',
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.gaugeOuter}>
            <View style={[styles.gaugeProgress, { borderColor: sevColor, opacity: liveData ? 0.16 + ringProgress * 0.72 : 0.08 }]} />
            <View style={styles.gaugeInner}>
              <Text style={[styles.gValue, { color: liveData ? COLORS.text : COLORS.textDim }]}>
                {liveData ? gForce.toFixed(2) : '0.00'}
              </Text>
              <Text style={styles.gLabel}>G - FORCE</Text>
              <View style={styles.peakRow}>
                <View style={[styles.peakDot, { backgroundColor: liveData ? sevColor : COLORS.textDim }]} />
                <Text style={styles.peakText}>{peakG.toFixed(2)}G</Text>
              </View>
            </View>
          </View>
          <Text style={styles.unitText}>m / s²</Text>
        </View>

        <View style={styles.coordinatesCard}>
          <Text style={styles.coordinatesTitle}>COORDENADAS</Text>
          <View style={styles.coordinatesGrid}>
            <CoordinateItem label="X" value={telemetry?.acceleration_x} live={liveData} />
            <CoordinateItem label="Y" value={telemetry?.acceleration_y} live={liveData} />
            <CoordinateItem label="Z" value={telemetry?.acceleration_z} live={liveData} />
          </View>
        </View>

        {!developerMode ? (
          connected ? (
            <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnDanger]} onPress={disconnect} activeOpacity={0.8} testID="disconnect-btn">
              <Ionicons name="bluetooth" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>DESCONECTAR</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/devices')} activeOpacity={0.8} testID="connect-btn">
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

function CoordinateItem({ label, value, live }: { label: string; value?: number; live: boolean }) {
  return (
    <View style={styles.coordinateItem}>
      <Text style={styles.coordinateLabel}>{label}</Text>
      <Text style={[styles.coordinateValue, { color: live ? COLORS.text : COLORS.textDim }]}>
        {live && value !== undefined ? value.toFixed(3) : '—.— —'}
      </Text>
    </View>
  );
}

const monoFont = Platform.select({ ios: 'Menlo', default: 'monospace' });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080A12' },
  scroll: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  greeting: { fontSize: 13, color: COLORS.textSec },
  appName: { fontSize: 30, fontWeight: '900', color: COLORS.text, letterSpacing: 3, marginTop: 2 },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(52,211,153,0.12)',
  },
  modePillDev: { backgroundColor: 'rgba(251,191,36,0.14)' },
  modeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0E1221', borderWidth: 1, borderColor: '#1C2438',
    borderRadius: RADIUS.lg, padding: 14, marginBottom: 18,
  },
  statusBarConnected: { borderColor: 'rgba(52,211,153,0.3)', backgroundColor: 'rgba(52,211,153,0.05)' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 10, fontWeight: '900', color: COLORS.text, letterSpacing: 1.5 },
  statusDetail: { fontSize: 12, color: COLORS.textSec, marginTop: 2 },
  gaugeWrap: { alignItems: 'center', marginTop: 4, marginBottom: 20 },
  tickRing: { position: 'absolute', width: 300, height: 300, alignItems: 'center', justifyContent: 'center' },
  tick: {
    position: 'absolute',
    width: 3,
    height: 10,
    borderRadius: 2,
  },
  gaugeOuter: {
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 1,
    borderColor: '#1C2438',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0F1D',
    overflow: 'hidden',
  },
  gaugeProgress: {
    position: 'absolute',
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 18,
  },
  gaugeInner: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#090D18',
    borderWidth: 1,
    borderColor: '#1A2032',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gValue: { fontSize: 62, fontWeight: '900', fontFamily: monoFont, lineHeight: 64 },
  gLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSec, letterSpacing: 4, marginTop: 6 },
  peakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  peakDot: { width: 8, height: 8, borderRadius: 4 },
  peakText: { color: COLORS.textSec, fontSize: 13, fontFamily: monoFont },
  unitText: { marginTop: 14, color: '#9CA3AF', fontSize: 14, letterSpacing: 2 },
  coordinatesCard: {
    minHeight: 126,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#1C2438',
    backgroundColor: '#0B0F1C',
    padding: 14,
    marginBottom: SPACING.md,
  },
  coordinatesTitle: {
    color: COLORS.textSec,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 14,
  },
  coordinatesGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  coordinateItem: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1F2A42',
    borderRadius: RADIUS.md,
    backgroundColor: '#090D18',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  coordinateLabel: { color: COLORS.textSec, fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  coordinateValue: { fontSize: 18, fontWeight: '800', fontFamily: monoFont },
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
    backgroundColor: '#0E1221', padding: 12, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: '#1C2438', marginTop: 4,
  },
  infoText: { fontSize: 11, color: COLORS.textSec, flex: 1 },
});
