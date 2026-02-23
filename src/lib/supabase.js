'use client';

import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config';

let supabaseInstance = null;

/**
 * Gets the Supabase client instance (v16.0)
 */
export function getSupabase() {
    if (supabaseInstance) return supabaseInstance;

    const config = getConfig();
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        console.warn('[MetroCircuit] Supabase credentials missing.');
        return null;
    }

    supabaseInstance = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    return supabaseInstance;
}

/**
 * Saves a generated artifact (PNG/PDF) to Supabase Storage
 * @param {string} type - 'diagram' | 'report'
 * @param {string} fileName - name of file
 * @param {Blob} blob - file data
 * @param {string} workspaceId - optional workspace scoping
 */
export async function saveArtifact(type, fileName, blob, workspaceId = 'default') {
    const supabase = getSupabase();
    if (!supabase) return null;

    const path = `workspace/${workspaceId}/outputs/${type}/${Date.now()}_${fileName}`;
    const { data, error } = await supabase.storage
        .from('outputs')
        .upload(path, blob, {
            contentType: blob.type,
            cacheControl: '3600',
            upsert: false
        });

    if (error) throw error;

    // Log to generated_files table
    const { data: fileData, error: dbError } = await supabase
        .from('generated_files')
        .insert([{
            workspace_id: workspaceId,
            type: type,
            storage_path: data.path,
            format: fileName.split('.').pop(),
            metadata: { name: fileName }
        }])
        .select();

    if (dbError) console.error('[Supabase] DB Logging failed:', dbError);

    return data;
}

/**
 * Logs a Query and Answer (Audit Trail)
 */
export async function logQA(question, answer, agent, citations = []) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data: qData, error: qError } = await supabase
        .from('queries')
        .insert([{ question }])
        .select();

    if (qError) return console.error('[Supabase] Query log failed:', qError);

    const { error: aError } = await supabase
        .from('answers')
        .insert([{
            query_id: qData[0].id,
            answer_text: answer,
            agent_used: agent,
            citations: citations
        }]);

    if (aError) console.error('[Supabase] Answer log failed:', aError);
}
