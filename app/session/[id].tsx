import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { HeaderBar, Logo } from '@/components/HeaderBar';
import { MetricCard } from '@/components/MetricCard';
import { BodyLanguagePills, VoiceTonePills } from '@/components/SignalPills';
import { ChatBubble, type ChatBubbleType } from '@/components/ChatBubble';
import { FinishModal } from '@/components/FinishModal';
import { colors, radius, spacing, typography } from '@/lib/theme';
import {
  generateOpeningMove,
  getMessages,
  getOrCreateSession,
  processAnswer,
} from '@/lib/sessions';
import { updateCaseStatus, getCase } from '@/lib/cases';
import { useRecorder, uploadAudioAndTranscribe } from '@/lib/audio';
import { useInterrogationStore } from '@/lib/store';
import { getTactic } from '@/lib/tactics';
import type { Case, Message, Session } from '@/lib/types';

const PHASE_TR: Record<string, string> = {
  opening: 'Başlangıç',
  story_locking: 'Hikayeye Sabitleme',
  evidence_pressure: 'Delil Baskısı',
  confession_approach: 'İtiraf Yaklaşımı',
};
function phaseToTurkish(phase: string): string {
  return PHASE_TR[phase] ?? phase;
}

interface ChatItem {
  id: string;
  type: ChatBubbleType;
  content: string;
  tactic?: string;
}

