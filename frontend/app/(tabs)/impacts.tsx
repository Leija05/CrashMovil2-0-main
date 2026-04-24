import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { impactsAPI } from '../../src/services/api';
import { bluetoothService } from '../../src/services/bluetooth';
import { useAppSettings } from '../../src/context/AppSettingsContext';
import { COLORS, RADIUS, SPACING } from '../../src/theme';

function sevColor(s: string) {
  if (s === 'low') return COLORS.success;
  if (s === 'medium') return COLORS.warning;
  if (s === 'high') return '#FB923C';
  return COLORS.primary;
}

export default function ImpactsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { developerMode } = useAppSettings();
  const [impacts, setImpacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const fetchImpacts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await impactsAPI.list(token);
      setImpacts(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { fetchImpacts(); }, [fetchImpacts]));

  const simulateImpact = async (severity: 'low' | 'medium' | 'high' | 'critical') => {
    if (!token) return;
    setSimulating(true);
    try {
      const data = bluetoothService.simulateImpact(severity);
      const newImpact = await impactsAPI.create(token, {
        acceleration_x: data.acceleration_x,
        acceleration_y: data.acceleration_y,
        acceleration_z: data.acceleration_z,
        gyroscope_x: data.gyroscope_x,
        gyroscope_y: data.gyroscope_y,
        gyroscope_z: data.gyroscope_z,
        g_force: data.g_force,
        latitude: 19.4326,
        longitude: -99.1332,
      });
      setImpacts((prev) => [newImpact, ...prev]);
    } catch (e: any) {
      console.error(e);
    } finally { setSimulating(false); }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderImpact = ({ item }: { item: any }) => (
    <TouchableOpacity
      testID={`impact-item-${item.id}`}
      style={styles.card}
      onPress={() => router.push(`/impact/${item.id}`)}
      activeOpacity={0.75}
    >
      <View style={[styles.sevStrip, { backgroundColor: sevColor(item.severity) }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardSeverity}>{item.severity_label || item.severity}</Text>
          <Text style={[styles.cardGForce, { color: sevColor(item.severity) }]}>{item.g_force?.toFixed(1)}G</Text>
        </View>
        <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
        {item.ai_diagnosis && (
          <View style={styles.aiBadge}>
            <Ionicons name="sparkles" size={10} color={COLORS.accent} />
            <Text style={styles.aiText}>DIAGNÓSTICO IA</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerSection}>
        <View>
          <Text style={styles.title}>IMPACTOS</Text>
          <Text style={styles.countText}>{impacts.length} eventos registrados</Text>
        </View>
      </View>

      {/* Simulate buttons only in developer mode */}
      {developerMode && (
        <View style={styles.simSection}>
          <View style={styles.simHeader}>
            <Ionicons name="construct" size={14} color={COLORS.warning} />
            <Text style={styles.simLabel}>SIMULAR IMPACTO (MODO DEV)</Text>
          </View>
          <View style={styles.simBtns}>
            {(['low', 'medium', 'high', 'critical'] as const).map((sev) => (
              <TouchableOpacity
                key={sev}
                testID={`simulate-${sev}-btn`}
                style={[styles.simBtn, { borderColor: sevColor(sev) }]}
                onPress={() => simulateImpact(sev)}
                disabled={simulating}
                activeOpacity={0.7}
              >
                {simulating ? <ActivityIndicator size="small" color={sevColor(sev)} /> : (
                  <Text style={[styles.simBtnText, { color: sevColor(sev) }]}>
                    {sev === 'low' ? 'BAJO' : sev === 'medium' ? 'MEDIO' : sev === 'high' ? 'ALTO' : 'CRÍTICO'}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={impacts}
          keyExtractor={(item) => item.id}
          renderItem={renderImpact}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchImpacts(); }} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="shield-checkmark" size={34} color={COLORS.success} /></View>
              <Text style={styles.emptyText}>Sin impactos registrados</Text>
              <Text style={styles.emptySubtext}>
                {developerMode ? 'Usa los botones de simulación para probar' : 'Cuando detectemos un impacto aparecerá aquí'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerSection: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 6 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text, letterSpacing: 3 },
  countText: { fontSize: 12, color: COLORS.textSec, marginTop: 4 },
  simSection: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: 'rgba(251,191,36,0.04)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(251,191,36,0.12)', marginBottom: 8 },
  simHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  simLabel: { fontSize: 10, fontWeight: '900', color: COLORS.warning, letterSpacing: 2 },
  simBtns: { flexDirection: 'row', gap: 8 },
  simBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)' },
  simBtnText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  list: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, paddingBottom: 20 },
  card: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  sevStrip: { width: 4 },
  cardBody: { flex: 1, padding: SPACING.md, paddingLeft: SPACING.md },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSeverity: { fontSize: 14, fontWeight: '800', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 1 },
  cardDate: { fontSize: 11, color: COLORS.textSec, marginTop: 4 },
  cardGForce: { fontSize: 22, fontWeight: '900' },
  aiBadge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 4, backgroundColor: COLORS.accentSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm, marginTop: 8 },
  aiText: { fontSize: 9, fontWeight: '800', color: COLORS.accent, letterSpacing: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(52,211,153,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  emptySubtext: { fontSize: 12, color: COLORS.textSec, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
});
