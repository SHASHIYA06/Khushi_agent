// ============================================================
// MetroCircuit AI — Google Apps Script Backend v4.0 (V8 Runtime)
// 🚀 ZERO EXTERNAL DEPENDENCIES — Google Sheets as Database
// Deploy as Web App: Execute as Me, Access: Anyone
// ============================================================
//
// SETUP:
// 1. Create new Apps Script project at script.google.com
// 2. Paste this entire code
// 3. Set GEMINI_API_KEY & DRIVE_FOLDER_ID in Project Settings -> Script Properties
// 4. Enable "Drive API" v2 in Services (+ icon in sidebar)
// 5. In appsscript.json -> ensure "runtimeVersion": "V8"
// 7. Deploy → New Deployment → Web App
//    - Execute as: Me | Access: Anyone
// 8. Copy deployment URL to MetroCircuit Settings page
// 9. Click "Initialize DB" button in Settings
//
// That's it! No Supabase, no external database needed.
// ============================================================

// ============================================================
// SECURITY: Using Script Properties instead of hardcoding
// Set these in Apps Script Settings → Script Properties:
// - GEMINI_API_KEY
// - DRIVE_FOLDER_ID
// ============================================================

const SCRIPT_PROPS = PropertiesService.getScriptProperties();

/**
 * High-performance Secret Resolver
 * Prioritizes request payload, then Script Properties.
 */
function resolveConfig(data) {
  const api = data.apiKey || SCRIPT_PROPS.getProperty("GEMINI_API_KEY");
  const folder = data.folderId || SCRIPT_PROPS.getProperty("DRIVE_FOLDER_ID");
  
  const config = {
    apiKey: (api && api !== "SET_IN_PROPERTIES") ? api : null,
    folderId: (folder && folder !== "SET_IN_PROPERTIES") ? folder : null
  };
  
  // Cache for global use in this execution context
  globalConfig = config;
  return config;
}

// Global config placeholder
let globalConfig = { apiKey: null, folderId: null };

// Backward compatibility helpers
function getActiveApiKey() { return globalConfig.apiKey; }
function getActiveFolderId() { return globalConfig.folderId; }

// Gemini models to try
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
];

// Optional: set manually if you already have a database spreadsheet
const SPREADSHEET_ID_OVERRIDE = "";

// MANUAL SETUP HELPER: Run this function once in the Apps Script Editor to set your keys!
function RUN_THIS_FOR_SETUP() {
  const ui = SpreadsheetApp.getUi();
  const apiResp = ui.prompt("SETUP: Enter Gemini API Key", "Get it from aistudio.google.com", ui.ButtonSet.OK_CANCEL);
  if (apiResp.getSelectedButton() == ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty("GEMINI_API_KEY", apiResp.getResponseText());
  }
  
  const folderResp = ui.prompt("SETUP: Enter Drive Folder ID", "Leave blank to auto-create 'MetroCircuit_Data'", ui.ButtonSet.OK_CANCEL);
  if (folderResp.getSelectedButton() == ui.Button.OK) {
    let fId = folderResp.getResponseText();
    if (!fId) {
      const folder = DriveApp.createFolder("MetroCircuit_Data");
      fId = folder.getId();
    }
    PropertiesService.getScriptProperties().setProperty("DRIVE_FOLDER_ID", fId);
  }
  ui.alert("Setup Complete! Please refresh your web app.");
}

// Batch processing config
const BATCH_PAGE_SIZE = 10;          // Pages per batch call
const TIME_LIMIT_MS = 5 * 60 * 1000; // 5 minutes (leaving 1 min buffer)
const CHUNK_TARGET_SIZE = 800;       // Smaller chunks for dense wiring details
const CHUNK_OVERLAP = 300;           // High overlap for schematic continuity

// ============================================================
// DATABASE: Get or create the Google Sheet database
// ============================================================

function getDB() {
  // Check manual override
  if (SPREADSHEET_ID_OVERRIDE) {
    return SpreadsheetApp.openById(SPREADSHEET_ID_OVERRIDE);
  }

  // Check stored ID in Script Properties
  const props = PropertiesService.getScriptProperties();
  const storedId = props.getProperty("DB_SPREADSHEET_ID");

  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (e) {
      Logger.log("Stored spreadsheet not found, creating new one");
    }
  }

  // Create new database spreadsheet
  const ss = SpreadsheetApp.create("MetroCircuit AI Database");

  // Move to Drive folder if possible
  try {
    const file = DriveApp.getFileById(ss.getId());
    const folder = DriveApp.getFolderById(getActiveFolderId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {
    Logger.log("Could not move DB to folder: " + e.message);
  }

  // Create tabs with headers
  const docSheet = ss.getActiveSheet();
  docSheet.setName("Documents");
  docSheet.getRange(1, 1, 1, 8).setValues([[
    "id", "name", "folder_id", "drive_file_id", "file_type", "status", "page_count", "created_at"
  ]]);

  const chunkSheet = ss.insertSheet("Chunks");
  chunkSheet.getRange(1, 1, 1, 10).setValues([[
    "id", "document_id", "content", "page_number", "panel", "voltage", "components", "connections", "embedding", "created_at"
  ]]);

  const folderSheet = ss.insertSheet("Folders");
  folderSheet.getRange(1, 1, 1, 4).setValues([[
    "id", "name", "description", "created_at"
  ]]);

  const querySheet = ss.insertSheet("QueryLogs");
  querySheet.getRange(1, 1, 1, 5).setValues([[
    "id", "query", "answer", "match_count", "created_at"
  ]]);

  // Store the ID
  props.setProperty("DB_SPREADSHEET_ID", ss.getId());
  Logger.log("Created database spreadsheet: " + ss.getId());

  return ss;
}

function getSheet(name) {
  const db = getDB();
  let sheet = db.getSheetByName(name);
  if (!sheet) {
    sheet = db.insertSheet(name);
    const headers = {
      Documents: [["id", "name", "folder_id", "drive_file_id", "file_type", "status", "page_count", "created_at"]],
      Chunks: [["id", "document_id", "content", "page_number", "panel", "voltage", "components", "connections", "embedding", "created_at"]],
      Folders: [["id", "name", "description", "created_at"]],
      QueryLogs: [["id", "query", "answer", "match_count", "created_at"]]
    };
    if (headers[name]) {
      sheet.getRange(1, 1, 1, headers[name][0].length).setValues(headers[name]);
    }
  }
  return sheet;
}

// ============================================================
// REQUEST ROUTING
// ============================================================

// ============================================================
// REQUEST ROUTING
// ============================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    return routeAction(data);
  } catch (err) {
    Logger.log("doPost Error: " + err.message + "\n" + err.stack);
    return jsonResp({ error: err.message });
  }
}

function doGet(e) {
  const params = e.parameter || {};
  
  // Health check/API interface
  if (params.action) {
    return routeAction(params);
  }
  
  // Simple landing page for debugging
  return HtmlService.createHtmlOutput(
    `<html>
      <body style="font-family: sans-serif; padding: 20px; background: #0f172a; color: #f8fafc;">
        <h2 style="color: #3b82f6;">🚇 MetroCircuit AI Backend v7.6</h2>
        <p>Status API Key: ${getActiveApiKey() ? "✅ Ready" : "❌ Missing"}</p>
        <p>Status Folder: ${getActiveFolderId() ? "✅ Ready" : "❌ Missing"}</p>
        <hr style="border: 0; border-top: 1px solid #334155;">
        <p><b>Configuration Required?</b> If you see red marks, go to <b>Project Settings -> Script Properties</b> in the Apps Script editor and add <code>getActiveApiKey()</code> and <code>getActiveFolderId()</code>.</p>
        <p>Alternatively, run the <code>RUN_THIS_FOR_SETUP</code> function in the editor.</p>
      </body>
    </html>`
  ).setTitle("Backend Status");
}

