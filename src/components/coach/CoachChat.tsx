// CoachChat — full-screen chat modal for the AI Coach.
//
// Conversation is in-memory only (reset when the modal closes). The compressed
// app context is built once per modal-open via useMemo so it doesn't rebuild on
// every keystroke. The AI returns a structured response: a reply string plus
// optional template/exercises/blockDefs, which render as a TemplatePreviewCard
// attached to the AI message bubble.

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Keyboard,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';
import { useAppContext } from '../../context/AppContext';
import { buildChatContext } from '../../utils/contextBuilder';
import { chatWithAI, ChatMessage, AIChatResponse } from '../../services/ai';
import TemplatePreviewCard from './TemplatePreviewCard';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** AI responses may carry a template/exercises/blockDefs to preview. */
  aiResponse?: AIChatResponse;
  error?: boolean;
}

const SUGGESTIONS = [
  'Build me a 20-min conditioning workout',
  'Create a strength-focused session with my 24kg bell',
  'I want to work on my core and shoulders',
];

let msgIdCounter = 0;
const nextId = () => `msg-${++msgIdCounter}`;

export default function CoachChat({ visible, onClose }: Props) {
  const { top, bottom } = useSafeAreaInsets();
  const { colors } = useSettings();
  const { profile, settings } = useSettings();
  const { exercises, templates, logs } = useAppContext();
  const styles = makeStyles(colors);

  // Context is built once per modal-open (resets if data changes while open).
  const context = useMemo(
    () => buildChatContext(profile, exercises, templates, logs, settings.customBlockDefs),
    [profile, exercises, templates, logs, settings.customBlockDefs],
  );

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList<DisplayMessage>>(null);

  // Reset conversation when the modal opens.
  useEffect(() => {
    if (visible) {
      setMessages([
        {
          id: nextId(),
          role: 'assistant',
          content:
            `Hey${profile.name ? ` ${profile.name}` : ''}! I'm your KBC Coach. Tell me what you're training for, what bell you've got, and how long you want to work out — I'll build you a workout.`,
        },
      ]);
      setInput('');
      setLoading(false);
    }
  }, [visible, profile.name]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: DisplayMessage = { id: nextId(), role: 'user', content: trimmed };
      const priorMessages = messages;
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      Keyboard.dismiss();

      try {
        // Build the conversation history for the API (content only).
        const history: ChatMessage[] = [...priorMessages, userMsg]
          .filter((m) => !m.error)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await chatWithAI(history, context);

        const aiMsg: DisplayMessage = {
          id: nextId(),
          role: 'assistant',
          content: res.reply,
          aiResponse: res,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', content: `⚠️ ${msg}`, error: true },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, context],
  );

  const renderItem = ({ item }: { item: DisplayMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAI]}>
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.bubbleUser, { backgroundColor: colors.accentDim }]
              : [styles.bubbleAI, { backgroundColor: colors.surfaceElevated }, item.error && { borderColor: colors.warning }],
          ]}
        >
          {!isUser && (
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
              <Ionicons name="sparkles" size={12} color="#fff" />
            </View>
          )}
          <Text style={[styles.msgText, { color: colors.textPrimary }]}>{item.content}</Text>
        </View>
        {/* Template preview attached to AI message */}
        {!isUser && item.aiResponse?.template && (
          <TemplatePreviewCard
            template={item.aiResponse.template}
            exercises={item.aiResponse.exercises}
            customBlockDefs={item.aiResponse.customBlockDefs}
          />
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: top }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Ionicons name="sparkles" size={15} color={colors.accent} />
            <Text style={[styles.headerText, { color: colors.textPrimary }]}>AI Coach</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {/* Message list (inverted so newest is at the bottom naturally) */}
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottom + Spacing.md }]}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={null}
        />

        {/* Typing indicator */}
        {loading && (
          <View style={styles.typingRow}>
            <View style={[styles.bubble, styles.bubbleAI, { backgroundColor: colors.surfaceElevated }]}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Ionicons name="sparkles" size={12} color="#fff" />
              </View>
              <TypingDots color={colors.textTertiary} />
            </View>
          </View>
        )}

        {/* Suggestions (only before first user message) */}
        {messages.length <= 1 && !loading && (
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.suggestionChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => send(s)}
                activeOpacity={0.7}
              >
                <Text style={[styles.suggestionText, { color: colors.textSecondary }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input bar */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: bottom || Spacing.sm }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.background }]}
              value={input}
              onChangeText={setInput}
              placeholder="Ask for a workout…"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: input.trim() ? colors.accent : colors.surfaceElevated }]}
              onPress={() => send(input)}
              disabled={!input.trim() || loading}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-up" size={20} color={input.trim() ? '#fff' : colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Typing indicator (three pulsing dots) ───────────────────────────────────
function TypingDots({ color }: { color: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 400);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={typingStyles.row}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            typingStyles.dot,
            { backgroundColor: color, opacity: (tick + i) % 3 === 0 ? 1 : 0.3 },
          ]}
        />
      ))}
    </View>
  );
}

const typingStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, paddingVertical: 6, paddingHorizontal: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
    },
    headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerText: { ...Typography.h3 },

    list: { padding: Spacing.md, gap: Spacing.sm },

    msgRow: { width: '100%' },
    msgRowUser: { alignItems: 'flex-end' },
    msgRowAI: { alignItems: 'stretch' },

    bubble: {
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.sm + 2,
      paddingVertical: Spacing.sm,
      maxWidth: '88%',
    },
    bubbleUser: { borderTopRightRadius: Radius.sm },
    bubbleAI: {
      borderTopLeftRadius: Radius.sm,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.xs,
    },
    avatar: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    msgText: { ...Typography.body, lineHeight: 21, flexShrink: 1 },

    typingRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs },

    suggestions: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      gap: Spacing.xs,
    },
    suggestionChip: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.full,
      borderWidth: 1,
      alignSelf: 'flex-start',
    },
    suggestionText: { ...Typography.caption },

    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      borderTopWidth: 1,
    },
    input: {
      flex: 1,
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
      maxHeight: 100,
      ...Typography.body,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
