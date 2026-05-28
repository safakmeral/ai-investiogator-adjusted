// =====================================================================
// Telefon → Python WebSocket istemcisi
// Kayıt sırasında frame'leri Python servise akıtır, gelen sinyalleri
// session ekranına yansıtır.
// =====================================================================

type AnalysisCb = (bodyLanguage: string[]) => void;
type ConnCb = (connected: boolean) => void;

interface RecordingMeta {
  sessionId: string;
  suspectName: string;
  caseCode: string;
}

const RECONNECT_DELAY_MS = 3000;

function deriveWsUrl(serviceUrl: string): string {
  // http://1.2.3.4:8001 → ws://1.2.3.4:8001/ws/phone
  return serviceUrl.replace(/^http(s?):\/\//, 'ws$1://').replace(/\/+$/, '') + '/ws/phone';
}

class AnalysisSocket {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantConnected = false;
  private analysisCbs: AnalysisCb[] = [];
  private connCbs: ConnCb[] = [];
  private lastMeta: RecordingMeta | null = null;
  private recordingActive = false;

  connect(serviceUrl: string): void {
    this.url = deriveWsUrl(serviceUrl);
    this.wantConnected = true;
    this.open();
  }

  disconnect(): void {
    this.wantConnected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.emitConn(false);
  }

  sendFrame(base64: string, meta: RecordingMeta): void {
    this.lastMeta = meta;
    this.send({
      type: 'frame',
      data: base64,
      sessionId: meta.sessionId,
      suspectName: meta.suspectName,
      caseCode: meta.caseCode,
    });
  }

  sendRecordingStart(meta: RecordingMeta): void {
    this.lastMeta = meta;
    this.recordingActive = true;
    this.send({
      type: 'recording_start',
      sessionId: meta.sessionId,
      suspectName: meta.suspectName,
      caseCode: meta.caseCode,
    });
  }

  sendRecordingStop(): void {
    this.recordingActive = false;
    this.send({ type: 'recording_stop' });
  }

  sendVoiceResult(voiceTone: string[]): void {
    this.send({ type: 'voice_result', voiceTone });
  }

  onAnalysis(cb: AnalysisCb): () => void {
    this.analysisCbs.push(cb);
    return () => {
      this.analysisCbs = this.analysisCbs.filter((c) => c !== cb);
    };
  }

  onConnectionChange(cb: ConnCb): () => void {
    this.connCbs.push(cb);
    return () => {
      this.connCbs = this.connCbs.filter((c) => c !== cb);
    };
  }

  // ---------------------------------------------------------------------
  private send(payload: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[analysisSocket] send failed', err);
    }
  }

  private open(): void {
    if (!this.url) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.warn('[analysisSocket] connect failed', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.emitConn(true);
      // Bağlantı tekrar kuruldu ve kayıt devam ediyorsa Python state'ini güncelle
      if (this.recordingActive && this.lastMeta) {
        this.send({
          type: 'recording_start',
          sessionId: this.lastMeta.sessionId,
          suspectName: this.lastMeta.suspectName,
          caseCode: this.lastMeta.caseCode,
        });
      }
    };

    this.ws.onclose = () => {
      this.emitConn(false);
      if (this.wantConnected) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose tetiklenecek; burada sessiz kal
    };

    this.ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (msg?.type === 'analysis' && Array.isArray(msg.bodyLanguage)) {
        for (const cb of this.analysisCbs) {
          try {
            cb(msg.bodyLanguage);
          } catch (e) {
            console.warn('[analysisSocket] analysis cb threw', e);
          }
        }
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.wantConnected) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, RECONNECT_DELAY_MS);
  }

  private emitConn(on: boolean): void {
    for (const cb of this.connCbs) {
      try {
        cb(on);
      } catch (e) {
        console.warn('[analysisSocket] conn cb threw', e);
      }
    }
  }
}

export const analysisSocket = new AnalysisSocket();
