// =====================================================================
// Ses Kaydı Yardımcıları — expo-audio üzerinden m4a kaydı + Supabase
// Storage upload + Edge Function transcribe çağrısı.
// =====================================================================

import { useCallback, useRef } from 'react';
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';

import { supabase, callEdgeFunction } from './supabase';
import { useAuthStore } from './store';

export interface FinishRecordingResult {
  uri: string;
  durationMs: number;
}

export function useRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const startedAtRef = useRef<number | null>(null);
  const isStartingRef = useRef(false);

  const startRecording = useCallback(async (): Promise<void> => {
    if (recorder.isRecording || isStartingRef.current) {
      throw new Error('Zaten kayıt yapılıyor');
    }
    isStartingRef.current = true;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error('Mikrofon izni reddedildi');

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAtRef.current = Date.now();
    } finally {
      isStartingRef.current = false;
    }
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<FinishRecordingResult> => {
    if (!recorder.isRecording) throw new Error('Aktif kayıt yok');
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) throw new Error('Kayıt URI alınamadı');
    const startedAt = startedAtRef.current;
    startedAtRef.current = null;
    return {
      uri,
      durationMs: startedAt ? Date.now() - startedAt : 0,
    };
  }, [recorder]);

  const cancelRecording = useCallback(async (): Promise<void> => {
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // recorder serbest bırakılmış olabilir, sessizce yut
    }
    startedAtRef.current = null;
  }, [recorder]);

  return { startRecording, stopRecording, cancelRecording };
}

export async function uploadAudioAndTranscribe(args: {
  localUri: string;
  sessionId: string;
  sequenceNo: number;
}): Promise<{ audioPath: string; transcript: string }> {
  const jwt = useAuthStore.getState().jwt;
  if (!jwt) throw new Error('Oturum açık değil');

  const ext = args.localUri.split('.').pop()?.toLowerCase() ?? 'm4a';
  const path = `${args.sessionId}/seq-${args.sequenceNo}-${Date.now()}.${ext}`;

  const response = await fetch(args.localUri);
  const buffer = await response.arrayBuffer();

  const { error: upErr } = await supabase.storage
    .from('answer-audio')
    .upload(path, buffer, { contentType: 'audio/m4a', upsert: false });
  if (upErr) throw new Error(`Ses yüklenemedi: ${upErr.message}`);

  const result = await callEdgeFunction<{ text: string }>(
    'transcribe',
    { audio_path: path, bucket: 'answer-audio', language: 'tr' },
    jwt,
  );

  return { audioPath: path, transcript: result.text ?? '' };
}
