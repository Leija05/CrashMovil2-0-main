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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) { setError('Completa todos los campos'); return; }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || 'Error al iniciar sesión');
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
            <Text style={styles.subtitle}>Collision Response & Alert Safety Hub</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Iniciar sesión</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={COLORS.primary} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>EMAIL</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color={COLORS.textSec} />
                <TextInput
                  testID="login-email-input"
                  style={styles.input}
                  placeholder="tu@email.com"
                  placeholderTextColor={COLORS.textDim}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>CONTRASEÑA</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.textSec} />
                <TextInput
                  testID="login-password-input"
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textDim}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} testID="toggle-password-btn">
                  <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={COLORS.textSec} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              testID="login-submit-btn"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>ENTRAR</Text>}
            </TouchableOpacity>

            <TouchableOpacity testID="go-to-register-btn" style={styles.linkBtn} onPress={() => router.push('/register')}>
              <Text style={styles.linkText}>¿No tienes cuenta? <Text style={styles.linkAccent}>Regístrate</Text></Text>
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
  logoContainer: {
    width: 80, height: 80, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  title: { fontSize: 36, fontWeight: '900', color: COLORS.text, letterSpacing: 4 },
  subtitle: { fontSize: 11, color: COLORS.textSec, letterSpacing: 1.5, marginTop: 4, textTransform: 'uppercase' },
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