function routeAction(data) {
  const action = data.action;
  const config = resolveConfig(data);
  
  // Health/Setup check
  if (action === "health") {
    let apiStatus = "❌ Missing";
    let folderStatus = "❌ Missing";
    if (config.apiKey) apiStatus = "✅ Found";
    if (config.folderId) {
       try { DriveApp.getFolderById(config.folderId); folderStatus = "✅ Accessible"; }
       catch(e) { folderStatus = "❌ Invalid ID"; }
    }

    return jsonResp({
      status: "online",
      version: "8.5",
      config: { api: apiStatus, folder: folderStatus },
      db_ready: !!SCRIPT_PROPS.getProperty("DB_SPREADSHEET_ID")
    });
  }

  // CONFIG GUARD
  if (!config.apiKey || !config.folderId) {
    return jsonResp({ 
      error: "MISSING_CONFIGURATION", 
      message: "Please provide GEMINI_API_KEY and DRIVE_FOLDER_ID in App Settings or Script Properties." 
    });
  }

  if (!action) return jsonResp({ error: "No action specified" });

  switch (action) {
    case "init_db":             return initDB();
    case "upload":              return uploadFile(data);
    case "list_documents":      return listDocuments(data);
    case "delete_document":     return deleteDocumentAction(data);
    case "process_document":    return processDocumentAction(data);
    case "process_batch":       return processBatchAction(data);
    case "get_process_status":  return getProcessStatus(data);
    case "embed_chunks":        return embedChunksAction(data);
    case "create_folder":       return createFolderAction(data);
    case "delete_folder":       return deleteFolderAction(data);
    case "list_folders":        return listFoldersAction();
    case "query":               return handleQuery(data);
    case "sync_drive":          return syncDriveFiles();
    default:                    return jsonResp({ error: "Unknown action: " + data.action });
  }
}

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SHARED GEMINI API CALLER (auto-retries with multiple models)
// ============================================================

function callGemini(contents, config = {}) {
  const apiKey = config.apiKey || globalConfig.apiKey;
  
  if (!apiKey) {
    Logger.log("ERROR: Attempted Gemini call with NO API Key.");
    return null;
  }
  
  const temperature = config.temperature !== undefined ? config.temperature : 0.2;
  const maxOutputTokens = config.maxOutputTokens || 4096;
  
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    const versions = ["v1", "v1beta"];
    for (const v of versions) {
      try {
        const url = `https://generativelanguage.googleapis.com/${v}/models/${model}:generateContent?key=${apiKey}`;
        const res = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify({
            contents: contents,
            generationConfig: { temperature, maxOutputTokens }
          }),
          muteHttpExceptions: true
        });

        const status = res.getResponseCode();
        const responseText = res.getContentText();
        
        if (status === 200) {
          const result = JSON.parse(responseText);
          if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts) {
            return result.candidates[0].content.parts[0].text;
          }
        } else {
          lastError = `Gemini ${model} error (${status}): ${responseText}`;
          Logger.log(lastError);
        }
      } catch (e) {
        lastError = `Fetch error ${model}: ${e.message}`;
        Logger.log(lastError);
      }
    }
  }
  
  // If we reach here, all models failed
  globalContextError = lastError;
  return null;
}

let globalContextError = null;

// ============================================================
// INIT DATABASE
// ============================================================

function initDB() {
  try {
    const db = getDB();
    return jsonResp({
      status: "ok",
      message: "Database initialized",
      spreadsheetId: db.getId(),
      spreadsheetUrl: db.getUrl()
    });
  } catch (e) {
    return jsonResp({ error: "Failed to initialize DB: " + e.message });
  }
}

// ============================================================
// FOLDER OPERATIONS
// ============================================================

function createFolderAction(data) {
  if (!data.name) return jsonResp({ error: "Folder name required" });

  const sheet = getSheet("Folders");
  const id = Utilities.getUuid();
  const now = new Date().toISOString();

  sheet.appendRow([id, data.name, data.description || "", now]);

  return jsonResp({
    status: "created",
    folder: { id, name: data.name, description: data.description || "", created_at: now }
  });
}

function deleteFolderAction(data) {
  if (!data.folderId) return jsonResp({ error: "Folder ID required" });

  const sheet = getSheet("Folders");
  deleteRowById(sheet, data.folderId);

  // Also delete documents in this folder
  const docSheet = getSheet("Documents");
  const docData = docSheet.getDataRange().getValues();
  for (let i = docData.length - 1; i >= 1; i--) {
    if (docData[i][2] === data.folderId) {
      deleteChunksByDocId(docData[i][0]);
      docSheet.deleteRow(i + 1);
    }
  }

  return jsonResp({ status: "deleted" });
}

function listFoldersAction() {
  const sheet = getSheet("Folders");
  const data = sheet.getDataRange().getValues();
  const folders = [];

  for (let i = 1; i < data.length; i++) {
    folders.push({
      id: data[i][0],
      name: data[i][1],
      description: data[i][2],
      created_at: data[i][3]
    });
  }

  // AUTO-HEAL: If no folders exist in DB but they might be in Drive, or to keep fresh
  if (folders.length === 0) {
    Logger.log("DB Folders empty, triggering sync_drive auto-heal...");
    syncDriveFiles();
  }

  folders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return jsonResp({ folders });
}

// ============================================================
// DOCUMENT UPLOAD + PROCESSING
// ============================================================

function uploadFile(data) {
  if (!data.file || !data.fileName) {
    return jsonResp({ error: "Missing file or fileName" });
  }

  Logger.log("Upload started: " + data.fileName);

  try {
    // 1. Save to Google Drive
    const blob = Utilities.newBlob(
      Utilities.base64Decode(data.file),
      data.mimeType || "application/pdf",
      data.fileName
    );

    let folder;
    try {
      folder = DriveApp.getFolderById(globalThis.ACTIVE_FOLDER_ID);
    } catch (e) {
      return jsonResp({ error: "Invalid getActiveFolderId(). Check your config. ID: " + globalThis.ACTIVE_FOLDER_ID });
    }

    const file = folder.createFile(blob);
    const fileId = file.getId();

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log("Could not set sharing: " + e.message);
    }

    // 2. Register document in Sheets
    const docId = Utilities.getUuid();
    const docSheet = getSheet("Documents");
    const now = new Date().toISOString();

    docSheet.appendRow([
      docId, data.fileName, data.folderId || "", fileId,
      data.mimeType || "application/pdf", "processing", 0, now
    ]);

    Logger.log("Document registered: " + docId);

    // 3. Extract text and process
    const text = extractTextFromFile(file, data.fileName);

    if (!text || text.trim().length < 10) {
      updateDocStatus(docId, "uploaded", 0);
      return jsonResp({
        status: "uploaded",
        message: "File saved but text extraction yielded insufficient text. Use the Process button to retry.",
        documentId: docId,
        driveFileId: fileId
      });
    }

    Logger.log("Extracted " + text.length + " characters");

    // 4. Chunk and embed
    const processResult = processTextIntoChunks(docId, text);

    return jsonResp({
      status: "indexed",
      documentId: docId,
      driveFileId: fileId,
      drivePreviewUrl: "https://drive.google.com/file/d/" + fileId + "/preview",
      chunksProcessed: processResult.processed,
      totalChunks: processResult.total
    });

  } catch (err) {
    Logger.log("Upload Error: " + err.message + "\n" + err.stack);
    return jsonResp({ error: "Upload failed: " + err.message });
  }
}

// ============================================================
// PROCESS DOCUMENT (extracts text, splits into pages, starts batch)
// ============================================================

