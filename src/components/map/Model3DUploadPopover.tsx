'use client';

import { useState, useRef, useCallback } from 'react';
import type { Model3DAsset, Model3DFormat } from '@/lib/types';

const ACCEPTED_FORMATS: Record<string, Model3DFormat> = {
  '.ply': 'ply',
  '.obj': 'obj',
  '.splat': 'splat',
  '.ksplat': 'splat',
};

interface Props {
  onUpload: (asset: Model3DAsset) => void;
  onCancel: () => void;
  defaultLabel?: string;
}

export function Model3DUploadPopover({ onUpload, onCancel, defaultLabel }: Props) {
  const [label, setLabel] = useState(defaultLabel ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const getFormat = (filename: string): Model3DFormat | null => {
    const ext = '.' + filename.split('.').pop()?.toLowerCase();
    return ACCEPTED_FORMATS[ext] ?? null;
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fmt = getFormat(f.name);
    if (!fmt) {
      setError('Unsupported format. Use .ply, .obj, or .splat files.');
      return;
    }
    setFile(f);
    setError('');
    if (!label) setLabel(f.name.replace(/\.[^.]+$/, ''));
  }, [label]);

  const handleUpload = async () => {
    if (!file) return;
    const fmt = getFormat(file.name);
    if (!fmt) return;

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('files', file);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      const uploadedPath = data.files?.[0]?.path;
      if (!uploadedPath) throw new Error('No file path returned');

      const renderMode = fmt === 'splat' ? 'splat' : 'mesh';

      const asset: Model3DAsset = {
        url: uploadedPath,
        format: fmt,
        label: label.trim() || file.name.replace(/\.[^.]+$/, ''),
        renderMode,
      };

      onUpload(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-600 rounded-xl p-4 shadow-xl w-72 space-y-3" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🧊</span>
        <h3 className="text-sm font-semibold text-slate-200">Upload 3D Model</h3>
      </div>

      {/* Label input */}
      <div>
        <label className="text-[10px] text-slate-400 mb-1 block">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Building A Scan"
          className="w-full bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* File picker */}
      <div>
        <label className="text-[10px] text-slate-400 mb-1 block">3D File</label>
        <input
          ref={inputRef}
          type="file"
          accept=".ply,.obj,.splat,.ksplat"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          className={`w-full py-2 rounded-lg border border-dashed text-xs transition-all ${
            file
              ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
              : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
          }`}
        >
          {file ? (
            <span className="flex items-center justify-center gap-1.5">
              <span>✓</span> {file.name} <span className="text-slate-500">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
            </span>
          ) : (
            'Choose .ply, .obj, or .splat file'
          )}
        </button>
      </div>

      {/* Format info */}
      {file && (
        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {getFormat(file.name)?.toUpperCase()}
          </span>
          <span>→ {getFormat(file.name) === 'splat' ? 'Gaussian splat' : 'Mesh'} rendering</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all ${
            file && !uploading
              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-900'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
              Uploading...
            </span>
          ) : (
            'Upload & Place'
          )}
        </button>
      </div>
    </div>
  );
}
