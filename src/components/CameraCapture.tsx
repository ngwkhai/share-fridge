import React, { useRef } from 'react';
import { Camera, X } from 'lucide-react';

interface CameraCaptureProps {
  photoUrl: string | null;
  onPhotoCaptured: (url: string | null) => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ photoUrl, onPhotoCaptured }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side image compression via Canvas (< 100KB)
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const scale = MAX_WIDTH / img.width;
        canvas.width = scale < 1 ? MAX_WIDTH : img.width;
        canvas.height = scale < 1 ? img.height * scale : img.height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Compress to JPEG quality 0.65
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.65);
          onPhotoCaptured(compressedDataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
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

      {photoUrl ? (
        <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
          <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onPhotoCaptured(null)}
            className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center text-xs"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 border border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <Camera className="w-4 h-4 text-fresh-600" />
          <span>Chụp ảnh hộp/túi đồ</span>
        </button>
      )}
    </div>
  );
};