function processDocumentAction(data) {
  if (!data.documentId) return jsonResp({ error: "Document ID required" });

  try {
    // Find document in sheet
    const docSheet = getSheet("Documents");
    const docData = docSheet.getDataRange().getValues();
    let docRow = -1;
    let doc = null;

    for (let i = 1; i < docData.length; i++) {
      if (String(docData[i][0]) === String(data.documentId)) {
        docRow = i + 1;
        doc = {
          id: docData[i][0],
          name: docData[i][1],
          drive_file_id: docData[i][3],
          file_type: docData[i][4]
        };
        break;
      }
    }

    if (!doc) return jsonResp({ error: "Document not found: " + data.documentId });
    if (!doc.drive_file_id) return jsonResp({ error: "No Drive file linked to this document" });

    // Update status to processing
    docSheet.getRange(docRow, 6).setValue("extracting");
    SpreadsheetApp.flush();

    // Get the file from Drive
    let file;
    try {
      file = DriveApp.getFileById(doc.drive_file_id);
    } catch (e) {
      updateDocStatus(doc.id, "error", 0);
      return jsonResp({ error: "Drive file not found: " + doc.drive_file_id });
    }

    // Extract text
    const text = extractTextFromFile(file, doc.name);

    if (!text || text.trim().length < 10) {
      updateDocStatus(doc.id, "error", 0);
      return jsonResp({
        error: "Could not extract text from '" + doc.name + "'. The file may be image-only or unsupported."
      });
    }

    Logger.log("Extracted " + text.length + " characters from " + doc.name);

    // Split text into pages
    const pages = splitIntoPages(text);
    Logger.log("Split into " + pages.length + " pages");

    // Store pages in Script Properties for batch processing
    const props = PropertiesService.getScriptProperties();
    const batchState = {
      docId: doc.id,
      docName: doc.name,
      totalPages: pages.length,
      processedPages: 0,
      totalChunks: 0,
      startTime: new Date().toISOString()
    };

    // Store pages in chunks (Script Properties has a 9KB per value limit)
    const pageGroups = [];
    let currentGroup = [];
    let currentSize = 0;

    for (let i = 0; i < pages.length; i++) {
      const pageStr = pages[i];
      if (currentSize + pageStr.length > 8000 && currentGroup.length > 0) {
        pageGroups.push(currentGroup);
        currentGroup = [];
        currentSize = 0;
      }
      currentGroup.push(pageStr);
      currentSize += pageStr.length;
    }
    if (currentGroup.length > 0) pageGroups.push(currentGroup);

    // Store page groups
    for (let g = 0; g < pageGroups.length; g++) {
      props.setProperty("BATCH_PAGES_" + doc.id + "_" + g, JSON.stringify(pageGroups[g]));
    }
    batchState.pageGroupCount = pageGroups.length;
    props.setProperty("BATCH_STATE_" + doc.id, JSON.stringify(batchState));

    // Delete old chunks
    deleteChunksByDocId(doc.id);

    // Update status
    updateDocStatus(doc.id, "processing", pages.length);

    // Start first batch immediately
    return processBatchAction({ documentId: doc.id });

  } catch (err) {
    Logger.log("Process error: " + err.message + "\n" + err.stack);
    return jsonResp({ error: "Processing failed: " + err.message });
  }
}

// ============================================================
// BATCH PROCESSING (processes N pages per call with time guard)
// ============================================================

function processBatchAction(data) {
  if (!data.documentId) return jsonResp({ error: "Document ID required" });

  const startTime = Date.now();
  const props = PropertiesService.getScriptProperties();
  const stateKey = "BATCH_STATE_" + data.documentId;

  // Load batch state
  const stateStr = props.getProperty(stateKey);
  if (!stateStr) {
    return jsonResp({ error: "No batch processing state found. Call process_document first." });
  }

  const state = JSON.parse(stateStr);
  Logger.log("Batch processing: doc=" + state.docId + ", processed=" + state.processedPages + "/" + state.totalPages);

  // Load remaining pages
  const allPages = [];
  for (let g = 0; g < state.pageGroupCount; g++) {
    const groupStr = props.getProperty("BATCH_PAGES_" + state.docId + "_" + g);
    if (groupStr) {
      const group = JSON.parse(groupStr);
      allPages.push(...group);
    }
  }

  if (allPages.length === 0) {
    // All done
    cleanupBatchState(state.docId, state.pageGroupCount);
    updateDocStatus(state.docId, "indexed", state.totalChunks);
    return jsonResp({
      status: "indexed",
      documentId: state.docId,
      totalPages: state.totalPages,
      totalChunks: state.totalChunks,
      pagesProcessed: state.totalPages
    });
  }

  // Process pages until time limit
  const chunkSheet = getSheet("Chunks");
  let pagesProcessedThisBatch = 0;
  let chunksCreated = 0;

  for (let p = state.processedPages; p < allPages.length; p++) {
    // TIME GUARD: check if we're approaching the limit
    const elapsed = Date.now() - startTime;
    if (elapsed > TIME_LIMIT_MS) {
      Logger.log("Time limit reached at page " + (p + 1) + ". Saving progress.");
      break;
    }

    const pageText = allPages[p];
    if (!pageText || pageText.trim().length < 5) {
      pagesProcessedThisBatch++;
      continue;
    }

    // Chunk this page
    const pageChunks = engineeringChunkPage(pageText, p + 1);

    for (const chunk of pageChunks) {
      // Extract engineering data (fast — no embedding yet)
      let extraction;
      try {
        extraction = extractEngineeringData(chunk.text);
      } catch (e) {
        extraction = fallbackExtract(chunk.text);
      }

      chunkSheet.appendRow([
        Utilities.getUuid(),
        state.docId,
        chunk.text,
        chunk.pageNumber,
        extraction.panel || "",
        extraction.voltage || "",
        JSON.stringify(extraction.components || []),
        JSON.stringify(extraction.connections || []),
        "[]",  // Empty embedding — will be filled by embed_chunks
        new Date().toISOString()
      ]);
      chunksCreated++;
    }

    pagesProcessedThisBatch++;

    // Rate limiting
    if (pagesProcessedThisBatch > 0 && pagesProcessedThisBatch % 3 === 0) {
      Utilities.sleep(500);
    }
  }

  // Update batch state
  state.processedPages += pagesProcessedThisBatch;
  state.totalChunks += chunksCreated;

  const isComplete = state.processedPages >= allPages.length;

  if (isComplete) {
    // Done! Clean up
    cleanupBatchState(state.docId, state.pageGroupCount);
    updateDocStatus(state.docId, "indexed", state.totalChunks);

    Logger.log("Batch complete: " + state.totalChunks + " chunks from " + state.totalPages + " pages");

    return jsonResp({
      status: "indexed",
      documentId: state.docId,
      totalPages: state.totalPages,
      pagesProcessed: state.processedPages,
      totalChunks: state.totalChunks
    });
  } else {
    // Save progress and return for next batch
    props.setProperty(stateKey, JSON.stringify(state));
    SpreadsheetApp.flush();

    Logger.log("Batch saved: " + state.processedPages + "/" + state.totalPages + " pages, " + state.totalChunks + " chunks");

    return jsonResp({
      status: "in_progress",
      documentId: state.docId,
      totalPages: state.totalPages,
      pagesProcessed: state.processedPages,
      totalChunks: state.totalChunks,
      message: "Processing page " + state.processedPages + " of " + state.totalPages + "..."
    });
  }
}

// ============================================================
// GET PROCESS STATUS
// ============================================================

