import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';

interface Props {
  onRecorded: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export default function VoiceRecorder({ onRecorded, onCancel }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const dur = Math.round((Date.now() - startTimeRef.current) / 1000);
        onRecorded(blob, dur);
      };
      mediaRef.current = recorder;
      startTimeRef.current = Date.now();
      recorder.start(100);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch {
      onCancel();
    }
  }, [onRecorded, onCancel]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
    setRecording(false);
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.onstop = () => {
        mediaRef.current?.stream?.getTracks().forEach(t => t.stop());
      };
      mediaRef.current.stop();
    }
    setRecording(false);
    onCancel();
  }, [onCancel]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!recording) {
    return (
      <button onClick={start} className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-gray-100 rounded-full transition" title="Голосовое сообщение">
        <Mic className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 bg-red-50 rounded-full px-4 py-2 animate-in fade-in">
      <button onClick={cancel} className="p-1 text-gray-500 hover:text-red-500">
        <Trash2 className="w-4 h-4" />
      </button>
      <div className="flex-1 flex items-center gap-2">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="text-sm text-red-600 font-medium">{formatTime(elapsed)}</span>
        <div className="flex-1 flex items-center gap-0.5">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="w-1 bg-red-300 rounded-full animate-pulse" style={{ height: `${4 + Math.random() * 12}px`, animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>
      </div>
      <button onClick={stop} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition">
        <Square className="w-4 h-4" />
      </button>
    </div>
  );
}
