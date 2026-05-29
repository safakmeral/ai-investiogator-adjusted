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
  TextInput,
  Keyboard,
  Platform,
} from 'react-native';
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera } from 'react-native-vision-camera';

import { HeaderBar, Logo } from '@/components/HeaderBar';
import { MetricCard } from '@/components/MetricCard';
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
import { useCameraCapture } from '@/lib/cameraCapture';
import { analyzeVoiceTone } from '@/lib/bodyLanguageAnalysis';
import { analysisSocket } from '@/lib/analysisSocket';
import type { Case, Message } from '@/lib/types';

const PYTHON_SERVICE_URL =
  process.env.EXPO_PUBLIC_PYTHON_SERVICE_URL ?? 'http://localhost:8001';

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
    isRecording,
    setRecording,
    isProcessing,
    setProcessing,
    reset,
  } = useInterrogationStore();

  const { startRecording, stopRecording, cancelRecording } = useRecorder();
  const {
    cameraRef,
    device: cameraDevice,
    hasCameraPermission,
    requestPermission: requestCameraPermission,
    isCapturing,
    startCapture,
    stopCapture,
  } = useCameraCapture();

  const [caseRow, setCaseRow] = useState<Case | null>(null);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [lastAiMessageId, setLastAiMessageId] = useState<string | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<{
    text: string;
    audioPath: string;
    localUri: string;
  } | null>(null);
  const [pendingTranscriptText, setPendingTranscriptText] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  // Kullanıcının çıkış niyetini takip eder: ✓ → 'save', ✕ → 'discard',
  // klavyenin dışarıdan kapatılması (geri tuşu vb.) → null (taslak korunur)
  const closeIntentRef = useRef<'save' | 'discard' | null>(null);
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detectedSignals, setDetectedSignals] = useState<{
    bodyLanguage: string[];
    voiceTone: string[];
  }>({ bodyLanguage: [], voiceTone: [] });
  const bodyLanguageSetRef = useRef<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const textInputRef = useRef<TextInput>(null);
  const isEditingTranscriptRef = useRef(false);
  const currentScrollYRef = useRef(0);
  const savedScrollYRef = useRef<number | null>(null);
  const editDraftRef = useRef('');

  // Klavye yüksekliğini takip et — edit bar'ı klavyenin üstüne konumlandırmak için.
  // ⚡ NATIVE WORKLET: useAnimatedKeyboard reanimated UI thread'de çalışır,
  // klavyenin her frame'inde keyboard.height SharedValue olarak güncellenir.
  // JS event lag'i yoktur → edit bar klavye ile %100 senkron yukarı çıkar.
  // Samsung A15 (One UI 6 / Android 14 edge-to-edge) dahil tüm cihazlarda çalışır,
  // çünkü altta WindowInsetsAnimation API kullanılır.
  const keyboard = useAnimatedKeyboard();
  const footerAnimatedStyle = useAnimatedStyle(() => ({
    marginBottom: keyboard.height.value,
  }));
  // JS state hâlâ var: sadece "klavye açık mı?" kararı için (scroll restore,
  // closeEditBar fallback gibi mantık adımları). Layout'a DEĞMEZ artık.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

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
        // Kamera iznini erkenden iste (kullanıcı mikrofon butonuna basmadan)
        requestCameraPermission().catch(() => {});

        const [c, sess] = await Promise.all([getCase(caseId), getOrCreateSession(caseId)]);
        if (cancelled) return;
        if (!c) {
          setBootError('Vaka bulunamadı');
          return;
        }
        setCaseRow(c);

        if (c.status === 'closed') {
          const msgs = await getMessages(sess.id);
          setSession(sess);
          setLastAiMessageId(msgs[msgs.length - 1]?.id ?? null);
          setChatItems(dedupeById(buildChatFromMessages(msgs)));
          return;
        }

        let msgs = await getMessages(sess.id);
        if (msgs.length === 0) {
          setProcessing(true);
          try {
            const { message, move } = await generateOpeningMove(sess.id);
            msgs = [message];
            setLastAiMessageId(message.id);
            setSession({ ...sess, question_count: 1, questions_in_phase: 1, active_tactic: move.move.tactic_used });
            setChatItems(dedupeById(buildChatFromMessages(msgs)));
          } finally {
            setProcessing(false);
          }
        } else {
          setSession(sess);
          setLastAiMessageId(msgs[msgs.length - 1]?.id ?? null);
          setChatItems(dedupeById(buildChatFromMessages(msgs)));
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

  useEffect(() => {
    return () => {
      cancelRecording().catch(() => {});
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // editDraft state'inin son değerini ref'te tut — async olaylarda (keyboard listener)
  // kapanış üzerinden stale closure problemine düşmemek için
  useEffect(() => {
    editDraftRef.current = editDraft;
  }, [editDraft]);

  // WhatsApp-style edit kapanışı:
  //   1) ✓ ise mesaj balonunu yeni metinle güncelle (kullanıcı save niyeti).
  //   2) Edit bar'ı YERİNDE TUT — klavye dismiss animasyonu süresince kaybolmasın.
  //   3) Klavye tam kapandığında (keyboardDidHide) edit moddan çık.
  // Fallback timer: keyboardDidHide gelmezse 600ms sonra zorla kapanırız.
  const closeEditBar = useCallback((save: boolean) => {
    closeIntentRef.current = save ? 'save' : 'discard';
    if (save) setPendingTranscriptText(editDraftRef.current);
    Keyboard.dismiss();
    if (editTimerRef.current) clearTimeout(editTimerRef.current);
    editTimerRef.current = setTimeout(() => {
      editTimerRef.current = null;
      if (!isEditingTranscriptRef.current) return;
      if (closeIntentRef.current === null) {
        setPendingTranscriptText(editDraftRef.current);
      }
      closeIntentRef.current = null;
      isEditingTranscriptRef.current = false;
      setKeyboardOpen(false);
      setIsEditingTranscript(false);
    }, 600);
  }, []);

  useEffect(() => {
    // NOT: Layout (marginBottom) artık useAnimatedKeyboard ile native worklet'te
    // yönetiliyor. Bu listener'lar SADECE JS-tarafı state yönetimi için:
    // — scroll restore (edit moddan önceki konuma dön)
    // — closeEditBar fallback temizliği
    // — keyboardOpen bayrağı (paddingBottom hesabı için)
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardOpen(true);
      if (isEditingTranscriptRef.current) {
        // Edit modunda klavye açıldığında pending baloncuğu görünür kıl
        requestAnimationFrame(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        });
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (editTimerRef.current) {
        clearTimeout(editTimerRef.current);
        editTimerRef.current = null;
      }
      setKeyboardOpen(false);

      if (isEditingTranscriptRef.current) {
        // closeEditBar ✓ ise pendingTranscriptText zaten setlendi.
        // closeEditBar ✕ ise taslak yok sayılır.
        // null (external dismiss — geri tuşu, başka tap) → taslağı kaybetme.
        if (closeIntentRef.current === null) {
          setPendingTranscriptText(editDraftRef.current);
        }
        closeIntentRef.current = null;
        isEditingTranscriptRef.current = false;
        setIsEditingTranscript(false);
      }

      // Düzenleme öncesi scroll pozisyonuna geri dön
      if (savedScrollYRef.current !== null) {
        const y = savedScrollYRef.current;
        savedScrollYRef.current = null;
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y, animated: true });
        });
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // isEditingTranscript değişimini ref'e yansıt + edit moda girince TextInput'u focus'la
  useEffect(() => {
    isEditingTranscriptRef.current = isEditingTranscript;
    if (!isEditingTranscript) return;
    const timer = setTimeout(() => textInputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [isEditingTranscript]);

  // ---------------------------------------------------------------------
  // Python analiz servisi (WebSocket) — canlı sinyal akışı
  // ---------------------------------------------------------------------
  useEffect(() => {
    analysisSocket.connect(PYTHON_SERVICE_URL);
    const off = analysisSocket.onAnalysis((bodyLanguage) => {
      // Sinyalleri biriktir; aynı sinyal birden fazla frame'de gelirse tekrar etmesin
      let changed = false;
      for (const s of bodyLanguage) {
        if (!bodyLanguageSetRef.current.has(s)) {
          bodyLanguageSetRef.current.add(s);
          changed = true;
        }
      }
      if (changed) {
        setDetectedSignals((prev) => ({
          ...prev,
          bodyLanguage: Array.from(bodyLanguageSetRef.current),
        }));
      }
    });
    return () => {
      off();
      analysisSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [chatItems]);

  // ---------------------------------------------------------------------
  // Ses kaydı + kamera (paralel) — kayıt biterken analiz çağrıları
  // ---------------------------------------------------------------------
  const onMicPress = useCallback(async () => {
    if (!session || !caseRow) return;

    if (isRecording) {
      // === DURDUR ===
      try {
        // 1) Ses kaydını durdur, 2) kamerayı durdur, 3) Python'a recording_stop bildir
        const result = await stopRecording();
        stopCapture();
        analysisSocket.sendRecordingStop();
        setRecording(false);
        setProcessing(true);
        setAnalyzing(true);

        // Beden dili artık canlı geldi (analysisSocket); burada sadece
        // transkripsiyon + ses tonu gerekiyor — paralel
        const [transcribeRes, voiceTone] = await Promise.all([
          uploadAudioAndTranscribe({
            localUri: result.uri,
            sessionId: session.id,
            sequenceNo: session.question_count,
          }),
          analyzeVoiceTone(result.uri),
        ]);

        setPendingTranscript({
          text: transcribeRes.transcript,
          audioPath: transcribeRes.audioPath,
          localUri: result.uri,
        });
        setPendingTranscriptText(transcribeRes.transcript);
        setDetectedSignals((prev) => ({ ...prev, voiceTone }));
        analysisSocket.sendVoiceResult(voiceTone);
      } catch (err) {
        setRecording(false);
        Alert.alert('Kayıt hatası', err instanceof Error ? err.message : 'Bilinmeyen');
      } finally {
        setProcessing(false);
        setAnalyzing(false);
      }
    } else {
      // === BAŞLAT ===
      try {
        if (!hasCameraPermission) {
          const granted = await requestCameraPermission();
          if (!granted) {
            Alert.alert(
              'Kamera izni gerekli',
              'Beden dili analizi için kamera erişimi gereklidir.',
            );
            return;
          }
        }
        await startRecording();
        setRecording(true);

        // Yeni soru için canlı beden dili sinyal birikimini sıfırla
        bodyLanguageSetRef.current = new Set();
        setDetectedSignals({ bodyLanguage: [], voiceTone: [] });

        const meta = {
          sessionId: session.id,
          suspectName: `${caseRow.suspect_name} ${caseRow.suspect_surname}`,
          caseCode: caseRow.case_code,
        };
        analysisSocket.sendRecordingStart(meta);
        startCapture(meta);
      } catch (err) {
        Alert.alert('Mikrofon hatası', err instanceof Error ? err.message : 'Bilinmeyen');
      }
    }
  }, [
    isRecording,
    session,
    caseRow,
    setRecording,
    setProcessing,
    startRecording,
    stopRecording,
    startCapture,
    stopCapture,
    hasCameraPermission,
    requestCameraPermission,
  ]);

  // ---------------------------------------------------------------------
  // SORU ÜRET — otomatik tespit edilen sinyalleri kullan
  // ---------------------------------------------------------------------
  const onGenerateMove = useCallback(async () => {
    if (!session || !lastAiMessageId || !pendingTranscript) return;
    setProcessing(true);
    try {
      const result = await processAnswer({
        sessionId: session.id,
        previousMessageId: lastAiMessageId,
        answerText: pendingTranscriptText,
        answerAudioUrl: pendingTranscript.audioPath,
        bodyLanguage: detectedSignals.bodyLanguage,
        voiceTone: detectedSignals.voiceTone,
      });

      setChatItems((prev) => {
        const filtered = prev.filter(
          (c) => !c.id.startsWith('pending-') && c.id !== `${lastAiMessageId}-answer`,
        );
        const additions: ChatItem[] = [];
        additions.push({
          id: `${lastAiMessageId}-answer`,
          type: 'suspect',
          content: pendingTranscriptText,
        });
        for (const c of result.newMove.analysis.contradictions) {
          additions.push({
            id: `alert-${additions.length}-${Date.now()}`,
            type: c.type === 'inconsistency' ? 'inconsistency_alert' : 'contradiction_alert',
            content: c.message,
          });
        }
        if (result.signal?.is_breaking_point) {
          additions.push({
            id: `stress-${Date.now()}`,
            type: 'stress_alert',
            content: result.signal.meaning,
          });
        }
        if (result.phaseChanged) {
          additions.push({
            id: `phase-${Date.now()}`,
            type: 'phase_change',
            content: `Yeni faz: ${phaseToTurkish(result.newSession.current_phase)}`,
          });
        }
        if (result.newMove.analysis.strategic_note) {
          additions.push({
            id: `note-${Date.now()}`,
            type: 'analysis_alert',
            content: result.newMove.analysis.strategic_note,
          });
        }
        additions.push({
          id: result.newAiMessage.id,
          type: 'ai',
          content: result.newAiMessage.question,
          tactic: result.newAiMessage.tactic_used ?? undefined,
        });

        return dedupeById([...filtered, ...additions]);
      });

      setSession(result.newSession);
      setLastAiMessageId(result.newAiMessage.id);
      setPendingTranscript(null);
      setPendingTranscriptText('');
      bodyLanguageSetRef.current = new Set();
      setDetectedSignals({ bodyLanguage: [], voiceTone: [] });
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Bilinmeyen');
    } finally {
      setProcessing(false);
    }
  }, [
    session,
    lastAiMessageId,
    pendingTranscript,
    detectedSignals,
    setSession,
    setProcessing,
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
    pendingTranscriptText.trim().length > 0 &&
    !isProcessing &&
    !isRecording &&
    caseRow.status === 'open';

  const isReadOnly = caseRow.status === 'closed';
  const showCameraPreview = isCapturing && hasCameraPermission && !!cameraDevice;
  const allDetected = [...detectedSignals.bodyLanguage, ...detectedSignals.voiceTone];

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

      {/* Chat alanı */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={[
          styles.chatContent,
          // Edit modunda alt kısımda extra alan; son balon klavyenin üzerinde kalsın
          isEditingTranscript && { paddingBottom: 24 + spacing.lg },
        ]}
        onScroll={(e) => {
          currentScrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {chatItems.map((c) => (
          <ChatBubble key={c.id} type={c.type} content={c.content} tactic={c.tactic} />
        ))}

        {/* Transkript balonu — sohbet akışı içinde, basılı tut → edit.
            ⚠ NOT: Orijinal balon edit boyunca DEĞİŞMEZ (WhatsApp davranışı).
            Kullanıcı klavyede yazdıkça sadece edit field güncellenir; balon
            yalnızca ✓ ile save edildiğinde yeni metni gösterir. */}
        {!isReadOnly && pendingTranscript ? (
          <ChatBubble
            type="suspect"
            content={pendingTranscriptText}
            highlighted={isEditingTranscript}
            onLongPress={() => {
              savedScrollYRef.current = currentScrollYRef.current;
              setEditDraft(pendingTranscriptText);
              setIsEditingTranscript(true);
            }}
          />
        ) : null}

        {isProcessing ? (
          <View style={styles.processing}>
            <ActivityIndicator color={colors.brandBlue} />
            <Text style={styles.processingText}>
              {analyzing ? 'Otomatik sinyal analizi yapılıyor...' : 'İşleniyor...'}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Kamera önizlemesi — sadece kayıt sırasında */}
      {showCameraPreview && cameraDevice ? (
        <View style={styles.cameraPreviewContainer} pointerEvents="none">
          <Camera
            ref={cameraRef}
            style={styles.cameraPreview}
            device={cameraDevice}
            isActive={true}
            photo={true}
          />
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraDot} />
            <Text style={styles.cameraText}>ANALİZ</Text>
          </View>
        </View>
      ) : null}

      {/* Alt footer — edit bar VE action bar tek bir konteyner içinde.
          ⚡ marginBottom NATIVE WORKLET'le yönetilir (useAnimatedKeyboard):
             klavyenin her frame'inde footer onunla birlikte yukarı kayar.
             JS event lag'i YOK → edit bar klavyenin tam üstüne yapışık kalır.
          - Edit mode: edit bar görünür, klavyenin tam üstünde.
          - ✓/✕ → closeEditBar yalnızca Keyboard.dismiss() çağırır; edit bar SAĞ kalır.
          - keyboardDidHide → keyboardOpen=false + isEditingTranscript=false batch'lenir
            → editBar unmount + actionBar mount tek frame'de.
          - Action bar her zaman ekranın en altında, orijinal koordinatında oturur. */}
      <Reanimated.View style={footerAnimatedStyle}>
        {!isReadOnly && isEditingTranscript ? (
          <View
            style={[
              styles.editBar,
              { paddingBottom: keyboardOpen ? spacing.sm : insets.bottom },
            ]}
          >
            <Pressable
              onPress={() => closeEditBar(false)}
              style={styles.editBarCancel}
              hitSlop={8}
            >
              <Text style={styles.editBarCancelText}>✕</Text>
            </Pressable>
            <TextInput
              ref={textInputRef}
              style={styles.editBarInput}
              value={editDraft}
              onChangeText={setEditDraft}
              multiline
              textAlignVertical="top"
              autoFocus={false}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            <Pressable
              onPress={() => closeEditBar(true)}
              style={styles.editBarSave}
              hitSlop={8}
            >
              <Text style={styles.editBarSaveText}>✓</Text>
            </Pressable>
          </View>
        ) : null}

        {!isReadOnly && !isEditingTranscript ? (
          <View style={[styles.actionBar, { paddingBottom: insets.bottom }]}>
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
        ) : null}

        {isReadOnly ? (
          <View style={styles.readOnlyBar}>
            <Text style={styles.readOnlyText}>BU VAKA KAPALI — SALT OKUNUR</Text>
          </View>
        ) : null}
      </Reanimated.View>

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

function dedupeById(items: ChatItem[]): ChatItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildChatFromMessages(messages: Message[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const m of messages) {
    items.push({
      id: m.id,
      type: 'ai',
      content: m.question,
      tactic: m.tactic_used ?? undefined,
    });
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

  cameraPreviewContainer: {
    position: 'absolute',
    top: 100,
    right: 12,
    width: 100,
    height: 140,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.brandRed,
    backgroundColor: '#000',
    zIndex: 10,
  },
  cameraPreview: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cameraDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandRed,
  },
  cameraText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.5,
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

  editBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.brandBlue,
  },
  editBarCancel: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBarCancelText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  editBarInput: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brandBlue,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 120,
  },
  editBarSave: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBarSaveText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
