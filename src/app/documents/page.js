'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import AppShell from '@/components/layout/AppShell';
import useStore from '@/store/useStore';
import { listFolders, createFolder, deleteFolder, listDocuments, uploadDocument, deleteDocument, processDocumentBatch, syncDrive } from '@/lib/api';
import {
    HiOutlineFolder, HiOutlineFolderAdd, HiOutlineDocumentText,
    HiOutlineTrash, HiOutlineUpload, HiOutlineX, HiOutlineEye,
    HiOutlineRefresh, HiOutlineDocumentAdd, HiOutlineExclamationCircle,
    HiOutlineLightningBolt, HiOutlineSearchCircle
} from 'react-icons/hi';
import { openDrivePicker } from '@/lib/googleDrive';

export default function DocumentsPage() {
    const { folders, setFolders, documents, setDocuments, addNotification, selectedFolder, setSelectedFolder } = useStore();
    const [newFolderName, setNewFolderName] = useState('');
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [previewDoc, setPreviewDoc] = useState(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const [processProgress, setProcessProgress] = useState(null); // { pagesProcessed, totalPages, totalChunks, message }

    useEffect(() => {
        loadData();
    }, []);

    // Also reload when folder selection changes
    useEffect(() => {
        if (selectedFolder !== undefined) {
            loadData();
        }
    }, [selectedFolder?.id]);

    async function loadData() {
        setLoading(true);
        setError('');

        try {
            // Fetch folders
            let fetchedFolders = [];
            try {
                const fRes = await listFolders();
                console.log('[MetroCircuit] Folders response:', fRes);
                fetchedFolders = fRes.folders || fRes || [];
                if (!Array.isArray(fetchedFolders)) fetchedFolders = [];
            } catch (fErr) {
                console.error('[MetroCircuit] Failed to load folders:', fErr);
            }

            // Fetch documents
            let fetchedDocs = [];
            try {
                const dRes = await listDocuments(selectedFolder?.id || null);
                console.log('[MetroCircuit] Documents response:', dRes);
                fetchedDocs = dRes.documents || dRes || [];
                if (!Array.isArray(fetchedDocs)) fetchedDocs = [];
            } catch (dErr) {
                console.error('[MetroCircuit] Failed to load documents:', dErr);
            }

            console.log('[MetroCircuit] Setting folders:', fetchedFolders.length, 'docs:', fetchedDocs.length);
            setFolders(fetchedFolders);
            setDocuments(fetchedDocs);

        } catch (e) {
            console.error('[MetroCircuit] loadData error:', e);
            setError('Failed to load data: ' + e.message);
        }
        setLoading(false);
    }

    async function handleCreateFolder() {
        if (!newFolderName.trim()) return;
        try {
            await createFolder(newFolderName.trim());
            setNewFolderName('');
            setShowNewFolder(false);
            addNotification('Folder created: ' + newFolderName, 'success');
            await loadData();
        } catch (e) {
            addNotification('Failed: ' + e.message, 'error');
        }
    }

    async function handleDeleteFolder(id) {
        if (!confirm('Delete this folder and all its documents?')) return;
        try {
            await deleteFolder(id);
            if (selectedFolder?.id === id) setSelectedFolder(null);
            addNotification('Folder deleted', 'success');
            await loadData();
        } catch (e) {
            addNotification('Failed: ' + e.message, 'error');
        }
    }

    async function handleAddFromDrive() {
        try {
            await openDrivePicker(async (items) => {
                console.log('[MetroCircuit] Drive Picker items:', items);
                addNotification(`Selected ${items.length} items. Syncing...`, 'info');
                setSyncing(true);
                await syncDrive();
                await loadData();
                setSyncing(false);
                addNotification('Drive sync complete!', 'success');
            });
        } catch (e) {
            addNotification('Picker error: ' + e.message, 'error');
        }
    }

    async function handleDeleteDoc(doc) {
        if (!confirm('Delete this document?')) return;
        try {
            await deleteDocument(doc.id, doc.drive_file_id);
            addNotification('Document deleted', 'success');
            await loadData();
        } catch (e) {
            addNotification('Failed: ' + e.message, 'error');
        }
    }

    const onDrop = useCallback(async (acceptedFiles) => {
        if (acceptedFiles.length === 0) return;
        setUploading(true);

        for (const file of acceptedFiles) {
            try {
                setUploadProgress(`Processing: ${file.name}...`);
                await uploadDocument(file, selectedFolder?.id);
                addNotification(`Uploaded: ${file.name}`, 'success');
            } catch (e) {
                addNotification(`Failed: ${file.name} - ${e.message}`, 'error');
            }
        }

        setUploading(false);
        setUploadProgress('');
        await loadData();
    }, [selectedFolder]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'text/plain': ['.txt'],
            'text/csv': ['.csv'],
            'image/png': ['.png'],
            'image/jpeg': ['.jpg', '.jpeg'],
        },
        maxSize: 50 * 1024 * 1024,
    });

    const filteredDocs = selectedFolder
        ? documents.filter(d => d.folder_id === selectedFolder.id)
        : documents;

    return (
        <AppShell>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Documents</h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Manage folders and upload electrical drawings
                            {documents.length > 0 && <span className="ml-2" style={{ color: 'var(--accent-blue)' }}>({documents.length} total)</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleAddFromDrive}
                            className="btn-primary"
                        >
                            <HiOutlineSearchCircle size={16} />
                            Add from Drive
                        </button>
                        <button
                            onClick={async () => {
                                setSyncing(true);
                                try {
                                    const res = await syncDrive();
                                    console.log('[MetroCircuit] Sync result:', res);
                                    addNotification(`Drive synced: ${res.newFiles || 0} new files found`, 'success');
                                    await loadData();
                                } catch (e) {
                                    addNotification('Sync failed: ' + e.message, 'error');
                                }
                                setSyncing(false);
                            }}
                            className="btn-secondary"
                            disabled={syncing}
                        >
                            <HiOutlineRefresh size={16} className={syncing ? 'animate-spin' : ''} />
                            {syncing ? 'Syncing...' : 'Sync Drive'}
                        </button>
                        <button onClick={loadData} className="btn-secondary" disabled={loading}>
                            <HiOutlineRefresh size={16} className={loading ? 'animate-spin' : ''} />
                            {loading ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="glass-card p-4 mb-4 flex items-center gap-3" style={{ borderLeft: '3px solid var(--accent-rose)' }}>
                        <HiOutlineExclamationCircle size={20} style={{ color: 'var(--accent-rose)' }} />
                        <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--accent-rose)' }}>Error loading data</p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                        </div>
                    </div>
                )}

                {/* Folders Section */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Folders</h2>
                        <button onClick={() => setShowNewFolder(!showNewFolder)} className="btn-secondary text-sm">
                            <HiOutlineFolderAdd size={16} /> New Folder
                        </button>
                    </div>

                    {/* New folder input */}
                    <AnimatePresence>
                        {showNewFolder && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mb-4 overflow-hidden"
                            >
                                <div className="flex gap-2">
                                    <input
                                        className="input-field flex-1"
                                        placeholder="Folder name..."
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                                    />
                                    <button onClick={handleCreateFolder} className="btn-primary">Create</button>
                                    <button onClick={() => setShowNewFolder(false)} className="btn-secondary"><HiOutlineX size={16} /></button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Folder grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {/* All documents */}
                        <motion.div
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setSelectedFolder(null)}
                            className={`glass-card p-4 cursor-pointer text-center ${!selectedFolder ? 'ring-2 ring-blue-500' : ''}`}
                        >
                            <HiOutlineDocumentText size={28} className="mx-auto mb-2" style={{ color: 'var(--accent-blue)' }} />
                            <p className="text-sm font-medium">All Documents</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{documents.length} files</p>
                        </motion.div>

                        {folders.map((f) => (
                            <motion.div
                                key={f.id}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setSelectedFolder(f)}
                                className={`glass-card p-4 cursor-pointer text-center relative group ${selectedFolder?.id === f.id ? 'ring-2 ring-purple-500' : ''}`}
                            >
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }}
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/20"
                                    style={{ color: 'var(--accent-rose)' }}
                                >
                                    <HiOutlineTrash size={14} />
                                </button>
                                <HiOutlineFolder size={28} className="mx-auto mb-2" style={{ color: 'var(--accent-purple)' }} />
                                <p className="text-sm font-medium truncate">{f.name}</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                    {documents.filter(d => d.folder_id === f.id).length} files
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Upload Zone */}
                <div className="mb-6">
                    <div
                        {...getRootProps()}
                        className={`dropzone ${isDragActive ? 'active' : ''}`}
                    >
                        <input {...getInputProps()} />
                        {uploading ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="spinner" />
                                <p className="font-medium" style={{ color: 'var(--accent-blue)' }}>{uploadProgress}</p>
                            </div>
                        ) : (
                            <div>
                                <HiOutlineDocumentAdd size={48} className="mx-auto mb-3" style={{ color: 'var(--accent-blue)', opacity: 0.5 }} />
                                <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                    {isDragActive ? 'Drop files here...' : 'Drag & drop documents here'}
                                </p>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    or click to browse • PDF, TXT, CSV, Images • Max 50MB
                                </p>
                                {selectedFolder && (
                                    <p className="text-xs mt-2" style={{ color: 'var(--accent-purple)' }}>
                                        Uploading to: {selectedFolder.name}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Document List */}
                <div>
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                        {selectedFolder ? `${selectedFolder.name} — Documents` : 'All Documents'}
                        <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-secondary)' }}>
                            ({filteredDocs.length} {filteredDocs.length === 1 ? 'file' : 'files'})
                        </span>
                    </h2>
                    <div className="glass-card overflow-hidden">
                        {loading ? (
                            <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                                <div className="spinner mx-auto mb-3" />
                                <p>Loading documents...</p>
                            </div>
                        ) : filteredDocs.length === 0 ? (
                            <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                                <HiOutlineDocumentText size={40} className="mx-auto mb-3 opacity-30" />
                                <p>No documents found</p>
                                <p className="text-sm mt-1">Upload a document or click "Sync Drive" to import from Google Drive</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                            <th className="text-left p-4 text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Name</th>
                                            <th className="text-left p-4 text-xs font-semibold uppercase hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Status</th>
                                            <th className="text-left p-4 text-xs font-semibold uppercase hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>Chunks</th>
                                            <th className="text-left p-4 text-xs font-semibold uppercase hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>Date</th>
                                            <th className="text-right p-4 text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDocs.map((doc) => (
                                            <motion.tr
                                                key={doc.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                style={{ borderBottom: '1px solid var(--border-glass)' }}
                                                className="hover:bg-white/[0.02] transition-colors"
                                            >
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <HiOutlineDocumentText size={18} style={{ color: 'var(--accent-blue)' }} />
                                                        <span className="font-medium text-sm truncate max-w-[200px]">{doc.name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 hidden sm:table-cell">
                                                    <span className={`status-badge ${doc.status || 'uploaded'}`}>
                                                        {doc.status || 'uploaded'}
                                                    </span>
                                                    {processingId === doc.id && processProgress && (
                                                        <div className="mt-2 text-xs" style={{ color: 'var(--accent-emerald)' }}>
                                                            <div className="mb-1">
                                                                {processProgress.message || (
                                                                    processProgress.totalPages
                                                                        ? `Page ${processProgress.pagesProcessed || 0}/${processProgress.totalPages} (${processProgress.totalChunks || 0} chunks)`
                                                                        : 'Starting...'
                                                                )}
                                                            </div>
                                                            {processProgress.totalPages > 0 && (
                                                                <div style={{ width: '100px', height: '4px', borderRadius: '2px', background: 'var(--bg-tertiary)' }}>
                                                                    <div style={{
                                                                        width: `${Math.round((processProgress.pagesProcessed || 0) / processProgress.totalPages * 100)}%`,
                                                                        height: '4px',
                                                                        borderRadius: '2px',
                                                                        background: 'var(--accent-emerald)',
                                                                        transition: 'width 0.5s ease'
                                                                    }} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-4 text-sm hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>
                                                    {doc.page_count || 0}
                                                </td>
                                                <td className="p-4 text-sm hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>
                                                    {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {(doc.status === 'uploaded' || doc.status === 'error' || doc.status === 'extracting' || doc.status === 'processing') && (
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    setProcessingId(doc.id);
                                                                    setProcessProgress({ message: 'Extracting text...' });
                                                                    try {
                                                                        const res = await processDocumentBatch(doc.id, (progress) => {
                                                                            setProcessProgress(progress);
                                                                        });
                                                                        addNotification(`Processed: ${doc.name} — ${res.totalChunks || 0} chunks from ${res.totalPages || 0} pages`, 'success');
                                                                        await loadData();
                                                                    } catch (err) {
                                                                        addNotification('Process failed: ' + err.message, 'error');
                                                                    }
                                                                    setProcessingId(null);
                                                                    setProcessProgress(null);
                                                                }}
                                                                className="p-2 rounded-lg hover:bg-emerald-500/10 transition-colors"
                                                                style={{ color: 'var(--accent-emerald)' }}
                                                                title="Process: Extract text & create chunks (batch mode)"
                                                                disabled={processingId === doc.id}
                                                            >
                                                                {processingId === doc.id
                                                                    ? <HiOutlineRefresh size={16} className="animate-spin" />
                                                                    : <HiOutlineLightningBolt size={16} />
                                                                }
                                                            </button>
                                                        )}
                                                        {doc.drive_file_id && (
                                                            <button
                                                                onClick={() => setPreviewDoc(doc)}
                                                                className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                                                                style={{ color: 'var(--accent-cyan)' }}
                                                                title="Preview"
                                                            >
                                                                <HiOutlineEye size={16} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDeleteDoc(doc)}
                                                            className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                                                            style={{ color: 'var(--accent-rose)' }}
                                                            title="Delete"
                                                        >
                                                            <HiOutlineTrash size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Drive Preview Modal */}
                <AnimatePresence>
                    {previewDoc && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="modal-overlay"
                            onClick={() => setPreviewDoc(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="modal-content"
                                style={{ maxWidth: '900px', padding: '16px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-3 px-2">
                                    <h3 className="font-semibold">{previewDoc.name}</h3>
                                    <button onClick={() => setPreviewDoc(null)} className="p-2 rounded-lg hover:bg-white/5">
                                        <HiOutlineX size={18} />
                                    </button>
                                </div>
                                <iframe
                                    src={`https://drive.google.com/file/d/${previewDoc.drive_file_id}/preview`}
                                    className="w-full rounded-xl"
                                    style={{ height: '70vh', border: 'none' }}
                                    allow="autoplay"
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AppShell>
    );
}
