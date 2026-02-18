'use client';

import { getConfig } from './config';

// API service layer wrapping all Google Apps Script calls

async function callBackend(payload) {
    const config = getConfig();
    if (!config.GOOGLE_SCRIPT_URL) {
        throw new Error('Google Script URL not configured. Please go to Settings.');
    }

    const res = await fetch(config.GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(`Backend error: ${res.status}`);
    }

    return res.json();
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
                    documentId: crypto.randomUUID(),
                    folderId,
                });
                resolve(result);
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