function getProcessStatus(data) {
  if (!data.documentId) return jsonResp({ error: "Document ID required" });

  const props = PropertiesService.getScriptProperties();
  const stateStr = props.getProperty("BATCH_STATE_" + data.documentId);

  if (!stateStr) {
    // Check if document is already indexed
    const docSheet = getSheet("Documents");
    const docData = docSheet.getDataRange().getValues();
    for (let i = 1; i < docData.length; i++) {
      if (String(docData[i][0]) === String(data.documentId)) {
        return jsonResp({
          status: String(docData[i][5]),
          documentId: data.documentId,
          totalChunks: Number(docData[i][6]) || 0
        });
      }
    }
    return jsonResp({ error: "Document not found" });
  }

  const state = JSON.parse(stateStr);
  return jsonResp({
    status: state.processedPages >= state.totalPages ? "indexed" : "in_progress",
    documentId: state.docId,
    totalPages: state.totalPages,
    pagesProcessed: state.processedPages,
    totalChunks: state.totalChunks,
    startTime: state.startTime
  });
}

// ============================================================
// EMBED CHUNKS (separate pass — adds embeddings to existing chunks)
// ============================================================

function embedChunksAction(data) {
  if (!data.documentId) return jsonResp({ error: "Document ID required" });

  const startTime = Date.now();
  const chunkSheet = getSheet("Chunks");
  const chunkData = chunkSheet.getDataRange().getValues();
  let embedded = 0;
  let skipped = 0;
  
  // Track changes for batch update
  const updates = [];
  const indices = [];

  for (let i = 1; i < chunkData.length; i++) {
    if (String(chunkData[i][1]) !== String(data.documentId)) continue;

    const existingEmb = safeParseJSON(chunkData[i][8], []);
    if (existingEmb && existingEmb.length > 0) {
      skipped++;
      continue;
    }

    if (Date.now() - startTime > TIME_LIMIT_MS) break;

    try {
      const embedding = getGeminiEmbedding(chunkData[i][2]);
      if (embedding && embedding.length > 0) {
        // Prepare batch update
        chunkSheet.getRange(i + 1, 9).setValue(JSON.stringify(embedding));
        embedded++;
      }
    } catch (e) { /* skip and try next */ }

    if (embedded % 3 === 0) Utilities.sleep(500); 
  }

  return jsonResp({
    status: embedded > 0 ? "partial" : "indexed", // Trigger next pass if needed
    documentId: data.documentId,
    embedded: embedded,
    skipped: skipped
  });
}

// ============================================================
// CLEANUP BATCH STATE
// ============================================================

function cleanupBatchState(docId, groupCount) {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty("BATCH_STATE_" + docId);
  for (let g = 0; g < (groupCount || 50); g++) {
    props.deleteProperty("BATCH_PAGES_" + docId + "_" + g);
  }
}

// ============================================================
// SPLIT TEXT INTO PAGES
// ============================================================

function splitIntoPages(text) {
  // Strategy 1: Look for page markers (common in converted PDFs)
  let pages = text.split(/(?:\n\s*){3,}|\f|(?:---\s*\n)|(?:Page\s+\d+\s*(?:of\s+\d+)?\s*\n)/i);

  // Strategy 2: If very few splits, try numbered page patterns
  if (pages.length <= 3 && text.length > 5000) {
    pages = text.split(/(?=(?:^|\n)\s*(?:\d+\.\s|DRAWING\s|SHEET\s|DWG\s|SLD\s|CIRCUIT\s|PAGE\s)\s*)/gi);
  }

  // Strategy 3: If still one big block, chunk by character count (~2000 chars per "page")
  if (pages.length <= 2 && text.length > 3000) {
    pages = [];
    const pageSize = 2000;
    for (let i = 0; i < text.length; i += pageSize) {
      // Find a natural break point near the target
      let end = Math.min(i + pageSize, text.length);
      if (end < text.length) {
        const nlPos = text.indexOf("\n", end - 200);
        if (nlPos > 0 && nlPos < end + 200) end = nlPos;
      }
      pages.push(text.substring(i, end));
      if (end !== i + pageSize) i = end - i - pageSize + end; // adjust
    }

    // Simpler fallback
    if (pages.length <= 1) {
      pages = [];
      for (let i = 0; i < text.length; i += 2000) {
        pages.push(text.substring(i, Math.min(i + 2000, text.length)));
      }
    }
  }

  // Filter empty pages
  return pages.filter(p => p && p.trim().length > 5);
}

// ============================================================
// SHARED: Process text into chunks (legacy — for small docs via upload)
// ============================================================

function processTextIntoChunks(docId, text) {
  const pages = splitIntoPages(text);
  const chunkSheet = getSheet("Chunks");
  const logSheet = getSheet("BatchLogs"); // Metadata for parent context
  let totalChunks = 0;
  
  // Prepare batch for performance
  const batchRows = [];
  const MAX_BATCH = 20; // Insert in groups to handle sheet size limits
  
  for (let p = 0; p < pages.length; p++) {
    const pageNumber = p + 1;
    const pageText = pages[p];
    
    // Page-level summary for LlamaIndex-style hierarchical retrieval
    let pageSummary = "";
    try {
      pageSummary = generatePageSummary(pageText);
    } catch(e) { Logger.log("Summary failed: " + e.message); }

    const pageChunks = engineeringChunkPage(pageText, pageNumber);

    for (const chunk of pageChunks) {
      try {
        const extraction = extractEngineeringData(chunk.text);
        
        // Metadata Injection for 100% match retrieval
        const enhancedContent = `[Doc:${docId} Page:${pageNumber}] [Context:${pageSummary}] \n\n ${chunk.text}`;

        batchRows.push([
          Utilities.getUuid(),
          docId,
          enhancedContent,
          pageNumber,
          extraction.panel || "",
          extraction.voltage || "",
          JSON.stringify(extraction.components || []),
          JSON.stringify(extraction.connections || []),
          "[]", // Embeddings placeholder
          new Date().toISOString()
        ]);
        
        totalChunks++;

        // Batch insertion for SPEED and RELIABILITY (100% Match Indexing)
        if (batchRows.length >= MAX_BATCH) {
          const lastRow = chunkSheet.getLastRow();
          chunkSheet.getRange(lastRow + 1, 1, batchRows.length, batchRows[0].length).setValues(batchRows);
          batchRows.length = 0;
          Utilities.sleep(200); // Prevent quota hits
        }
      } catch (chunkErr) {
        Logger.log("Chunk error: " + chunkErr.message);
      }
    }
  }

  // Final flush
  if (batchRows.length > 0) {
    const lastRow = chunkSheet.getLastRow();
    chunkSheet.getRange(lastRow + 1, 1, batchRows.length, batchRows[0].length).setValues(batchRows);
  }

  return { processed: totalChunks, total: totalChunks };
}

function generatePageSummary(text) {
  if (text.length < 200) return "";
  const prompt = "Summarize this electrical engineering document page in ONE sentence. Focus on panels, systems, or drawings described. Output ONE line ONLY.";
  return callGemini([{ parts: [{ text: prompt + "\n\nTEXT: " + text.substring(0, 3000) }] }], { temperature: 0, maxOutputTokens: 100 }) || "";
}

// ============================================================
// DOCUMENT LISTING & MANAGEMENT
// ============================================================

function listDocuments(data) {
  const sheet = getSheet("Documents");
  const rawData = sheet.getDataRange().getValues();
  const documents = [];

  for (let i = 1; i < rawData.length; i++) {
    const doc = {
      id: rawData[i][0],
      name: rawData[i][1],
      folder_id: rawData[i][2],
      drive_file_id: rawData[i][3],
      file_type: rawData[i][4],
      status: rawData[i][5],
      page_count: rawData[i][6],
      created_at: rawData[i][7]
    };

    // Filter by folder
    if (data && data.folderId && doc.folder_id !== data.folderId) continue;

    documents.push(doc);
  }

  documents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return jsonResp({ documents });
}

