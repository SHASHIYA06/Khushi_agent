'use client';

/**
 * Google Drive Picker Service (v16.0)
 * Handles Google Login and Drive File/Folder selection.
 */

import { getConfig } from './config';

let gapiInited = false;
let gisiInited = false;
let accessToken = null;

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

/**
 * Loads the external Google Scripts
 */
export function loadGoogleScripts() {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') return resolve();
        if (gapiInited && gisiInited) return resolve();

        const script1 = document.createElement('script');
        script1.src = 'https://apis.google.com/js/api.js';
        script1.onload = () => {
            window.gapi.load('client:picker', () => {
                gapiInited = true;
                if (gisiInited) resolve();
            });
        };
        document.body.appendChild(script1);

        const script2 = document.createElement('script');
        script2.src = 'https://accounts.google.com/gsi/client';
        script2.onload = () => {
            gisiInited = true;
            if (gapiInited) resolve();
        };
        document.body.appendChild(script2);
    });
}

/**
 * Authenticates the user and returns an access token
 */
export async function authenticate() {
    const config = getConfig();
    if (!config.GOOGLE_CLIENT_ID) throw new Error('Missing Google Client ID in settings.');

    return new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: config.GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.error) return reject(response);
                accessToken = response.access_token;
                resolve(accessToken);
            },
        });
        client.requestAccessToken({ prompt: 'consent' });
    });
}

/**
 * Opens the Google Drive Picker for Multi-selection
 * @param {Function} onSelect - Callback when files are selected
 */
export async function openDrivePicker(onSelect) {
    const config = getConfig();
    await loadGoogleScripts();

    if (!accessToken) {
        await authenticate();
    }

    const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(true);

    const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setAppId(config.GOOGLE_CLIENT_ID.split('-')[0])
        .setOAuthToken(accessToken)
        .addView(view)
        .setCallback((data) => {
            if (data.action === window.google.picker.Action.PICKED) {
                onSelect(data.docs);
            }
        })
        .build();

    picker.setVisible(true);
}
