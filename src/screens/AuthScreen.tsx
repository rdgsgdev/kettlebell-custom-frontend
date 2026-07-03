// AuthScreen — email/password sign in & sign up. Shown when there is no session.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { DarkColors as C, Spacing, Radius, Typography } from '../theme';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <View style={styles.logoWrap}>
          <Ionicons name="barbell" size={56} color={C.accent} />
        </View>
        <Text style={styles.title}>Kettlebell Coach</Text>
        <Text style={styles.subtitle}>
          {mode === 'signin' ? 'Sign in to sync your workouts.' : 'Create an account to get started.'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={C.textTertiary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={C.textTertiary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actionRow} onTouchEnd={busy ? undefined : submit}>
          {busy ? (
            <ActivityIndicator color={C.textPrimary} />
          ) : (
            <Text style={styles.actionText}>
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Text>
          )}
        </View>

        <View style={styles.switchRow} onTouchEnd={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          <Text style={styles.switchText}>
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  inner: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: Spacing.md },
  title: { ...Typography.h1, color: C.textPrimary, textAlign: 'center' },
  subtitle: { ...Typography.body, color: C.textSecondary, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xl },
  input: {
    backgroundColor: C.surface,
    color: C.textPrimary,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.sm,
    fontSize: 16,
  },
  error: { color: C.danger, fontSize: 13, marginBottom: Spacing.sm },
  actionRow: {
    backgroundColor: C.accent,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  actionText: { color: C.textPrimary, fontSize: 16, fontWeight: '700' },
  switchRow: { marginTop: Spacing.lg, alignItems: 'center' },
  switchText: { color: C.textSecondary, fontSize: 14 },
});
