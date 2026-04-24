import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../src/theme';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const router = useRouter();

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) { setError('Completa todos los campos'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setError('');
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || 'Error al registrarse');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="shield-checkmark" size={42} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>C.R.A.S.H.</Text>
            <Text style={styles.subtitle}>Crea tu cuenta</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Registro</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={COLORS.primary} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOMBRE</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color={COLORS.textSec} />
                <TextInput testID="register-name-input" style={styles.input} placeholder="Tu nombre completo" placeholderTextColor={COLORS.textDim} value={name} onChangeText={setName} />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>EMAIL</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color={COLORS.textSec} />
                <TextInput testID="register-email-input" style={styles.input} placeholder="tu@email.com" placeholderTextColor={COLORS.textDim} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>CONTRASEÑA</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.textSec} />
                <TextInput testID="register-password-input" style={styles.input} placeholder="Mínimo 6 caracteres" placeholderTextColor={COLORS.textDim} value={password} onChangeText={setPassword} secureTextEntry={!showPass} />
                <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                  <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={COLORS.textSec} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity testID="register-submit-btn" style={[styles.button, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>CREAR CUENTA</Text>}
            </TouchableOpacity>

            <TouchableOpacity testID="go-to-login-btn" style={styles.linkBtn} onPress={() => router.back()}>
              <Text style={styles.linkText}>¿Ya tienes cuenta? <Text style={styles.linkAccent}>Inicia sesión</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING.lg },
  header: { alignItems: 'center', marginBottom: SPACING.xl },
  logoContainer: { width: 80, height: 80, borderRadius: RADIUS.xl, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  title: { fontSize: 36, fontWeight: '900', color: COLORS.text, letterSpacing: 4 },
  subtitle: { fontSize: 13, color: COLORS.textSec, marginTop: 4 },
  form: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  formTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primarySoft, padding: 12, borderRadius: RADIUS.md, marginBottom: SPACING.md },
  errorText: { color: COLORS.primary, fontSize: 13, flex: 1 },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.textSec, letterSpacing: 2, marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: RADIUS.md, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border, gap: 10 },
  input: { flex: 1, height: 48, color: COLORS.text, fontSize: 15 },
  button: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 2 },
  linkBtn: { alignItems: 'center', marginTop: SPACING.md },
  linkText: { color: COLORS.textSec, fontSize: 13 },
  linkAccent: { color: COLORS.accent, fontWeight: '700' },
});
