import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { contactsAPI } from '../../src/services/api';

const COLORS = {
  bg: '#0A0A0A', surface: '#171717', elevated: '#262626',
  primary: '#FF3B30', accent: '#CCFF00', text: '#FFFFFF',
  textSec: '#A3A3A3', border: 'rgba(255,255,255,0.1)',
  success: '#34C759', warning: '#FF9500',
};

export default function ContactsScreen() {
  const { token } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await contactsAPI.list(token);
      setContacts(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { fetchContacts(); }, [fetchContacts]));

  const addContact = async () => {
    if (!token || !name.trim() || !phone.trim()) return;
    setSubmitting(true);
    try {
      const created = await contactsAPI.add(token, { name: name.trim(), phone: phone.trim(), relationship: relationship.trim() });
      setContacts((prev) => [created, ...prev]);
      setName(''); setPhone(''); setRelationship('');
      setShowAdd(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSubmitting(false); }
  };

  const deleteContact = async (contactId: string) => {
    if (!token) return;
    try {
      await contactsAPI.delete(token, contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const renderContact = ({ item }: { item: any }) => (
    <View style={styles.card} testID={`contact-${item.id}`}>
      <View style={styles.cardRow}>
        <View style={[styles.avatar, { backgroundColor: item.verified ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.05)' }]}>
          <Ionicons name="person" size={20} color={item.verified ? COLORS.success : '#666'} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardPhone}>{item.phone}</Text>
          {item.relationship ? <Text style={styles.cardRel}>{item.relationship}</Text> : null}
        </View>
        <View style={styles.cardActions}>
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
            <Text style={styles.verifiedText}>ACTIVO</Text>
          </View>
          <TouchableOpacity
            testID={`delete-contact-${item.id}-btn`}
            onPress={() => deleteContact(item.id)}
            style={styles.deleteBtn}
          >
            <Ionicons name="trash-outline" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerSection}>
        <View>
          <Text style={styles.title}>CONTACTOS DE EMERGENCIA</Text>
          <Text style={styles.subtitle}>{contacts.length} contactos activos</Text>
        </View>
        <TouchableOpacity testID="add-contact-btn" style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={24} color="#0A0A0A" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderContact}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchContacts(); }} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#333" />
              <Text style={styles.emptyText}>Sin contactos de emergencia</Text>
              <Text style={styles.emptySubtext}>Agrega contactos que serán notificados en caso de impacto</Text>
            </View>
          }
        />
      )}

      {/* Add Contact Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar Contacto</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} testID="close-add-modal-btn">
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOMBRE</Text>
              <TextInput testID="contact-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor="#666" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>TELÉFONO</Text>
              <TextInput testID="contact-phone-input" style={styles.input} value={phone} onChangeText={setPhone} placeholder="+52 55 1234 5678" placeholderTextColor="#666" keyboardType="phone-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>RELACIÓN</Text>
              <TextInput testID="contact-relationship-input" style={styles.input} value={relationship} onChangeText={setRelationship} placeholder="Familiar, amigo, etc." placeholderTextColor="#666" />
            </View>
            <TouchableOpacity testID="submit-contact-btn" style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={addContact} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>AGREGAR CONTACTO</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.text, letterSpacing: 2 },
  subtitle: { fontSize: 12, color: COLORS.textSec, marginTop: 2 },
  addBtn: { backgroundColor: COLORS.accent, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardPhone: { fontSize: 12, color: COLORS.textSec, marginTop: 2 },
  cardRel: { fontSize: 11, color: '#666', marginTop: 1 },
  cardActions: { alignItems: 'flex-end', gap: 6 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 9, fontWeight: '800', color: COLORS.success, letterSpacing: 1 },
  deleteBtn: { padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#666', marginTop: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 12, color: '#444', marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 10, fontWeight: '700', color: COLORS.textSec, letterSpacing: 2, marginBottom: 6 },
  input: { backgroundColor: COLORS.bg, borderRadius: 12, paddingHorizontal: 14, height: 48, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 25, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
});
