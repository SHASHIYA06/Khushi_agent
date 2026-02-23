'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import useStore from '@/store/useStore';
import { getConfig, saveAllConfig } from '@/lib/config';
import {
    HiOutlineCog, HiOutlineKey, HiOutlineCloud,
    HiOutlineCheck, HiOutlineExclamation, HiOutlineDatabase,
    HiOutlineLightningBolt, HiOutlineRefresh, HiOutlineInformationCircle,
    HiOutlineSearchCircle
} from 'react-icons/hi';
import { testConnectivity, initDatabase, listAvailableModels } from '@/lib/api';

const configFields = [
    {
        key: 'GOOGLE_SCRIPT_URL',
        label: 'Google Apps Script URL',
        placeholder: 'https://script.google.com/macros/s/.../exec',
        description: 'Deploy your Apps Script as a Web App → Copy the URL. Must end with /exec',
        icon: HiOutlineCloud,
        type: 'url',
    },
    {
        key: 'GEMINI_API_KEY',
        label: 'Gemini API Key',
        placeholder: 'AIza...',
        description: 'Get from Google AI Studio → API Keys. Used for text extraction & RAG',
        icon: HiOutlineKey,
        type: 'password',
    },
    {
        key: 'DRIVE_FOLDER_ID',
        label: 'Google Drive Folder ID',
        placeholder: '1Ab2Cd3Ef...',
        description: 'Create a folder in Drive → copy the ID from the URL. Same one used in Code.gs',
        icon: HiOutlineCloud,
        type: 'text',
    },
];