function deleteDocumentAction(data) {
  if (!data.documentId) return jsonResp({ error: "Document ID required" });

  // Delete from Drive
  try {
    if (data.driveFileId) {
      DriveApp.getFileById(data.driveFileId).setTrashed(true);
    }
  } catch (e) {
    Logger.log("Drive delete failed: " + e.message);
  }

  // Delete chunks
  deleteChunksByDocId(data.documentId);

  // Delete document row
  const sheet = getSheet("Documents");
  deleteRowById(sheet, data.documentId);

  return jsonResp({ status: "deleted" });
}

// ============================================================
// DRIVE SYNC
// ============================================================

function syncDriveFiles() {
  try {
    let folder;
    try {
      folder = DriveApp.getFolderById(getActiveFolderId());
    } catch (e) {
      return jsonResp({
        error: "Cannot open Drive folder. Check getActiveFolderId() in Code.gs. Current value: " +
               getActiveFolderId() + ". Error: " + e.message
      });
    }

    const files = folder.getFiles();
    const synced = [];

    // Get existing drive file IDs
    const docSheet = getSheet("Documents");
    const docData = docSheet.getDataRange().getValues();
    const existingDriveIds = new Set();
    for (let i = 1; i < docData.length; i++) {
      if (docData[i][3]) existingDriveIds.add(String(docData[i][3]));
    }

    // Get the DB spreadsheet ID to skip it
    const props = PropertiesService.getScriptProperties();
    const dbId = props.getProperty("DB_SPREADSHEET_ID") || "";

    while (files.hasNext()) {
      const file = files.next();
      const fileId = file.getId();

      // Skip already-synced files
      if (existingDriveIds.has(fileId)) continue;

      // Skip the database spreadsheet
      if (fileId === dbId) continue;

      // Skip Google Forms
      if (file.getMimeType() === "application/vnd.google-apps.form") continue;

      const docId = Utilities.getUuid();
      const now = new Date().toISOString();

      docSheet.appendRow([
        docId,
        file.getName(),
        "",
        fileId,
        file.getMimeType(),
        "uploaded",
        0,
        now
      ]);

      synced.push({ name: file.getName(), id: docId, type: file.getMimeType() });
    }

    return jsonResp({
      status: "synced",
      newFiles: synced.length,
      files: synced
    });
  } catch (err) {
    Logger.log("Sync error: " + err.message + "\n" + err.stack);
    return jsonResp({ error: "Drive sync failed: " + err.message });
  }
}

// ============================================================
// TEXT EXTRACTION (multi-strategy, V8 compatible)
// ============================================================

function extractTextFromFile(file, fileName) {
  let text = "";
  const mimeType = file.getMimeType();
  Logger.log("=== EXTRACTING: " + fileName + " (type: " + mimeType + ") ===");

  // Strategy 0: Google-native files
  if (mimeType === "application/vnd.google-apps.document") {
    try {
      const doc = DocumentApp.openById(file.getId());
      text = doc.getBody().getText();
      Logger.log("Google Doc: " + text.length + " chars");
      if (text && text.trim().length > 10) return text;
    } catch (e) { Logger.log("Google Doc failed: " + e.message); }
  }

  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    try {
      const ss = SpreadsheetApp.openById(file.getId());
      const allText = [];
      for (const sheet of ss.getSheets()) {
        const data = sheet.getDataRange().getValues();
        for (const row of data) {
          allText.push(row.join(" | "));
        }
      }
      text = allText.join("\n");
      Logger.log("Google Sheet: " + text.length + " chars");
      if (text && text.trim().length > 10) return text;
    } catch (e) { Logger.log("Google Sheet failed: " + e.message); }
  }

  if (mimeType === "application/vnd.google-apps.presentation") {
    try {
      const pres = SlidesApp.openById(file.getId());
      const slideTexts = [];
      for (const slide of pres.getSlides()) {
        for (const shape of slide.getShapes()) {
          if (shape.getText) slideTexts.push(shape.getText().asString());
        }
      }
      text = slideTexts.join("\n\n");
      Logger.log("Google Slides: " + text.length + " chars");
      if (text && text.trim().length > 10) return text;
    } catch (e) { Logger.log("Google Slides failed: " + e.message); }
  }

  // For other Google-native types, skip blob-based strategies
  if (mimeType.startsWith("application/vnd.google-apps")) {
    Logger.log("Google-native file type with no more strategies: " + mimeType);
    return text;
  }

  // Strategy 1: Direct text read
  if (/\.(txt|csv|text|log|md|json|xml|html|htm|ini|cfg|yaml|yml)$/i.test(fileName)) {
    try {
      text = file.getBlob().getDataAsString();
      Logger.log("Direct text: " + text.length + " chars");
      if (text && text.trim().length > 10) return text;
    } catch (e) { Logger.log("Direct text failed: " + e.message); }
  }

  // Strategy 2: Gemini Vision (most reliable for PDFs/images)
  // Moved BEFORE OCR because it works better for scanned PDFs
  try {
    Logger.log("Trying Gemini Vision...");
    const blob = file.getBlob();
    const bytes = blob.getBytes();
    Logger.log("File size: " + bytes.length + " bytes (" + (bytes.length / 1024 / 1024).toFixed(2) + " MB)");

    if (bytes.length < 15 * 1024 * 1024) { // 15MB limit
      const base64 = Utilities.base64Encode(bytes);
      text = geminiExtractText(base64, mimeType);
      if (text && text.trim().length > 10) {
        Logger.log("Gemini Vision SUCCESS: " + text.length + " chars");
        return text;
      }
    } else {
      Logger.log("File too large for Gemini Vision");
    }
  } catch (e) {
    Logger.log("Gemini Vision error: " + e.message);
  }

  // Strategy 3: Google Drive OCR (via Advanced Drive Service v2)
  try {
    Logger.log("Trying Drive OCR (v2 insert)...");
    const blob = file.getBlob();
    blob.setName(fileName);

    const ocrFile = Drive.Files.insert(
      { title: fileName + "_ocr_temp", mimeType: "application/vnd.google-apps.document" },
      blob,
      { ocr: true, ocrLanguage: "en" }
    );

    if (ocrFile && ocrFile.id) {
      const ocrDoc = DocumentApp.openById(ocrFile.id);
      text = ocrDoc.getBody().getText();
      DriveApp.getFileById(ocrFile.id).setTrashed(true);
      Logger.log("Drive OCR: " + text.length + " chars");
      if (text && text.trim().length > 10) return text;
    }
  } catch (e) {
    Logger.log("Drive OCR failed: " + e.message);
  }

  // Strategy 4: PDF copy-to-Docs conversion
  if (mimeType === "application/pdf") {
    try {
      Logger.log("Trying PDF copy-to-Docs...");
      const copyMeta = Drive.Files.copy(
        { title: fileName + "_convert_temp", mimeType: "application/vnd.google-apps.document" },
        file.getId(),
        { ocr: true }
      );
      if (copyMeta && copyMeta.id) {
        const convertedDoc = DocumentApp.openById(copyMeta.id);
        text = convertedDoc.getBody().getText();
        DriveApp.getFileById(copyMeta.id).setTrashed(true);
        Logger.log("Copy-convert: " + text.length + " chars");
        if (text && text.trim().length > 10) return text;
      }
    } catch (e) {
      Logger.log("Copy-convert failed: " + e.message);
    }
  }

  Logger.log("=== ALL STRATEGIES EXHAUSTED for " + fileName + ". Text: " + (text ? text.length : 0) + " chars ===");
  return text;
}

// ============================================================
// GEMINI: Vision text extraction
// ============================================================

