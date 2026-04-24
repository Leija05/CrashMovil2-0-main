import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { impactsAPI } from '../../src/services/api';

const COLORS = {
  bg: '#0A0A0A', surface: '#171717', elevated: '#262626',
  primary: '#FF3B30', accent: '#CCFF00', text: '#FFFFFF',
  textSec: '#A3A3A3', border: 'rgba(255,255,255,0.1)',
  success: '#34C759', warning: '#FF9500',
};

function sevColor(s: string) {
  if (s === 'low') return COLORS.success;
  if (s === 'medium') return COLORS.warning;
  if (s === 'high') return '#FF6B00';
  return COLORS.primary;
}

export default function ImpactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [impact, setImpact] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token && id) {
      impactsAPI.get(token, id).then(setImpact).catch(console.error).finally(() => setLoading(false));
    }
  }, [token, id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!impact) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Evento no encontrado</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const d = impact.ai_diagnosis;
  const color = sevColor(impact.severity);
  const date = new Date(impact.created_at).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity testID="impact-detail-back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>DETALLE DEL IMPACTO</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Severity Banner */}
        <View style={[styles.sevBanner, { backgroundColor: `${color}15`, borderColor: `${color}40` }]}>
          <View style={styles.sevRow}>
            <View>
              <Text style={styles.sevLabel}>SEVERIDAD</Text>
              <Text style={[styles.sevValue, { color }]}>{impact.severity_label || impact.severity}</Text>
            </View>
            <View style={styles.gBlock}>
              <Text style={[styles.gForceVal, { color }]}>{impact.g_force?.toFixed(1)}</Text>
              <Text style={styles.gUnit}>G</Text>
            </View>
          </View>
          <Text style={styles.dateText}>{date}</Text>
          {impact.alerts_sent && (
            <View style={styles.alertSentBadge}>
              <Ionicons name="notifications" size={12} color={COLORS.accent} />
              <Text style={styles.alertSentText}>Alertas enviadas</Text>
            </View>
          )}
        </View>

        {/* Telemetry Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DATOS DE TELEMETRÍA</Text>
          <View style={styles.dataGrid}>
            <DataItem label="Accel X" value={impact.acceleration?.x?.toFixed(3)} unit="m/s²" />
            <DataItem label="Accel Y" value={impact.acceleration?.y?.toFixed(3)} unit="m/s²" />
            <DataItem label="Accel Z" value={impact.acceleration?.z?.toFixed(3)} unit="m/s²" />
            <DataItem label="Gyro X" value={impact.gyroscope?.x?.toFixed(3)} unit="°/s" />
            <DataItem label="Gyro Y" value={impact.gyroscope?.y?.toFixed(3)} unit="°/s" />
            <DataItem label="Gyro Z" value={impact.gyroscope?.z?.toFixed(3)} unit="°/s" />
          </View>
        </View>

        {/* Location */}
        {impact.location && impact.location.latitude && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>UBICACIÓN</Text>
            <View style={styles.locRow}>
              <Ionicons name="location" size={16} color={COLORS.primary} />
              <Text style={styles.locText}>
                {impact.location.latitude?.toFixed(4)}, {impact.location.longitude?.toFixed(4)}
              </Text>
            </View>
          </View>
        )}

        {/* AI Diagnosis */}
        {d ? (
          <View style={styles.section}>
            <View style={styles.aiHeader}>
              <Ionicons name="sparkles" size={18} color={COLORS.accent} />
              <Text style={styles.sectionTitle}>DIAGNÓSTICO IA</Text>
            </View>

            <View style={styles.diagBlock}>
              <Text style={styles.diagLabel}>EVALUACIÓN DE SEVERIDAD</Text>
              <Text style={styles.diagValue}>{d.severity_assessment}</Text>
            </View>

            <View style={styles.diagBlock}>
              <Text style={styles.diagLabel}>NIVEL DE PRIORIDAD</Text>
              <View style={[styles.priorityBadge, { backgroundColor: `${color}20` }]}>
                <Text style={[styles.priorityText, { color }]}>{d.priority_level?.toUpperCase()}</Text>
              </View>
            </View>

            {d.possible_injuries?.length > 0 && (
              <View style={styles.diagBlock}>
                <Text style={styles.diagLabel}>POSIBLES LESIONES</Text>
                {d.possible_injuries.map((item: string, i: number) => (
                  <View key={i} style={styles.listItem}>
                    <Ionicons name="alert-circle" size={14} color={COLORS.warning} />
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {d.first_aid_steps?.length > 0 && (
              <View style={styles.diagBlock}>
                <Text style={styles.diagLabel}>PRIMEROS AUXILIOS</Text>
                {d.first_aid_steps.map((item: string, i: number) => (
                  <View key={i} style={styles.listItem}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {d.emergency_recommendations?.length > 0 && (
              <View style={styles.diagBlock}>
                <Text style={styles.diagLabel}>RECOMENDACIONES PARA EMERGENCIA</Text>
                {d.emergency_recommendations.map((item: string, i: number) => (
                  <View key={i} style={styles.listItem}>
                    <Ionicons name="medkit" size={14} color={COLORS.primary} />
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.noDiag}>
              <Ionicons name="sparkles-outline" size={32} color="#333" />
              <Text style={styles.noDiagText}>Diagnóstico IA no disponible</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DataItem({ label, value, unit }: { label: string; value?: string; unit: string }) {
  return (
    <View style={styles.dataItem}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value || '-'}</Text>
      <Text style={styles.dataUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#666', fontSize: 16, marginBottom: 16 },
  backLink: { padding: 12 },
  backLinkText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: 2 },
  sevBanner: { borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 16 },
  sevRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sevLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSec, letterSpacing: 2 },
  sevValue: { fontSize: 28, fontWeight: '900', textTransform: 'uppercase', marginTop: 4 },
  gBlock: { flexDirection: 'row', alignItems: 'flex-end' },
  gForceVal: { fontSize: 48, fontWeight: '900', lineHeight: 52 },
  gUnit: { fontSize: 18, fontWeight: '700', color: COLORS.textSec, marginBottom: 6, marginLeft: 2 },
  dateText: { fontSize: 12, color: COLORS.textSec, marginTop: 12 },
  alertSentBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  alertSentText: { fontSize: 11, color: COLORS.accent, fontWeight: '700' },
  section: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.textSec, letterSpacing: 2, marginBottom: 12 },
  dataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dataItem: { width: '47%', flexGrow: 1, backgroundColor: COLORS.bg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  dataLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSec, letterSpacing: 1, marginBottom: 4 },
  dataValue: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  dataUnit: { fontSize: 10, color: '#666', marginTop: 2 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locText: { fontSize: 14, color: COLORS.text, fontFamily: 'monospace' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  diagBlock: { marginBottom: 20 },
  diagLabel: { fontSize: 10, fontWeight: '700', color: COLORS.accent, letterSpacing: 2, marginBottom: 8 },
  diagValue: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  priorityBadge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
  priorityText: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  listText: { fontSize: 14, color: COLORS.text, flex: 1, lineHeight: 20 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.elevated, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 11, fontWeight: '800', color: COLORS.accent },
  noDiag: { alignItems: 'center', paddingVertical: 24 },
  noDiagText: { fontSize: 14, color: '#666', marginTop: 8 },
});
