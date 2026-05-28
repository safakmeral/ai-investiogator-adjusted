// =====================================================================
// Kamera frame yakalama hook'u (react-native-vision-camera)
// Kayıt sırasında ~150ms aralıkla takeSnapshot() çağırır, base64 JPEG'i
// analysisSocket üzerinden Python servise akıtır.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type CameraDevice,
} from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system/legacy';

import { analysisSocket } from './analysisSocket';

const SNAPSHOT_INTERVAL_MS = 150;   // ~6-7fps capture
const SNAPSHOT_QUALITY = 40;         // 0-100

export interface CaptureMeta {
  sessionId: string;
  suspectName: string;
  caseCode: string;
}

export interface UseCameraCapture {
  cameraRef: React.MutableRefObject<Camera | null>;
  device: CameraDevice | undefined;
  hasCameraPermission: boolean;
  requestPermission: () => Promise<boolean>;
  isCapturing: boolean;
  startCapture: (meta: CaptureMeta) => void;
  stopCapture: () => void;
}

export function useCameraCapture(): UseCameraCapture {
  const cameraRef = useRef<Camera | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const metaRef = useRef<CaptureMeta | null>(null);

  const device = useCameraDevice('front') ?? useCameraDevice('back');
  const { hasPermission, requestPermission: askPermission } = useCameraPermission();
  const [isCapturing, setIsCapturing] = useState(false);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (hasPermission) return true;
    const granted = await askPermission();
    return !!granted;
  }, [hasPermission, askPermission]);

  const captureFrame = useCallback(async () => {
    if (busyRef.current) return;
    const cam = cameraRef.current;
    const meta = metaRef.current;
    if (!cam || !meta) return;

    busyRef.current = true;
    try {
      const snap = await cam.takeSnapshot({ quality: SNAPSHOT_QUALITY });
      // snap.path: file URI (Android: /data/.../tmp.jpg, iOS: /var/.../tmp.jpg)
      const uri = snap.path.startsWith('file://') ? snap.path : `file://${snap.path}`;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      analysisSocket.sendFrame(base64, meta);

      // temp dosyayı temizle (fire-and-forget)
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    } catch (err) {
      console.warn('[cameraCapture] snapshot failed', err);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const startCapture = useCallback(
    (meta: CaptureMeta) => {
      if (intervalRef.current) return;
      metaRef.current = meta;
      setIsCapturing(true);
      // İlk frame'i hemen, sonra interval ile
      captureFrame();
      intervalRef.current = setInterval(captureFrame, SNAPSHOT_INTERVAL_MS);
    },
    [captureFrame],
  );

  const stopCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metaRef.current = null;
    busyRef.current = false;
    setIsCapturing(false);
  }, []);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return {
    cameraRef,
    device,
    hasCameraPermission: hasPermission,
    requestPermission,
    isCapturing,
    startCapture,
    stopCapture,
  };
}