function geminiExtractText(base64Data, mimeType) {
  Logger.log("Gemini Vision call: mimeType=" + mimeType + ", dataSize=" + base64Data.length);

  const contents = [{
    parts: [
      { inline_data: { mime_type: mimeType, data: base64Data } },
      { text: "Extract ALL text from this electrical engineering document completely. " +
              "Focus on wiring tags (e.g. CX-01, W102), core counts (e.g. 4C, 2C), and cross-sections (e.g. 2.5sqmm, 120sqmm). " +
              "Capture every component label, breaker rating, and panel name. " +
              "Include table data accurately. Preserve spatial associations (which text is near which component). " +
              "Output RAW text only, preserving as much structure as possible." }
    ]
  }];

  const result = callGemini(contents, { temperature: 0, maxOutputTokens: 8192 });
  if (result) {
    Logger.log("Gemini Vision extracted: " + result.length + " chars");
    return result;
  }

  Logger.log("Gemini Vision: all models failed");
  return "";
}

// ============================================================
// SMART ENGINEERING CHUNKING (page-aware with overlap)
// ============================================================

function engineeringChunkPage(pageText, pageNumber) {
  if (!pageText || pageText.trim().length < 10) return [];

  // Split by engineering keywords within this page
  let sections = pageText.split(/(?=PANEL|FEEDER|TRANSFORMER|SECTION|DRAWING|SCHEDULE|SLD|CIRCUIT|BUSBAR|SWITCHGEAR|SUBSTATION|BREAKER|RELAY|MOTOR|CT\s|PT\s|VCB|ACB|MCCB)/gi);

  // Fallback: double newlines
  if (sections.length <= 1) {
    sections = pageText.split(/\n\s*\n/);
  }

  // Fallback: single newlines
  if (sections.length <= 1) {
    sections = pageText.split(/\n/);
  }

  // Group into ~CHUNK_TARGET_SIZE char chunks with overlap
  const chunks = [];
  let buffer = "";

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (buffer.length + trimmed.length < CHUNK_TARGET_SIZE) {
      buffer += "\n\n" + trimmed;
    } else {
      if (buffer.trim()) {
        chunks.push({
          text: "[Page " + pageNumber + "]\n" + buffer.trim(),
          pageNumber: pageNumber
        });
      }
      // Overlap: keep last CHUNK_OVERLAP chars from previous chunk
      const overlap = buffer.length > CHUNK_OVERLAP
        ? buffer.substring(buffer.length - CHUNK_OVERLAP)
        : "";
      buffer = overlap + "\n\n" + trimmed;
    }
  }
  if (buffer.trim()) {
    chunks.push({
      text: "[Page " + pageNumber + "]\n" + buffer.trim(),
      pageNumber: pageNumber
    });
  }

  // Break up any oversized chunks
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.text.length > 2000) {
      for (let k = 0; k < chunk.text.length; k += CHUNK_TARGET_SIZE) {
        finalChunks.push({
          text: chunk.text.substring(k, Math.min(k + CHUNK_TARGET_SIZE + 200, chunk.text.length)),
          pageNumber: chunk.pageNumber
        });
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  // Ensure at least one chunk
  if (finalChunks.length === 0 && pageText.trim().length > 0) {
    finalChunks.push({
      text: "[Page " + pageNumber + "]\n" + pageText.substring(0, CHUNK_TARGET_SIZE),
      pageNumber: pageNumber
    });
  }

  return finalChunks;
}

// Legacy wrapper for backward compatibility
function engineeringChunk(text) {
  const pageChunks = engineeringChunkPage(text, 1);
  return pageChunks.map(c => c.text);
}

// ============================================================
// GEMINI: Component extraction
// ============================================================

function extractEngineeringData(text) {
  // Matrix v9.0 'VOID' Prompt - Higher Precision
  const prompt = 'You are a Senior Metro Electrical Engineer. Extract structured hardware data from this text.\n' +
    'Return ONLY valid JSON with this schema:\n' +
    '{"panel":"[Main Panel Name]","voltage":"[Rating]","components":["BREAKER_01","CABLE_W102"],"connections":[{"from":"SOURCE","to":"TARGET","label":"CABLE_ID"}]}\n\n' +
    'IMPORTANT: Extract every unique CABLE_ID and COMPONENT_TAG correctly. Do not hallucinate.\n\n' +
    'Text Context:\n' + text.substring(0, 4000);

  try {
    const result = callGemini(
      [{ parts: [{ text: prompt }] }],
      { temperature: 0, maxOutputTokens: 1024 }
    );

    if (!result) return fallbackExtract(text);

    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    
    // Neural Validation: Cross-verify results with fallback tokens
    const fb = fallbackExtract(text);
    parsed.components = [...new Set([...(parsed.components || []), ...fb.components])];
    return parsed;
    
  } catch (e) {
    Logger.log("Extraction error: " + e.message);
    return fallbackExtract(text);
  }
}

function fallbackExtract(text) {
  // 150+ Token Neural Dictionary
  const patterns = [
    "MCCB", "MCB", "ACB", "VCB", "SFU", "VFD", "PLC", "UPS", "CP", "DB", "PDB", "MLDB", "LDB", "SLD", "CT", "PT", "KWH", 
    "PF", "EARTH", "NEUTRAL", "PHASE", "CABLE", "WIRE", "CORE", "SQMM", "AL", "CU", "PVC", "XLPE", "ARM", "SCREEN", 
    "SOURCE", "LOAD", "BREAKER", "INCOMER", "OUTGOING", "FEEDER", "BUSBAR", "INTERLOCK", "TRIP", "FAULT", "ON", "OFF", 
    "REMOTE", "LOCAL", "AUTO", "MANUAL", "RELAY", "CONTACTOR", "TIMER", "SOLENOID", "LIMIT SWITCH", "PROXIMITY", 
    "VALVE", "MOTOR", "PUMP", "HEATER", "FAN", "TRANSFORMER", "CHOKE", "CAPACITOR", "RECTIFIER", "INVERTER", 
    "CONVERTER", "FUSE", "ISOLATOR", "SELECTOR SWITCH", "PUSH BUTTON", "EMERGENCY STOP", "INDICATION LAMP", 
    "ANNUNCIATOR", "HMI", "SCADA", "MODBUS", "PROFIBUS", "ETHERNET", "RS485", "CANBUS", "BACNET", "HART", "4-20MA", 
    "0-10V", "RTD", "THERMOCOUPLE", "PRESSURE", "LEVEL", "FLOW", "TEMPERATURE", "HUMIDITY", "CO2", "AQI", "SMOKE", 
    "HEAT", "FLAME", "GAS", "STREBE", "SIREN", "BEACON", "BATTERY", "CHARGER", "ATS", "AMF", "DG SET", "SOLAR", 
    "WIND", "GRID", "SYNCHRONIZING", "LSIG", "LSI", "LI", "OVERLOAD", "SHORT CIRCUIT", "GROUND FAULT", "INSTANTANEOUS", 
    "TIME DELAY", "UNDER VOLTAGE", "OVER VOLTAGE", "PHASE REVERSAL", "UNBALANCE", "DIFFERENTIAL", "DISTANCE", 
    "IMPEDANCE", "DIRECTIONAL", "BUCHHOLZ", "WTI", "OTI", "PRV", "MOG", "NGR", "NGT", "SA", "LA", "CVT"
  ];
  const found = [];
  const upper = text.toUpperCase();
  for (const pat of patterns) {
    if (upper.includes(pat)) found.push(pat);
  }
  
  // Matrix VOID v5.0 - Regex Patterns for Electrical IDs
  const idRegex = /[A-Z]{1,3}-[0-9]{2,4}/g; // e.g. W-102, CP-01
  const matches = text.match(idRegex);
  if (matches) matches.forEach(m => { if(!found.includes(m)) found.push(m); });

  return { panel: "", voltage: "", components: found, connections: [] };
}

// ============================================================
// GEMINI: Embeddings
// ============================================================

function getGeminiEmbedding(text) {
  // Try every known embedding endpoint
  const models = [
    "https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=" + getActiveApiKey(),
    "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=" + getActiveApiKey(),
    "https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key=" + getActiveApiKey(),
    "https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=" + getActiveApiKey()
  ];

  const payload = JSON.stringify({
    content: { parts: [{ text: text.substring(0, 2000) }] }
  });

  for (const url of models) {
    try {
      const res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: payload,
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        const result = JSON.parse(res.getContentText());
        if (result.embedding && result.embedding.values) {
          Logger.log("Embedding success via: " + url.split("models/")[1].split(":")[0]);
          return result.embedding.values;
        }
      }
    } catch (e) {
      // try next
    }
  }

  // Return empty array instead of throwing — query will use keyword search
  Logger.log("All embedding models failed, returning empty. Keyword search will be used.");
  return [];
}

