'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'safemap_openai_key';

/** Read the persisted OpenAI key (safe to call anywhere) */
export function getOpenAIKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

/** Persist the key to localStorage */
export function setOpenAIKey(key: string) {
  if (typeof window === 'undefined') return;
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Gear-button + modal for entering the OpenAI API key once.
 * Renders inline — place it in any header/toolbar.
 */
export function ApiKeySettingsButton() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKey(getOpenAIKey());
  }, [open]);

  const handleSave = useCallback(() => {
    setOpenAIKey(key);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setOpen(false);
    }, 800);
  }, [key]);

  const hasKey = typeof window !== 'undefined' && !!getOpenAIKey();

  return (
    <>
      {/* Gear button */}
      <button
        onClick={() => setOpen(true)}
        title="API Key Settings"
        className="relative px-3 py-2 text-sm text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-xl transition-all flex items-center gap-1.5"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
        Settings
        {hasKey && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0a0d14]" />
        )}
      </button>

      {/* Modal backdrop */}
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* OpenAI Key */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">OpenAI API Key</label>
              <p className="text-xs text-slate-500">
                Required for AI element detection (walls, doors, windows). Stored locally in your browser — never sent to our servers.
              </p>
              <input
                type="password"
                value={key}
                onChange={e => { setKey(e.target.value); setSaved(false); }}
                placeholder="sk-..."
                className="w-full bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition-colors"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg text-sm transition-all"
                >
                  {saved ? '✓ Saved' : 'Save Key'}
                </button>
                {key.trim() && (
                  <button
                    onClick={() => { setKey(''); setOpenAIKey(''); }}
                    className="px-3 py-2 text-red-400 hover:text-red-300 text-sm transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              {getOpenAIKey() && !saved && (
                <p className="text-[10px] text-emerald-400/70">Key is saved and will be used for AI detection</p>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-600">
              Settings are stored in your browser&apos;s local storage and persist across sessions.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
