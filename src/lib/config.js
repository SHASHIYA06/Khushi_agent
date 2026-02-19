'use client';

// ============================================================
// Configuration — localStorage with env fallback
// Only 3 keys needed: Google Script URL, Gemini API Key, Drive Folder ID
// ============================================================

const CONFIG_KEYS = {
  GOOGLE_SCRIPT_URL: 'metro_google_script_url',
  GEMINI_API_KEY: 'metro_gemini_api_key',
  DRIVE_FOLDER_ID: 'metro_drive_folder_id',
};

export function getConfig() {
  if (typeof window === 'undefined') {
    return {
      GOOGLE_SCRIPT_URL: process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      DRIVE_FOLDER_ID: process.env.DRIVE_FOLDER_ID || '',
    };
  }

  return {
    GOOGLE_SCRIPT_URL: localStorage.getItem(CONFIG_KEYS.GOOGLE_SCRIPT_URL) || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '',
    GEMINI_API_KEY: localStorage.getItem(CONFIG_KEYS.GEMINI_API_KEY) || '',
    DRIVE_FOLDER_ID: localStorage.getItem(CONFIG_KEYS.DRIVE_FOLDER_ID) || '',
  };
}

export function saveConfig(key, value) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONFIG_KEYS[key], value);
  }
}

export function saveAllConfig(config) {
  Object.keys(config).forEach(key => {
    if (CONFIG_KEYS[key]) {
      saveConfig(key, config[key]);
    }
  });
}

export function getMissingConfig() {
  const config = getConfig();
  const missing = [];
  if (!config.GOOGLE_SCRIPT_URL) missing.push('Google Script URL');
  if (!config.GEMINI_API_KEY) missing.push('Gemini API Key');
  if (!config.DRIVE_FOLDER_ID) missing.push('Drive Folder ID');
  return missing;
}