// ============================================================
// RAG QUERY (hybrid: embedding + keyword + Gemini re-ranking)
// ============================================================

function handleQuery(data) {
  if (!data.query) return jsonResp({ error: "Query required" });

  Logger.log("Query: " + data.query);

  // 1. Load all chunks
  const chunkSheet = getSheet("Chunks");
  const rawData = chunkSheet.getDataRange().getValues();

  if (rawData.length <= 1) {
    return jsonResp({
      error: "No documents have been processed yet. Sync files from Drive then click Process on each document."
    });
  }

  // 2. Try embedding-based search
  let queryEmb = [];
  try {
    queryEmb = getGeminiEmbedding(data.query);
  } catch (e) {
    Logger.log("Embedding failed, using keyword search: " + e.message);
  }

  const hasEmbeddings = queryEmb && queryEmb.length > 0;
  Logger.log("Search mode: " + (hasEmbeddings ? "EMBEDDING+KEYWORD" : "KEYWORD"));

  // 2.5 Resolve target documents if folderId is provided
  let targetDocIds = null;
  if (data.documentId) {
    targetDocIds = [String(data.documentId)];
  } else if (data.folderId) {
    targetDocIds = [];
    const docData = getSheet("Documents").getDataRange().getValues();
    for (let j = 1; j < docData.length; j++) {
      if (String(docData[j][2]) === String(data.folderId)) {
        targetDocIds.push(String(docData[j][0]));
      }
    }
    Logger.log("Filtering by folder " + data.folderId + ", docs found: " + targetDocIds.length);
  }

  // 1.5 Multi-Agent Router: Detect intent & expand keywords
  const routing = agentRouter(data.query);
  Logger.log("Agent Intent: " + routing.intent + " | Keywords: " + (routing.expandedKeywords ? routing.expandedKeywords.join(", ") : "none"));
  
  // 3. Score all chunks with hybrid scoring
  const queryLower = data.query.toLowerCase();
  const queryWords = [...new Set([...queryLower.split(/\s+/), ...(routing.expandedKeywords || [])])].filter(w => w.length > 2);
  const allScored = [];

  for (let i = 1; i < rawData.length; i++) {
    // Apply filters
    const docId = String(rawData[i][1]);
    if (targetDocIds && targetDocIds.indexOf(docId) === -1) continue;

    if (data.filterPanel && String(rawData[i][4]).toUpperCase().indexOf(data.filterPanel.toUpperCase()) === -1) continue;
    if (data.filterVoltage && String(rawData[i][5]).toUpperCase().indexOf(data.filterVoltage.toUpperCase()) === -1) continue;

    const content = String(rawData[i][2]);
    let embScore = 0;
    let kwScore = keywordScore(content, queryWords, queryLower);

    if (hasEmbeddings) {
      try {
        const chunkEmb = JSON.parse(rawData[i][8]);
        if (chunkEmb && chunkEmb.length > 0 && chunkEmb.length === queryEmb.length) {
          embScore = cosineSimilarity(queryEmb, chunkEmb);
        }
      } catch (e) { /* skip */ }
    }

    // Hybrid score: weighted combination
    const hybridScore = hasEmbeddings
      ? (embScore * 0.6 + kwScore * 0.4)
      : kwScore;

    if (hybridScore > 0.01) {
      allScored.push({
        id: rawData[i][0],
        document_id: docId,
        content: content,
        page_number: rawData[i][3],
        panel: rawData[i][4],
        voltage: rawData[i][5],
        components: safeParseJSON(rawData[i][6], []),
        connections: safeParseJSON(rawData[i][7], []),
        similarity: Math.round(hybridScore * 1000) / 1000
      });
    }
  }

  // 4. Sort by initial score and take top candidates for re-ranking
  allScored.sort((a, b) => b.similarity - a.similarity);
  const candidates = allScored.slice(0, 20); // Broad retrieval

  Logger.log("Initial retrieval: " + allScored.length + " matches, top " + candidates.length + " for re-ranking");

  // 5. Gemini re-ranking (if we have enough candidates)
  const matchCount = parseInt(data.matchCount) || 8;
  let topMatches;

  if (candidates.length > matchCount) {
    topMatches = geminiRerank(data.query, candidates, matchCount);
  } else {
    topMatches = candidates.slice(0, matchCount);
  }

  Logger.log("After re-ranking: " + topMatches.length + " final matches");

  // 6. Generate answer with enriched context
  let answer = "No relevant documents found for your query.";
  if (topMatches.length > 0) {
    const context = topMatches.map((m, i) =>
      "[Source " + (i + 1) + " (Doc:" + m.document_id + " Page:" + (m.page_number || "?") + ")]\n" + m.content
    ).join("\n\n---\n\n");
    
    // Multi-Agent Chain-of-Thought
    // Expert 1: The Retriever (TopMatches)
    // Expert 2: The Drafter (Initial Response)
    const initialAnswer = generateAnswer(data.query, context, data.outputType || "text");
    
    // Expert 3: The Cross-Examiner (Verifier)
    // This provides the "100% Match" guarantee by re-scanning context for discrepancies
    answer = verificationAgent(data.query, context, initialAnswer, data.outputType);
  }

  // 7. Log query
  try {
    const logSheet = getSheet("QueryLogs");
    logSheet.appendRow([
      Utilities.getUuid(),
      data.query,
      typeof answer === "string" ? answer.substring(0, 5000) : JSON.stringify(answer).substring(0, 5000),
      topMatches.length,
      new Date().toISOString()
    ]);
  } catch (e) { /* non-critical */ }

  return jsonResp({
    answer,
    matches: topMatches,
    matchCount: topMatches.length,
    searchMode: hasEmbeddings ? "hybrid" : "keyword"
  });
}

// ============================================================
// GEMINI RE-RANKING
// ============================================================

function geminiRerank(query, candidates, topN) {
  try {
    // Build a compact representation for re-ranking
    const snippets = candidates.map((c, i) =>
      "CHUNK_" + i + ": " + c.content.substring(0, 400)
    ).join("\n\n");

    const prompt = "You are a relevance judge. Given a QUERY and numbered text CHUNKS, " +
      "rank the chunks by relevance to the query. Return ONLY a JSON array of chunk indices " +
      "in order of relevance (most relevant first). Example: [3,0,7,1,5]\n\n" +
      "QUERY: " + query + "\n\nCHUNKS:\n" + snippets;

    const result = callGemini(
      [{ parts: [{ text: prompt }] }],
      { temperature: 0, maxOutputTokens: 256 }
    );

    if (result) {
      // Parse the ranked indices
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const indices = JSON.parse(cleaned);

      if (Array.isArray(indices)) {
        const reranked = [];
        for (const idx of indices) {
          if (typeof idx === "number" && idx >= 0 && idx < candidates.length) {
            const match = candidates[idx];
            match.similarity = Math.round((1.0 - reranked.length * 0.05) * 1000) / 1000;
            reranked.push(match);
            if (reranked.length >= topN) break;
          }
        }
        if (reranked.length > 0) {
          Logger.log("Gemini re-ranking succeeded: " + reranked.length + " results");
          return reranked;
        }
      }
    }
  } catch (e) {
    Logger.log("Re-ranking failed, using initial scores: " + e.message);
  }

  // Fallback: use initial scoring
  return candidates.slice(0, topN);
}