export default function SessionScreen() {
  const router = useRouter();
  const { id: caseId } = useLocalSearchParams<{ id: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const {
    session,
    setSession,
    selectedBodyLanguage,
    selectedVoiceTone,
    toggleBodyLanguage,
    toggleVoiceTone,
    clearSignals,
    isRecording,
    setRecording,
    isProcessing,
    setProcessing,
    reset,
  } = useInterrogationStore();

  const { startRecording, stopRecording, cancelRecording } = useRecorder();

  const [caseRow, setCaseRow] = useState<Case | null>(null);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [lastAiMessageId, setLastAiMessageId] = useState<string | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<{
    text: string;
    audioPath: string;
  } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const recordPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isRecording) {
      recordPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordPulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(recordPulse, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, recordPulse]);

  // ---------------------------------------------------------------------
  // İlk yükleme: session'ı oluştur/getir, mesajları çek, gerekirse opening
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!caseId) {
        setBootError('Vaka kimliği bulunamadı');
        return;
      }
      try {
        const [c, sess] = await Promise.all([getCase(caseId), getOrCreateSession(caseId)]);
        if (cancelled) return;
        if (!c) {
          setBootError('Vaka bulunamadı');
          return;
        }
        setCaseRow(c);

        if (c.status === 'closed') {
          // Kapalı vakalarda sadece okuma
          const msgs = await getMessages(sess.id);
          setSession(sess);
          setLastAiMessageId(msgs[msgs.length - 1]?.id ?? null);
          setChatItems(buildChatFromMessages(msgs));
          return;
        }

        let msgs = await getMessages(sess.id);
        if (msgs.length === 0) {
          // İlk hamleyi üret
          setProcessing(true);
          try {
            const { message, move } = await generateOpeningMove(sess.id);
            msgs = [message];
            setLastAiMessageId(message.id);
            setSession({ ...sess, question_count: 1, questions_in_phase: 1, active_tactic: move.move.tactic_used });
            setChatItems(buildChatFromMessages(msgs));
          } finally {
            setProcessing(false);
          }
        } else {
          setSession(sess);
          setLastAiMessageId(msgs[msgs.length - 1]?.id ?? null);
          setChatItems(buildChatFromMessages(msgs));
        }
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : 'Bilinmeyen hata');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // Sayfa unmount: store'u temizle (sonraki açılışta karışmasın)
  useEffect(() => {
    return () => {
      cancelRecording().catch(() => {});
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [chatItems]);

  // ---------------------------------------------------------------------
  // Ses kaydı
  // ---------------------------------------------------------------------
  const onMicPress = useCallback(async () => {
    if (!session) return;
    if (isRecording) {
      try {
        const result = await stopRecording();
        setRecording(false);
        setProcessing(true);
        const { audioPath, transcript } = await uploadAudioAndTranscribe({
          localUri: result.uri,
          sessionId: session.id,
          sequenceNo: session.question_count,
        });
        setPendingTranscript({ text: transcript, audioPath });
        // Şüpheli baloncuğunu hemen göster (şeffaf bilgi)
        if (transcript) {
          setChatItems((prev) => [
            ...prev,
            { id: `pending-${Date.now()}`, type: 'suspect', content: transcript },
          ]);
        }
      } catch (err) {
        setRecording(false);
        Alert.alert('Kayıt hatası', err instanceof Error ? err.message : 'Bilinmeyen');
      } finally {
        setProcessing(false);
      }
    } else {
      try {
        await startRecording();
        setRecording(true);
      } catch (err) {
        Alert.alert('Mikrofon hatası', err instanceof Error ? err.message : 'Bilinmeyen');
      }
    }
  }, [isRecording, session, setRecording, setProcessing]);

  // ---------------------------------------------------------------------
  // SORU ÜRET — tam akış
  // ---------------------------------------------------------------------
  const onGenerateMove = useCallback(async () => {
    if (!session || !lastAiMessageId || !pendingTranscript) return;
    setProcessing(true);
    try {
      const result = await processAnswer({
        sessionId: session.id,
        previousMessageId: lastAiMessageId,
        answerText: pendingTranscript.text,
        answerAudioUrl: pendingTranscript.audioPath,
        bodyLanguage: selectedBodyLanguage,
        voiceTone: selectedVoiceTone,
      });

      // chat akışını güncelle
      setChatItems((prev) => {
        // 'pending-' ile eklediğimiz baloncuğu kalıcı baloncukla değiştir
        const filtered = prev.filter((c) => !c.id.startsWith('pending-'));
        const additions: ChatItem[] = [];
        // Önceki AI mesajına verilen şüpheli cevabı (kalıcı):
        additions.push({
          id: `${lastAiMessageId}-answer`,
          type: 'suspect',
          content: pendingTranscript.text,
        });
        // Çelişki / tutarsızlık bildirimleri (yeni hamlenin analiz çıktısından)
        for (const c of result.newMove.analysis.contradictions) {
          additions.push({
            id: `alert-${additions.length}-${Date.now()}`,
            type: c.type === 'inconsistency' ? 'inconsistency_alert' : 'contradiction_alert',
            content: c.message,
          });
        }
        // Stres / kırılma uyarısı
        if (result.signal?.is_breaking_point) {
          additions.push({
            id: `stress-${Date.now()}`,
            type: 'stress_alert',
            content: result.signal.meaning,
          });
        }
        // Faz değişimi
        if (result.phaseChanged) {
          additions.push({
            id: `phase-${Date.now()}`,
            type: 'phase_change',
            content: `Yeni faz: ${phaseToTurkish(result.newSession.current_phase)}`,
          });
        }
        // Genel analiz notu (yorum varsa)
        if (result.newMove.analysis.strategic_note) {
          additions.push({
            id: `note-${Date.now()}`,
            type: 'analysis_alert',
            content: result.newMove.analysis.strategic_note,
          });
        }
        // Yeni AI hamlesi
        additions.push({
          id: result.newAiMessage.id,
          type: 'ai',
          content: result.newAiMessage.question,
          tactic: result.newAiMessage.tactic_used ?? undefined,
        });

        return [...filtered, ...additions];
      });

      setSession(result.newSession);
      setLastAiMessageId(result.newAiMessage.id);
      setPendingTranscript(null);
      clearSignals();
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Bilinmeyen');
    } finally {
      setProcessing(false);
    }
  }, [
    session,
    lastAiMessageId,
    pendingTranscript,
    selectedBodyLanguage,
    selectedVoiceTone,
    setSession,
    setProcessing,
    clearSignals,
  ]);

  // ---------------------------------------------------------------------
  // Bitirme
  // ---------------------------------------------------------------------
  const onComplete = async () => {
    if (!caseRow || !session) return;
    setFinishBusy(true);
    try {
      await updateCaseStatus(caseRow.id, 'closed');
      setFinishOpen(false);
      router.replace(`/survey/${session.id}`);
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Bilinmeyen');
    } finally {
      setFinishBusy(false);
    }
  };

  const onExitForNow = () => {
    setFinishOpen(false);
    router.replace('/');
  };

  if (bootError) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Sorgu yüklenemedi</Text>
        <Text style={styles.errorText}>{bootError}</Text>
        <Pressable onPress={() => router.replace('/')} style={styles.errorBtn}>
          <Text style={styles.errorBtnText}>ANA SAYFAYA DÖN</Text>
        </Pressable>
      </View>
    );
  }

  if (!session || !caseRow) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.brandBlue} />
      </View>
    );
  }

  const canGenerate =
    !!pendingTranscript &&
    pendingTranscript.text.length > 0 &&
    !isProcessing &&
    !isRecording &&
    caseRow.status === 'open';

  const isReadOnly = caseRow.status === 'closed';

  return (
    <View style={styles.flex}>
      <HeaderBar
        left={<Logo small />}
        right={
          <View style={styles.headerRight}>
            <View style={styles.headerCase}>
              <Text style={styles.headerCaseCode}>VAKA #{caseRow.case_code}</Text>
              <Text style={styles.headerSuspect}>
                {caseRow.suspect_name} {caseRow.suspect_surname}
              </Text>
            </View>
          </View>
        }
      />

      {/* Metrik kartları */}
      <View style={styles.metricsRow}>
        <MetricCard label="ÇELİŞKİ" value={session.contradiction_score} />
        <MetricCard label="KAÇINMA" value={session.avoidance_score} />
        <MetricCard label="STRES" value={session.stress_score} />
        <MetricCard label="TUTARSIZLIK" value={session.inconsistency_score} />
      </View>

{/* Sinyal panelleri (read-only modda gizli) */}
      {!isReadOnly ? (
        <View>
          <BodyLanguagePills
            selected={selectedBodyLanguage}
            onToggle={toggleBodyLanguage}
          />
          <VoiceTonePills
            selected={selectedVoiceTone}
            onToggle={toggleVoiceTone}
          />
        </View>
      ) : null}

      {/* Chat alanı */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
      >
        {chatItems.map((c) => (
          <ChatBubble key={c.id} type={c.type} content={c.content} tactic={c.tactic} />
        ))}
        {isProcessing ? (
          <View style={styles.processing}>
            <ActivityIndicator color={colors.brandBlue} />
            <Text style={styles.processingText}>İşleniyor...</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Alt aksiyon barı */}
      {!isReadOnly ? (
        <View style={[styles.actionBar, { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) }]}>
          <Pressable
            onPress={onMicPress}
            disabled={isProcessing}
            style={({ pressed }) => [
              styles.micButton,
              isRecording && styles.micRecording,
              pressed && { opacity: 0.85 },
              isProcessing && { opacity: 0.5 },
            ]}
          >
            <Animated.View
              style={[
                styles.micPulse,
                {
                  opacity: recordPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
                  transform: [
                    {
                      scale: recordPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }),
                    },
                  ],
                },
              ]}
            />
            <Text style={styles.micIcon}>{isRecording ? '■' : '●'}</Text>
          </Pressable>

          <Pressable
            onPress={onGenerateMove}
            disabled={!canGenerate}
            style={({ pressed }) => [
              styles.generateButton,
              !canGenerate && styles.generateDisabled,
              pressed && canGenerate && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.generateText}>SORU ÜRET</Text>
          </Pressable>

          <Pressable
            onPress={() => setFinishOpen(true)}
            style={({ pressed }) => [styles.finishButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.finishText}>BİTİR</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.readOnlyBar}>
          <Text style={styles.readOnlyText}>BU VAKA KAPALI — SALT OKUNUR</Text>
        </View>
      )}

      <FinishModal
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        onComplete={onComplete}
        onExitForNow={onExitForNow}
        busy={finishBusy}
      />
    </View>
  );
}

