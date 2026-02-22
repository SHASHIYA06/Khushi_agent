'use client';

import { getConfig } from './config';

// ============================================================
// API Service — Talks to Google Apps Script backend
// No Supabase, no external DB — everything via Google Sheets
// ============================================================

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================
// CORE: Call the backend
// Uses text/plain to avoid CORS preflight with Google Apps Script
// ============================================================

async function callBackend(payload) {
    const config = getConfig();

    if (!config.GOOGLE_SCRIPT_URL) {
        throw new Error('Google Script URL not configured. Go to Settings → paste your Apps Script deployment URL.');
    }

    console.log('[MetroCircuit] API call:', payload.action, payload);

    try {
        const res = await fetch(config.GOOGLE_SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                ...payload,
                apiKey: config.GEMINI_API_KEY,
                folderId: config.DRIVE_FOLDER_ID
            }),
        });

        const text = await res.text();
        console.log('[MetroCircuit] Raw response (' + payload.action + '):', text.substring(0, 500));

        if (!text || text.trim().length === 0) {
            throw new Error('Empty response from backend');
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            // Sometimes GAS returns HTML error pages
            if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                throw new Error('Backend returned HTML instead of JSON. Re-deploy your Google Apps Script.');
            }
            throw new Error('Invalid JSON response: ' + text.substring(0, 200));
        }

        if (data.error) {
            throw new Error(data.error);
        }

        return data;

    } catch (err) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            throw new Error('Cannot reach backend. Check your Google Script URL in Settings.');
        }
        throw err;
    }
}

// ============================================================
// INIT / HEALTH
// ============================================================

export async function initDatabase() {
    return callBackend({ action: 'init_db' });
}

export async function checkBackendHealth() {
    return callBackend({ action: 'health' });
}

// ============================================================
// FOLDER OPERATIONS
// ============================================================

export async function listFolders() {
    return callBackend({ action: 'list_folders' });
}

export async function createFolder(name, description = '') {
    return callBackend({ action: 'create_folder', name, description });
}

export async function deleteFolder(folderId) {
    return callBackend({ action: 'delete_folder', folderId });
}

// ============================================================
// DOCUMENT OPERATIONS
// ============================================================

export async function listDocuments(folderId = null) {
    return callBackend({ action: 'list_documents', folderId });
}

export async function uploadDocument(file, folderId = null) {
    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 50MB.`);
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const base64 = reader.result.split(',')[1];
                const result = await callBackend({
                    action: 'upload',
                    file: base64,
                    fileName: file.name,
                    mimeType: file.type,
                    folderId: folderId,
                });
                resolve(result);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
    });
}

export async function deleteDocument(documentId, driveFileId = null) {
    return callBackend({ action: 'delete_document', documentId, driveFileId });
}

export async function processDocument(documentId) {
    return callBackend({ action: 'process_document', documentId });
}

/**
 * Batch-process a document with auto-continue and progress callback.
 * Calls process_batch in a loop until processing is complete.
 * @param {string} documentId - The document ID to process
 * @param {function} onProgress - Callback: ({ status, pagesProcessed, totalPages, totalChunks, message }) => void
 * @returns {Promise<object>} Final result with status 'indexed'
 */
export async function processDocumentBatch(documentId, onProgress) {
    // Step 1: Start processing (calls process_document which kicks off batch)
    let result = await callBackend({ action: 'process_document', documentId });

    if (onProgress) {
        onProgress(result);
    }

    // Step 2: Continue batching until complete
    let maxIterations = 200; // Safety limit (~2000 pages max)
    while (result.status === 'in_progress' && maxIterations > 0) {
        // Small delay between batch calls
        await new Promise(resolve => setTimeout(resolve, 1500));

        result = await callBackend({ action: 'process_batch', documentId });

        if (onProgress) {
            onProgress(result);
        }

        maxIterations--;
    }

    return result;
}

export async function getProcessStatus(documentId) {
    return callBackend({ action: 'get_process_status', documentId });
}

export async function embedDocumentChunks(documentId) {
    return callBackend({ action: 'embed_chunks', documentId });
}

// ============================================================
// DRIVE SYNC
// ============================================================

export async function syncDrive() {
    return callBackend({ action: 'sync_drive' });
}

// ============================================================
// RAG QUERY
// ============================================================

export async function queryRAG(query, options = {}) {
    return callBackend({
        action: 'query',
        query,
        outputType: options.outputType || 'text',
        filterPanel: options.filterPanel || '',
        filterVoltage: options.filterVoltage || '',
        matchCount: options.matchCount || 8,
        folderId: options.folderId || null,
        documentId: options.documentId || null,
    });
}
