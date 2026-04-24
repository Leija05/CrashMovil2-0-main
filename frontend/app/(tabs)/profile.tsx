import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  RefreshControl, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { COLORS, RADIUS, SPACING } from '../../src/theme';
import { useAuth } from '../../src/context/AuthContext';
import { profileAPI } from '../../src/services/api';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function ProfileScreen() {
  const { user } = useAuth();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [fullName, setFullName] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [allergiesText, setAllergiesText] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [disabilitiesText, setDisabilitiesText] = useState('');
  const [notes, setNotes] = useState('');

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const p = await profileAPI.get(token);
      setFullName(p.full_name || '');
      setBloodType(p.blood_type || '');
      setAllergiesText((p.allergies || []).join(', '));
      setConditionsText((p.medical_conditions || []).join(', '));
      setDisabilitiesText((p.disabilities || []).join(', '));
      setNotes(p.emergency_notes || '');
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const saveProfile = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await profileAPI.update(token, {
        full_name: fullName.trim(),
        blood_type: bloodType,
        allergies: allergiesText.split(',').map(s => s.trim()).filter(Boolean),
        medical_conditions: conditionsText.split(',').map(s => s.trim()).filter(Boolean),
        disabilities: disabilitiesText.split(',').map(s => s.trim()).filter(Boolean),
        emergency_notes: notes.trim(),
      });
      Alert.alert('Guardado', 'Tu perfil médico fue actualizado');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.accent} />}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>PERFIL MÉDICO</Text>
            <Text style={styles.subtitle}>Esta información se comparte automáticamente con emergencias.</Text>
          </View>

          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Ionicons name="person" size={28} color={COLORS.accent} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user?.name}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>
          </View>

          {/* Personal */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DATOS PERSONALES</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOMBRE COMPLETO</Text>
              <TextInput testID="profile-fullname-input" style={styles.input} value={fullName} onChangeText={setFullName} placeholderTextColor={COLORS.textDim} placeholder="Tu nombre" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>TIPO DE SANGRE</Text>
              <View style={styles.bloodGrid}>
                {BLOOD_TYPES.map(bt => (
                  <TouchableOpacity key={bt} testID={`blood-type-${bt}`} style={[styles.bloodBtn, bloodType === bt && styles.bloodBtnActive]} onPress={() => setBloodType(bt)}>
                    <Text style={[styles.bloodText, bloodType === bt && styles.bloodTextActive]}>{bt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Medical */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>INFORMACIÓN MÉDICA</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>ALERGIAS (separadas por coma)</Text>
              <TextInput testID="profile-allergies-input" style={styles.input} value={allergiesText} onChangeText={setAllergiesText} placeholder="Penicilina, aspirina..." placeholderTextColor={COLORS.textDim} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>CONDICIONES MÉDICAS</Text>
              <TextInput testID="profile-conditions-input" style={styles.input} value={conditionsText} onChangeText={setConditionsText} placeholder="Diabetes, hipertensión..." placeholderTextColor={COLORS.textDim} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>DISCAPACIDADES</Text>
              <TextInput testID="profile-disabilities-input" style={styles.input} value={disabilitiesText} onChangeText={setDisabilitiesText} placeholder="Ninguna" placeholderTextColor={COLORS.textDim} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOTAS DE EMERGENCIA</Text>
              <TextInput testID="profile-notes-input" style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} placeholder="Información adicional para servicios de emergencia..." placeholderTextColor={COLORS.textDim} multiline numberOfLines={3} textAlignVertical="top" />
            </View>
          </View>

          <TouchableOpacity testID="save-profile-btn" style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveProfile} disabled={saving}>
            {saving ? <ActivityIndicator color="#0A0A0A" /> : (
              <>
                <Ionicons name="save" size={16} color="#0A0A0A" />
                <Text style={styles.saveBtnText}>GUARDAR PERFIL</Text>
              </>
            )}
          </TouchableOpacity>
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
  title: { fontSize: 20, fontWeight: '900', color: COLORS.text, letterSpacing: 2 },
  subtitle: { fontSize: 12, color: COLORS.textSec, marginTop: 4 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  userAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.accentSoft, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  userEmail: { fontSize: 12, color: COLORS.textSec, marginTop: 2 },
  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: COLORS.textSec, letterSpacing: 2, marginBottom: SPACING.md },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 10, fontWeight: '700', color: COLORS.textSec, letterSpacing: 2, marginBottom: 6 },
  input: { backgroundColor: COLORS.bg, borderRadius: RADIUS.md, paddingHorizontal: 14, minHeight: 48, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  textArea: { height: 90, paddingTop: 12 },
  bloodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bloodBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  bloodBtnActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  bloodText: { fontSize: 14, fontWeight: '700', color: COLORS.textSec },
  bloodTextActive: { color: COLORS.primary },
  saveBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.accent, borderRadius: RADIUS.pill, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveBtnText: { color: '#0A0A0A', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
});