export default function SettingsPage() {
    const { addNotification } = useStore();
    const [values, setValues] = useState({});
    const [testing, setTesting] = useState(false);
    const [initializing, setInitializing] = useState(false);
    const [healthStatus, setHealthStatus] = useState(null);
    const [dbInfo, setDbInfo] = useState(null);

    useEffect(() => {
        const config = getConfig();
        setValues(config);
    }, []);

    function handleSaveAll() {
        saveAllConfig(values);
        addNotification('All settings saved! ✓', 'success');
    }

    const [availableModels, setAvailableModels] = useState(null);

    async function runDiagnostics() {
        handleSaveAll();
        setTesting(true);
        setHealthStatus(null);
        setAvailableModels(null);
        try {
            const res = await testConnectivity();
            setHealthStatus({ ok: true, diagnostics: res.diagnostics });
            addNotification('Diagnostics complete!', 'success');
        } catch (e) {
            setHealthStatus({ ok: false, error: e.message });
            addNotification('Diagnostics failed: ' + e.message, 'error');
        }
        setTesting(false);
    }

    async function handleViewModels() {
        setTesting(true);
        try {
            const res = await listAvailableModels();
            setAvailableModels(res.models);
            addNotification('Model list retrieved!', 'success');
        } catch (e) {
            addNotification('Could not list models: ' + e.message, 'error');
        }
        setTesting(false);
    }

    async function handleInitDB() {
        handleSaveAll();  // Save first
        setInitializing(true);
        try {
            const res = await initDatabase();
            setDbInfo(res);
            addNotification('Database initialized! Google Sheet created. ✓', 'success');
        } catch (e) {
            addNotification('Init failed: ' + e.message, 'error');
        }
        setInitializing(false);
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
                            Configure your backend — only 3 settings needed!
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={runDiagnostics} className="btn-secondary" disabled={testing}>
                            <HiOutlineRefresh size={16} className={testing ? 'animate-spin' : ''} />
                            {testing ? 'Probing...' : 'Run Diagnostics'}
                        </button>
                        <button onClick={handleSaveAll} className="btn-primary">
                            <HiOutlineCheck size={16} /> Save All
                        </button>
                    </div>
                </div>

                {/* Connection Status */}
                {healthStatus && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-6 mb-6 max-w-3xl"
                    >
                        <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            <HiOutlineInformationCircle style={{ color: 'var(--accent-blue)' }} /> Connectivity Diagnostics
                        </h3>

                        {healthStatus.ok ? (
                            <div className="space-y-4">
                                {Object.entries(healthStatus.diagnostics).map(([key, info]) => (
                                    <div key={key} className="flex items-start justify-between border-b border-white/5 pb-2">
                                        <div>
                                            <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>{key}</p>
                                            <p className="text-sm" style={{ color: info.status.includes('✅') ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                                {info.status}
                                            </p>
                                            {info.error && <p className="text-[10px] mt-1 opacity-50 text-rose-400">{info.error}</p>}
                                        </div>
                                    </div>
                                ))}

                                <div className="mt-4 flex gap-2">
                                    <button
                                        onClick={handleViewModels}
                                        className="btn-secondary text-xs py-1"
                                        disabled={testing}
                                    >
                                        <HiOutlineSearchCircle className="mr-1" /> View Available Models
                                    </button>
                                </div>

                                {availableModels && (
                                    <div className="mt-4 p-3 rounded-lg bg-black/40 text-[10px] overflow-auto max-h-[200px] font-mono border border-white/5">
                                        <p className="mb-2 text-blue-400 font-bold">Authorized Models for your Key:</p>
                                        <pre>{JSON.stringify(availableModels, null, 2)}</pre>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <HiOutlineExclamation size={20} style={{ color: 'var(--accent-rose)' }} />
                                <div>
                                    <p className="font-semibold text-sm" style={{ color: 'var(--accent-rose)' }}>Communication Interface Offline</p>
                                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{healthStatus.error}</p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

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
                                        <input
                                            type={field.type === 'password' ? 'password' : 'text'}
                                            className="input-field w-full"
                                            placeholder={field.placeholder}
                                            value={values[field.key] || ''}
                                            onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Initialize Database */}
                <div className="glass-card p-6 mt-6 max-w-3xl" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <HiOutlineDatabase size={20} style={{ color: 'var(--accent-purple)' }} />
                                Initialize Database
                            </h3>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                                Auto-creates a Google Sheet with Documents, Chunks, Folders, and QueryLogs tabs.
                                Click this once after setting your Apps Script URL.
                            </p>
                            {dbInfo && dbInfo.spreadsheetUrl && (
                                <a
                                    href={dbInfo.spreadsheetUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs mt-2 inline-block underline"
                                    style={{ color: 'var(--accent-blue)' }}
                                >
                                    📊 Open Database Spreadsheet →
                                </a>
                            )}
                        </div>
                        <button
                            onClick={handleInitDB}
                            className="btn-primary"
                            disabled={initializing}
                        >
                            <HiOutlineLightningBolt size={16} />
                            {initializing ? 'Creating...' : 'Initialize DB'}
                        </button>
                    </div>
                </div>

                {/* Setup Guide */}
                <div className="glass-card p-6 mt-6 max-w-3xl">
                    <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>📋 Quick Setup Guide</h3>
                    <div className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <div className="flex gap-3 items-start">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'var(--accent-blue)', color: 'white' }}>1</span>
                            <p><strong>Google Drive:</strong> Create a folder for your documents → Copy the folder ID from the URL bar.</p>
                        </div>
                        <div className="flex gap-3 items-start">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'var(--accent-blue)', color: 'white' }}>2</span>
                            <p><strong>Gemini API:</strong> Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="underline">Google AI Studio</a> → Create API key.</p>
                        </div>
                        <div className="flex gap-3 items-start">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'var(--accent-blue)', color: 'white' }}>3</span>
                            <p><strong>Apps Script:</strong> Go to <a href="https://script.google.com" target="_blank" rel="noopener" className="underline">script.google.com</a> → New Project → Paste <code>Code.gs</code> → Set your GEMINI_API_KEY and DRIVE_FOLDER_ID in the code → Enable &quot;Drive API&quot; in Services → Deploy as Web App (Execute as: Me, Access: Anyone).</p>
                        </div>
                        <div className="flex gap-3 items-start">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'var(--accent-purple)', color: 'white' }}>4</span>
                            <p><strong>Initialize:</strong> Paste all 3 values above → Click &quot;Save All&quot; → Click &quot;Initialize DB&quot; → Done! 🎉</p>
                        </div>
                    </div>
                </div>

                {/* Architecture Info */}
                <div className="glass-card p-6 mt-6 max-w-3xl" style={{ background: 'rgba(59, 130, 246, 0.03)' }}>
                    <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>🏗️ Architecture (No External DB)</h3>
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <p className="mb-2">This app uses <strong>Google Sheets as its database</strong> — no Supabase, no Firebase, no external accounts needed.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <div className="rounded-xl p-3" style={{ background: 'rgba(59, 130, 246, 0.08)' }}>
                                <p className="font-semibold text-xs mb-1" style={{ color: 'var(--accent-blue)' }}>📁 File Storage</p>
                                <p className="text-xs">Google Drive</p>
                            </div>
                            <div className="rounded-xl p-3" style={{ background: 'rgba(168, 85, 247, 0.08)' }}>
                                <p className="font-semibold text-xs mb-1" style={{ color: 'var(--accent-purple)' }}>📊 Database</p>
                                <p className="text-xs">Google Sheets (auto-created)</p>
                            </div>
                            <div className="rounded-xl p-3" style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
                                <p className="font-semibold text-xs mb-1" style={{ color: 'var(--accent-emerald)' }}>🤖 AI Engine</p>
                                <p className="text-xs">Gemini 1.5 Flash</p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AppShell>
    );
}
