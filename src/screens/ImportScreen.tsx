// ImportScreen — one-time data migration from the legacy kb-custom app.
//
// Picks the JSON file produced by the legacy app's ExportScreen, sends it to
// the `import` edge function (transactional, idempotent upsert), then shows the
// per-collection counters. After a successful import, pull refreshes the cache.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiImportPayload } from '../storage/api';
import { pullAll } from '../storage';
import { Spacing, Radius, Typography } from '../theme';
import { useSettings } from '../context/SettingsContext';
import { useAppContext } from '../context/AppContext';

export default function ImportScreen({ onClose }: { onClose: () => void }) {
  const { colors, reloadFromCache: reloadSettings } = useSettings();
  const { reloadFromCache: reloadApp } = useAppContext();
  const { top } = useSafeAreaInsets();
  const [status, setStatus] = useState<'idle' | 'reading' | 'importing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<string>('');

  async function pickAndImport() {
    setStatus('reading');
    setMessage('');
    setSummary('');
    try {
      const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: 'application/json' });
      if (pick.canceled || !pick.assets?.length) {
        setStatus('idle');
        return;
      }
      const file = pick.assets[0];
      const raw = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      let payload: any;
      try {
        payload = JSON.parse(raw);
      } catch {
        setStatus('error');
        setMessage('That file is not valid JSON.');
        return;
      }
      if (payload?.app !== 'kbc' || !payload?.data) {
        setStatus('error');
        setMessage('Not a KBC export file.');
        return;
      }

      setStatus('importing');
      setMessage('Uploading to your backend…');
      const result = await apiImportPayload(payload);
      const c = result.counters as any;
      const lines = [
        c.profile === 'upserted' ? 'profile ✓' : null,
        c.settings === 'upserted' ? 'settings ✓' : null,
        `${c.exercises?.inserted ?? 0} new / ${c.exercises?.updated ?? 0} updated exercises`,
        `${c.templates?.inserted ?? 0} new / ${c.templates?.updated ?? 0} updated templates`,
        `${c.logs?.inserted ?? 0} new / ${c.logs?.updated ?? 0} updated logs`,
      ].filter(Boolean);
      setSummary(lines.join('\n'));

      // Refresh the local cache so the imported data appears immediately.
      await pullAll();
      // Re-read the cache into context state so every screen updates without
      // an app restart.
      await Promise.all([reloadApp(), reloadSettings()]);
      setStatus('done');
      setMessage('Import complete.');
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Ionicons
          name="close-outline"
          size={26}
          color={colors.textSecondary}
          onPress={onClose}
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Migrate Data</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-download-outline" size={56} color={colors.accent} />
        </View>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Import exercises, workout templates, history logs, and settings from a
          JSON file exported by the previous version of the app. This is
          idempotent — importing the same file twice updates in place.
        </Text>

        {summary ? (
          <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.summaryText, { color: colors.textPrimary }]}>{summary}</Text>
          </View>
        ) : null}

        <View
          style={[styles.action, { backgroundColor: colors.accent }]}
          onTouchEnd={
            status === 'reading' || status === 'importing' ? undefined : pickAndImport
          }
        >
          {status === 'reading' || status === 'importing' ? (
            <>
              <ActivityIndicator color={colors.textPrimary} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>{message}</Text>
            </>
          ) : (
            <>
              <Ionicons name="document-attach-outline" size={20} color={colors.textPrimary} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>
                {status === 'done' ? 'Import Another File' : status === 'error' ? 'Try Again' : 'Choose JSON File'}
              </Text>
            </>
          )}
        </View>

        {status === 'error' ? (
          <Text style={[styles.error, { color: colors.danger }]}>{message}</Text>
        ) : null}
        {status === 'done' ? (
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Done — your data is synced. You can close this screen.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { ...Typography.h1, fontSize: 20 },
  content: { padding: Spacing.lg, alignItems: 'center' },
  iconWrap: { marginTop: Spacing.md, marginBottom: Spacing.md },
  body: { ...Typography.body, textAlign: 'center', lineHeight: 21 },
  summary: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    width: '100%',
  },
  summaryText: { ...Typography.caption, fontFamily: 'monospace' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.xl,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    minWidth: 240,
  },
  actionText: { fontSize: 15, fontWeight: '700' },
  error: { fontSize: 13, marginTop: Spacing.md, textAlign: 'center' },
  hint: { fontSize: 12, marginTop: Spacing.md, textAlign: 'center' },
});