// ---------------------------------------------------------------------
// Yardımcı: messages → ChatItem[]
// ---------------------------------------------------------------------
function buildChatFromMessages(messages: Message[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const m of messages) {
    items.push({
      id: m.id,
      type: 'ai',
      content: m.question,
      tactic: m.tactic_used ?? undefined,
    });
    // Bu AI mesajının analiz notları (içerikteki çelişkiler, vb.)
    if (m.analysis_notes) {
      const notes = m.analysis_notes as { contradictions?: Array<{ type: string; message: string }> };
      for (const c of notes?.contradictions ?? []) {
        items.push({
          id: `${m.id}-note-${items.length}`,
          type: c.type === 'inconsistency' ? 'inconsistency_alert' : 'contradiction_alert',
          content: c.message,
        });
      }
    }
    // Şüpheli cevabı (varsa)
    if (m.answer) {
      items.push({
        id: `${m.id}-answer`,
        type: 'suspect',
        content: m.answer,
      });
    }
  }
  return items;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },

  loadingScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: { ...typography.headlineMd, color: colors.brandRed, marginBottom: spacing.sm },
  errorText: { ...typography.bodyMd, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  errorBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: colors.brandBlue,
    borderRadius: radius.md,
  },
  errorBtnText: { ...typography.labelCaps, color: colors.textOnPrimary, fontSize: 12 },

  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerCase: { alignItems: 'flex-end' },
  headerCaseCode: { ...typography.labelCaps, color: colors.brandBlue, fontSize: 9 },
  headerSuspect: { ...typography.bodyMd, color: colors.textPrimary, fontSize: 12 },

  metricsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 6,
  },

  chat: { flex: 1 },
  chatContent: { paddingVertical: spacing.md, paddingBottom: 24 },

  processing: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  processingText: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 11,
  },

  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRecording: { backgroundColor: colors.brandRed },
  micPulse: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandRed,
  },
  micIcon: { color: colors.textOnPrimary, fontSize: 18 },

  generateButton: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateDisabled: { backgroundColor: colors.border, opacity: 0.6 },
  generateText: { ...typography.labelCaps, color: colors.textOnPrimary, fontSize: 13 },

  finishButton: {
    height: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishText: { ...typography.labelCaps, color: colors.brandRed, fontSize: 11 },

  readOnlyBar: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  readOnlyText: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 10,
  },
});
