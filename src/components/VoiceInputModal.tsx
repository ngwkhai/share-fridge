import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { ParsedFoodItem } from '../types';
import { Dialog } from './Dialog';

interface VoiceInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed: (parsed: ParsedFoodItem) => void;
}

export const VoiceInputModal: React.FC<VoiceInputModalProps> = ({
  isOpen,
  onClose,
  onParsed
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<any>(null);
  const generation = useRef(0);
  const parseAttempt = useRef(0);
  const [preview, setPreview] = useState<{ parsed: ParsedFoodItem; source: string } | null>(null);

  useEffect(() => {
    const ticket = ++generation.current;
    parseAttempt.current++;
    setPreview(null); setIsParsing(false);
    if (!isOpen) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsListening(false);
      setTranscript('');
      setError('');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setError('');
      };

      recognition.onresult = (event: any) => {
        if (ticket !== generation.current) return;
        parseAttempt.current++; setIsParsing(false); setPreview(null);
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setError('Vui lòng cấp quyền Microphone');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (err) {
        console.error(err);
      }
    } else {
      setError('Trình duyệt chưa hỗ trợ Web Speech');
    }

    return () => {
      generation.current++;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setError('');
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleParseAndApply = async () => {
    if (!transcript.trim() || isParsing) return;
    if (preview) { onParsed(preview.parsed); onClose(); return; }
    const ticket = generation.current;
    const attempt = ++parseAttempt.current;
    const token = api.sessionCache.get()?.token;
    setIsParsing(true); setError('');
    try {
      const result = await api.parseVoice(transcript);
      if (ticket !== generation.current || attempt !== parseAttempt.current || token !== api.sessionCache.get()?.token) return;
      setPreview(result);
    } catch (err) {
      if (ticket === generation.current && attempt === parseAttempt.current && token === api.sessionCache.get()?.token) setError(err instanceof Error ? err.message : 'Chưa phân tích được lời nói. Hãy thử lại.');
    } finally {
      if (ticket === generation.current && attempt === parseAttempt.current) setIsParsing(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="voice-modal-title"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      panelClassName="bg-slate-900 text-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-6 text-center border border-white/10"
    >
        <div className="flex justify-between items-center">
          <div id="voice-modal-title" className="flex items-center gap-2 text-fresh-400 font-extrabold text-sm tracking-wide">
            <Sparkles className="w-4 h-4" />
            <span>Thêm bằng giọng nói</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng thêm bằng giọng nói"
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Siri-Style Pulsing Wave Visualizer */}
        <div className="relative flex items-center justify-center py-6">
          {/* Animated Neon Rings */}
          {isListening && (
            <>
              <div className="absolute w-36 h-36 rounded-full bg-gradient-to-tr from-fresh-500/30 to-cyan-500/20 animate-siri-1 pointer-events-none"></div>
              <div className="absolute w-48 h-48 rounded-full bg-gradient-to-tr from-emerald-400/20 to-teal-300/10 animate-siri-2 pointer-events-none"></div>
            </>
          )}

          {/* Central Button */}
          <button
            type="button"
            onClick={handleToggleListening}
            aria-label={isListening ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}
            aria-pressed={isListening}
            className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-95 ${
              isListening
                ? 'bg-gradient-to-tr from-rose-500 to-amber-500 text-white shadow-[0_0_40px_rgba(239,68,68,0.6)]'
                : 'bg-gradient-to-tr from-fresh-500 to-emerald-400 text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.5)]'
            }`}
          >
            {isListening ? <Mic className="w-10 h-10 motion-safe:animate-pulse" /> : <MicOff className="w-10 h-10" />}
          </button>
        </div>

        <div className="text-left space-y-2">
          <label htmlFor="voice-transcript" className="text-sm font-semibold">Lời nói của bạn</label>
          <textarea id="voice-transcript" value={transcript} maxLength={2000} onChange={event => { parseAttempt.current++; setIsParsing(false); setError(''); setTranscript(event.target.value); setPreview(null); }} className="w-full min-h-24 p-3 rounded-xl bg-white/10 border border-white/20 text-sm" placeholder="Nửa ký thịt ba chỉ trong hộp xanh, ngăn đông, dùng trong 7 ngày" />
        </div>
        {preview && <div role="status" className="text-left p-3 rounded-xl bg-white/10 space-y-2 text-sm">
          <p>{preview.source === 'heuristic' ? 'Đã phân tích bằng cách cơ bản, chưa có kết quả từ Gemini.' : 'Đã phân tích bằng Gemini.'} Kiểm tra lại ở phiếu thêm món.</p>
          <p>{preview.parsed.name} — {preview.parsed.quantity || 'Chưa có số lượng'} — {preview.parsed.container_tag || 'Chưa có dấu hiệu nhận biết'} — {preview.parsed.shelf_life_days} ngày</p>
        </div>}

        {error && <p className="text-xs text-rose-400 font-semibold">{error}</p>}

        <button
          type="button"
          onClick={handleParseAndApply}
          disabled={!transcript.trim() || isParsing}
          className="w-full py-3.5 bg-gradient-to-r from-fresh-500 to-emerald-400 hover:from-fresh-400 hover:to-emerald-300 disabled:opacity-30 text-slate-950 font-black rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{isParsing ? 'Đang phân tích...' : preview ? 'Điền vào phiếu thêm' : 'Phân tích lời nói'}</span>
        </button>
    </Dialog>
  );
};
