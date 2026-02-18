'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import useStore from '@/store/useStore';
import { getConfig, saveConfig, CONFIG_KEYS } from '@/lib/config';
import { HiOutlineCog, HiOutlineKey, HiOutlineCloud, HiOutlineDatabase, HiOutlineCheck, HiOutlineExclamation } from 'react-icons/hi';

const configFields = [
    {
        key: CONFIG_KEYS.GOOGLE_SCRIPT_URL,
        label: 'Google Apps Script URL',
        placeholder: 'https://script.google.com/macros/s/.../exec',
        description: 'Deploy your Apps Script as a web app and paste the URL here',
        icon: HiOutlineCloud,
        type: 'url',
    },
    {
        key: CONFIG_KEYS.SUPABASE_URL,
        label: 'Supabase Project URL',
        placeholder: 'https://your-project.supabase.co',
        description: 'Find this in Supabase Dashboard → Settings → API',
        icon: HiOutlineDatabase,
        type: 'url',
    },
    {
        key: CONFIG_KEYS.SUPABASE_ANON_KEY,
        label: 'Supabase Anon/Service Key',
        placeholder: 'eyJ...',
        description: 'Supabase Dashboard → Settings → API → Service Role Key',
        icon: HiOutlineKey,
        type: 'password',
    },
    {
        key: CONFIG_KEYS.GEMINI_API_KEY,
        label: 'Gemini API Key',
        placeholder: 'AIza...',
        description: 'Get from Google AI Studio → API Keys',
        icon: HiOutlineKey,
        type: 'password',
    },
    {
        key: CONFIG_KEYS.DRIVE_FOLDER_ID,
        label: 'Google Drive Folder ID',
        placeholder: '1Ab2Cd3Ef...',
        description: 'The folder ID from your Google Drive URL for document storage',
        icon: HiOutlineCloud,
        type: 'text',
    },
];

export default function SettingsPage() {
    const { addNotification } = useStore();
    const [values, setValues] = useState({});
    const [saved, setSaved] = useState({});

    useEffect(() => {
        const config = getConfig();
        const initial = {};
        configFields.forEach(f => {
            initial[f.key] = localStorage.getItem(f.key) || '';
        });
        setValues(initial);
    }, []);

    function handleSave(key) {
        saveConfig(key, values[key]);
        setSaved(prev => ({ ...prev, [key]: true }));
        addNotification('Setting saved', 'success');
        setTimeout(() => setSaved(prev => ({ ...prev, [key]: false })), 2000);
    }

    function handleSaveAll() {
        Object.entries(values).forEach(([key, value]) => {
            saveConfig(key, value);
        });
        addNotification('All settings saved!', 'success');
    }

    function checkConfig() {
        const missing = configFields.filter(f => !values[f.key]);
        if (missing.length === 0) {
            addNotification('All configurations are set! ✓', 'success');
        } else {
            addNotification(`Missing: ${missing.map(f => f.label).join(', ')}`, 'error');
        }
    }

    return (
        <AppShell>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                            <HiOutlineCog className="inline mr-2 mb-1" />Settings
                        </h1>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Configure your API keys and backend URLs
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={checkConfig} className="btn-secondary">
                            <HiOutlineExclamation size={16} /> Check Config
                        </button>
                        <button onClick={handleSaveAll} className="btn-primary">
                            <HiOutlineCheck size={16} /> Save All
                        </button>
                    </div>
                </div>

                {/* Config fields */}
                <div className="space-y-4 max-w-3xl">
                    {configFields.map((field) => {
                        const Icon = field.icon;
                        return (
                            <motion.div
                                key={field.key}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-card p-5"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                                        <Icon size={20} style={{ color: 'var(--accent-blue)' }} />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-sm font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
                                            {field.label}
                                        </label>
                                        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                                            {field.description}
                                        </p>
                                        <div className="flex gap-2">
                                            <input
                                                type={field.type === 'password' ? 'password' : 'text'}
                                                className="input-field flex-1"
                                                placeholder={field.placeholder}
                                                value={values[field.key] || ''}
                                                onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                            />
                                            <button
                                                onClick={() => handleSave(field.key)}
                                                className={saved[field.key] ? 'btn-primary' : 'btn-secondary'}
                                                style={{ minWidth: '80px' }}
                                            >
                                                {saved[field.key] ? (
                                                    <><HiOutlineCheck size={14} /> Saved</>
                                                ) : (
                                                    'Save'
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Setup Guide */}
                <div className="glass-card p-6 mt-8 max-w-3xl">
                    <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>📋 Setup Guide</h3>
                    <div className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <div className="flex gap-3">
                            <span className="font-bold" style={{ color: 'var(--accent-blue)' }}>1.</span>
                            <p><strong>Supabase:</strong> Create a free project at supabase.com → Run the schema SQL in SQL Editor → Copy URL and Service Role Key.</p>
                        </div>
                        <div className="flex gap-3">
                            <span className="font-bold" style={{ color: 'var(--accent-blue)' }}>2.</span>
                            <p><strong>Gemini API:</strong> Go to Google AI Studio → Create API key → Paste above.</p>
                        </div>
                        <div className="flex gap-3">
                            <span className="font-bold" style={{ color: 'var(--accent-blue)' }}>3.</span>
                            <p><strong>Google Apps Script:</strong> Create new project at script.google.com → Paste Code.gs → Deploy as Web App (Execute as Me, Access: Anyone) → Copy the URL.</p>
                        </div>
                        <div className="flex gap-3">
                            <span className="font-bold" style={{ color: 'var(--accent-blue)' }}>4.</span>
                            <p><strong>Drive Folder:</strong> Create a folder in Google Drive → Copy the folder ID from URL → Also update DRIVE_FOLDER_ID in your Apps Script.</p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AppShell>
    );
}
