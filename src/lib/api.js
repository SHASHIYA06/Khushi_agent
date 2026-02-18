'use client';

import { getConfig } from './config';

// ============================================================
// Google Apps Script API Service Layer
// ============================================================
// Key fixes for GAS web app compatibility:
// 1. No Content-Type header → avoids CORS preflight (OPTIONS)
// 2. Use redirect: 'follow' → handles GAS 302 redirects
// 3. Use text/plain content type → no preflight trigger
// 4. Robust error handling for opaque/redirect responses
// ============================================================

async function callBackend(payload) {
    const config = getConfig();
    if (!config.GOOGLE_SCRIPT_URL) {
        throw new Error('Google Script URL not configured. Please go to Settings.');
    }

    try {
        const res = await fetch(config.GOOGLE_SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload),
        });

        // GAS web apps may return various status codes after redirect
        const text = await res.text();

        if (!text) {
            throw new Error('Empty response from backend');
        }

        try {
            return JSON.parse(text);
        } catch (parseErr) {
            // Check if response contains an error HTML page
            if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                throw new Error('Backend returned HTML instead of JSON. Check your Apps Script deployment URL and make sure it is deployed as "Execute as Me, Anyone can access".');
            }
            throw new Error('Invalid JSON response: ' + text.substring(0, 200));
        }
    } catch (err) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            throw new Error(
                'Network error connecting to backend. Possible causes:\n' +
                '1. Google Script URL is incorrect\n' +
                '2. Apps Script is not deployed as Web App\n' +
                '3. Deployment access is not set to "Anyone"\n' +
                '4. You need to re-deploy after code changes'
            );
        }
        throw err;
    }
}

// ============================================================
// FOLDER OPERATIONS
// ============================================================

export async function createFolder(name, description = '') {
    return callBackend({ action: 'create_folder', name, description });
}

export async function deleteFolder(folderId) {
    return callBackend({ action: 'delete_folder', folderId });
}

export async function listFolders() {
    return callBackend({ action: 'list_folders' });
}

// ============================================================
// DOCUMENT OPERATIONS
// ============================================================

export async function uploadDocument(file, folderId = null) {
    // Validate file size (max 50MB for base64 over Apps Script)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 50MB for Apps Script processing.`);
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
                    mimeType: file.type || 'application/pdf',
                    documentId: crypto.randomUUID(),
                    folderId,
                });

                if (result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result);
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

export async function listDocuments(folderId = null) {
    return callBackend({ action: 'list_documents', folderId });
}

export async function deleteDocument(documentId, driveFileId = null) {
    return callBackend({ action: 'delete_document', documentId, driveFileId });
}

// ============================================================
// QUERY (RAG)
// ============================================================

export async function queryDocuments(query, options = {}) {
    return callBackend({
        action: 'query',
        query,
        matchCount: options.matchCount || 8,
        outputType: options.outputType || 'text',
        filterPanel: options.filterPanel || null,
        filterVoltage: options.filterVoltage || null,
    });
}

// ============================================================
// DRIVE SYNC
// ============================================================

export async function syncDrive() {
    return callBackend({ action: 'sync_drive' });
}

// ============================================================
// HEALTH CHECK
// ============================================================

export async function checkBackendHealth() {
    const config = getConfig();
    if (!config.GOOGLE_SCRIPT_URL) {
        return { status: 'error', message: 'Google Script URL not configured' };
    }

    try {
        const res = await fetch(config.GOOGLE_SCRIPT_URL, {
            method: 'GET',
            redirect: 'follow',
        });
        const text = await res.text();
        const data = JSON.parse(text);
        return { status: 'ok', ...data };
    } catch (err) {
        return { status: 'error', message: err.message };
    }
}
