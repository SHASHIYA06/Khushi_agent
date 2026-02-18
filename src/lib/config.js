'use client';

// Configuration loaded from localStorage with env var fallbacks
export function getConfig() {
  if (typeof window === 'undefined') {
    return {
      GOOGLE_SCRIPT_URL: process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '',
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      GEMINI_API_KEY: '',
      DRIVE_FOLDER_ID: '',
    };
  }

  return {
    GOOGLE_SCRIPT_URL: localStorage.getItem('metro_google_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '',
    SUPABASE_URL: localStorage.getItem('metro_supabase_url') || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: localStorage.getItem('metro_supabase_key') || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    GEMINI_API_KEY: localStorage.getItem('metro_gemini_key') || '',
    DRIVE_FOLDER_ID: localStorage.getItem('metro_drive_folder_id') || '',
  };
}

export function saveConfig(key, value) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
}

export const CONFIG_KEYS = {
  GOOGLE_SCRIPT_URL: 'metro_google_script_url',
  SUPABASE_URL: 'metro_supabase_url',
  SUPABASE_ANON_KEY: 'metro_supabase_key',
  GEMINI_API_KEY: 'metro_gemini_key',
  DRIVE_FOLDER_ID: 'metro_drive_folder_id',
};
