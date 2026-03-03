'use client';

import { useCallback, useState } from 'react';

interface UploadedImage {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  file: File;
}

interface Props {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onComplete: (images: UploadedImage[]) => void;
}

export function Step1Upload({ projectName, onProjectNameChange, onComplete }: Props) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    const valid = Array.from(files).filter(f => validTypes.includes(f.type));

    if (valid.length === 0) {
      setError('Please upload PNG, JPG, WebP, or GIF images.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // Upload to server
      const formData = new FormData();
      valid.forEach(f => formData.append('files', f));

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const uploaded = await res.json() as { name: string; path: string; size: number }[];

      // Get image dimensions
      const newImages: UploadedImage[] = await Promise.all(
        valid.map(async (file, idx) => {
          const url = uploaded[idx]?.path || URL.createObjectURL(file);
          const dims = await getImageDimensions(file);
          return {
            id: `img_${Date.now()}_${idx}`,
            name: file.name,
            url,
            width: dims.width,
            height: dims.height,
            file,
          };
        })
      );

      setImages(prev => [...prev, ...newImages]);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  }, [processFiles]);

  const removeImage = (id: string) => setImages(prev => prev.filter(i => i.id !== id));

  const canContinue = images.length >= 1 && projectName.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Project name */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Project Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={projectName}
          onChange={e => onProjectNameChange(e.target.value)}
          placeholder="e.g. North Campus Buildings, Factory Floor Plan..."
          className="w-full bg-slate-800/60 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 placeholder-slate-500 transition-all"
        />
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
          dragOver
            ? 'border-amber-400 bg-amber-500/5'
            : 'border-slate-700 hover:border-slate-500 bg-slate-900/40'
        }`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400">Uploading images...</p>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-slate-200 mb-1">Drop floor plan images here</p>
            <p className="text-sm text-slate-500 mb-4">PNG, JPG, WebP or GIF — all your maps at once</p>
            <button
              type="button"
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg transition-colors text-sm"
            >
              Browse Files
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Uploaded Images ({images.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map(img => (
              <div key={img.id} className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-slate-500 transition-all">
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-xs text-white truncate">{img.name}</p>
                    <p className="text-xs text-slate-400">{img.width}×{img.height}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                  className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Add more button */}
            <button
              onClick={() => document.getElementById('file-input')?.click()}
              className="aspect-video bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-700 hover:border-slate-500 flex flex-col items-center justify-center gap-1 transition-all group"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-slate-500 group-hover:text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-xs text-slate-500 group-hover:text-slate-400">Add more</span>
            </button>
          </div>
        </div>
      )}

      {/* Tip */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-400 shrink-0 mt-0.5">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <div className="text-sm text-slate-400">
          <p className="text-amber-400 font-medium mb-1">Upload all your maps at once</p>
          <p>Include your campus overview map and all building/room floor plans. You&apos;ll assign which is the master map and connect them in the next step.</p>
        </div>
      </div>

      {/* Continue button */}
      <div className="flex justify-end">
        <button
          onClick={() => canContinue && onComplete(images)}
          disabled={!canContinue}
          className={`px-8 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            canContinue
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          Continue to Place Pins
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 800, height: 600 });
    };
    img.src = url;
  });
}
