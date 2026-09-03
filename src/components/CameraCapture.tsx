import React, { useRef, useState } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface CameraCaptureProps {
  roomCode: string;
  photoUrl: string | null;
  storagePath: string | null;
  onPhotoUploaded: (result: { photo_url: string; storage_path: string } | null) => void;
}

const MAX_BYTES = 100 * 1024;
const MAX_DIMENSION = 1024;

async function readAsImage(file: File): Promise<HTMLImageElement> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('DECODE_FAILED'));
    img.src = dataUrl;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

// Scales to fit MAX_DIMENSION, then repeatedly re-encodes at a lower JPEG quality (and, if
// quality alone cannot reach the target, further shrinks dimensions) until the measured Blob
// fits the server's 100KB bound.
async function compress(img: HTMLImageElement): Promise<Blob> {
  let width = img.width, height = img.height;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    ctx.drawImage(img, 0, 0, width, height);
    for (const quality of [0.8, 0.6, 0.45, 0.3]) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    width = Math.max(1, Math.round(width * 0.75));
    height = Math.max(1, Math.round(height * 0.75));
  }
  throw new Error('TOO_LARGE');
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ roomCode, photoUrl, storagePath, onPhotoUploaded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const img = await readAsImage(file);
      const blob = await compress(img);
      const base64 = await blobToBase64(blob);
      const result = await api.uploadPhoto(base64, 'image/jpeg', crypto.randomUUID());
      onPhotoUploaded(result);
    } catch {
      setError('Không thể xử lý ảnh. Vui lòng thử ảnh khác.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = () => {
    const releasing = storagePath;
    onPhotoUploaded(null);
    if (releasing) void api.removePhoto(releasing).catch(() => {});
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {error && <p className="text-xs text-red-600 mb-1.5">{error}</p>}

      {photoUrl ? (
        <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
          <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center text-xs"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || !roomCode}
          className="px-3 py-2 border border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 text-fresh-600 animate-spin" /> : <Camera className="w-4 h-4 text-fresh-600" />}
          <span>{busy ? 'Đang tải ảnh...' : 'Chụp ảnh hộp/túi đồ'}</span>
        </button>
      )}
    </div>
  );
};