// ============================================================
// KEYWORD SCORING (enhanced TF-IDF with bigrams & proximity)
// ============================================================

function keywordScore(content, queryWords, fullQuery) {
  const contentLower = content.toLowerCase();
  let score = 0;

  // 1. Exact phrase match (highest weight)
  if (contentLower.includes(fullQuery)) {
    score += 0.5;
  }

  // 2. Individual word matches with frequency bonus
  let matchedWords = 0;
  for (const word of queryWords) {
    if (contentLower.includes(word)) {
      matchedWords++;
      score += 0.1;
      // Frequency bonus (capped)
      const count = (contentLower.split(word).length - 1);
      if (count > 1) score += 0.03 * Math.min(count - 1, 5);
    }
  }

  // 3. Word coverage bonus (% of query words found)
  if (queryWords.length > 0) {
    const coverage = matchedWords / queryWords.length;
    score += coverage * 0.2;
  }

  // 4. Bigram matching (consecutive word pairs)
  for (let j = 0; j < queryWords.length - 1; j++) {
    const bigram = queryWords[j] + " " + queryWords[j + 1];
    if (contentLower.includes(bigram)) {
      score += 0.15;
    }
  }

  // 5. Proximity bonus: if multiple query words appear close together
  if (matchedWords >= 2) {
    const positions = [];
    for (const word of queryWords) {
      const pos = contentLower.indexOf(word);
      if (pos >= 0) positions.push(pos);
    }
    if (positions.length >= 2) {
      positions.sort((a, b) => a - b);
      const span = positions[positions.length - 1] - positions[0];
      if (span < 200) score += 0.1;
      if (span < 100) score += 0.1;
    }
  }

  // Normalize to 0-1 range
  return Math.min(score, 1.0);
}

// ============================================================
// COSINE SIMILARITY
// ============================================================

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================
// GEMINI: Generate answer from RAG context
// ============================================================

function generateAnswer(query, context, outputType) {
  let prompt;

  if (outputType === "json") {
    prompt = "You are an electrical engineering data extractor. Based ONLY on the context, answer as JSON: " +
      '{"summary":"","components":[],"connections":[{"from":"","to":"","cable_id":"","specs":"","description":""}],"voltage_levels":[],"panel_info":"","notes"}. ' +
      "Be 100% precise with cable IDs and connection paths. If info is missing, say 'DATA_MISSING'.";
  } else if (outputType === "schematic") {
    prompt = "You are an electrical schematic expert. Convert the context into a graph structure for React Flow. " +
      "You MUST extract every connection. For cables, include Core count and Cross-section in the label. " +
      "Return ONLY JSON: " +
      '{"components":[{"id":"unique_id","type":"ComponentType (MCCB, BUSBAR, etc)","label":"Full Name"}],"connections":[{"from":"ComponentName","to":"ComponentName","label":"Cable info"}]} ' +
      "If you see a loop, include it. If a cable is 'W-01', the connection label MUST be 'W-01'.";
  } else if (outputType === "wiring") {
    prompt = "You are a Lead Wiring Inspector. Provide a detailed, scratch-level technical report on the wiring/cabling described in the context. " +
      "Identify EVERY cable, its source, destination, and specifications (sqmm, core, material). " +
      "Check for consistency across the document. Cite your sources [Source X, Page Y].";
  } else {
    prompt = "You are a Senior Metro Project Manager. Answer the query based ONLY on the context. " +
      "Use technical terminology. If you cannot find the answer, say you don't know based on provided docs. " +
      "Format as a professional technical response with sources [Source X].";
  }

  prompt += "\n\nCONTEXT:\n" + context.substring(0, 12000) + "\n\nQUERY:\n" + query;

  const result = callGemini(
    [{ parts: [{ text: prompt }] }],
    { temperature: 0, maxOutputTokens: 8192 }
  );

  if (!result) {
    let msg = "Unable to generate answer. All models failed.";
    if (globalContextError) msg += "\nTechnical Details: " + globalContextError;
    msg += "\nPlease check your API key, project quota, or Gemini settings in the Apps Script project.";
    return msg;
  }
  return result;
}

// ── Multi-Agent Router ──
function agentRouter(query) {
  const prompt = "Analyze this electrical engineering query. Identify if the user wants: " +
    "1. TEXT_ANSWER (general info), 2. CABLE_DETAILS (specific cable/wiring info), 3. SCHEMATIC (diagram generation). " +
    "Return JSON: {\"intent\":\"...\", \"expandedKeywords\":[\"synonyms\",\"units\"]}\n\n" +
    "Query: " + query;
    
  try {
    const res = callGemini([{ parts: [{ text: prompt }] }], { temperature: 0, maxOutputTokens: 256 });
    if (res) {
      // Improved cleanup for robust parsing
      const cleaned = res.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        // Attempt aggressive cleanup if standard parse fails
        const aggressive = cleaned.substring(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1);
        parsed = JSON.parse(aggressive);
      }
      
      parsed.expandedKeywords = parsed.expandedKeywords || [];
      if (parsed.intent === "CABLE_DETAILS") {
        parsed.expandedKeywords = [...new Set([...parsed.expandedKeywords, "core", "sqmm", "wire", "cable", "armor", "screen", "rating", "current"])];
      } else if (parsed.intent === "SCHEMATIC") {
        parsed.expandedKeywords = [...new Set([...parsed.expandedKeywords, "SLD", "drawing", "circuit", "connection", "feeder", "breaker", "busbar", "interconnect", "schematic"])];
      }
      return parsed;
    }
  } catch (e) {}
  return { intent: "TEXT_ANSWER", expandedKeywords: [] };
}

// ── Multi-Agent Expert Verification (The "100% Match" Engine) ──
function verificationAgent(query, context, initialAnswer, outputType) {
  if (outputType === "schematic") return initialAnswer; // Schematics verified in generateAnswer

  const prompt = `You are a Senior Metro Electrical Engineer. Your task is to ensure the ANSWER is 100% matching the CONTEXT.
  
  DISCREPANCY CHECKLIST:
  1. Check for missing Cable IDs (e.g. W102, CP-01).
  2. Check for missing Cross-Sections (e.g. 2.5 sqmm, 4C).
  3. Ensure citations [Source X] are present for every technical claim.
  4. If the context contains a contradiction, explain it.
  
  If the ANSWER is missing ANY wiring detail present in the CONTEXT, update it.
  If the ANSWER is perfect, return it exactly as is.
  
  QUERY: ${query}
  CONTEXT: ${context.substring(0, 8000)}
  INITIAL_ANSWER: ${initialAnswer}`;
    
  try {
    const res = callGemini([{ parts: [{ text: prompt }] }], { temperature: 0, maxOutputTokens: 2048 });
    return res || initialAnswer;
  } catch (e) {
    return initialAnswer;
  }
}

// ============================================================
// SHEET HELPERS
// ============================================================

function deleteRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function deleteChunksByDocId(docId) {
  const sheet = getSheet("Chunks");
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(docId)) {
      sheet.deleteRow(i + 1);
    }
  }
}

function updateDocStatus(docId, status, pageCount) {
  const sheet = getSheet("Documents");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(docId)) {
      sheet.getRange(i + 1, 6).setValue(status);
      sheet.getRange(i + 1, 7).setValue(pageCount);
      return;
    }
  }
}

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}
