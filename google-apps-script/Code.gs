// ============================================================
// MetroCircuit AI — Google Apps Script Backend v4.0 (V8 Runtime)
// 🚀 ZERO EXTERNAL DEPENDENCIES — Google Sheets as Database
// Deploy as Web App: Execute as Me, Access: Anyone
// ============================================================
//
// SETUP:
// 1. Create new Apps Script project at script.google.com
// 2. Paste this entire code
// 3. Set GEMINI_API_KEY and DRIVE_FOLDER_ID below
// 4. Enable "Drive API" v2 in Services (+ icon in sidebar)
// 5. In Project Settings → enable "V8" runtime
// 6. In appsscript.json → ensure "runtimeVersion": "V8"
// 7. Deploy → New Deployment → Web App
//    - Execute as: Me | Access: Anyone
// 8. Copy deployment URL to MetroCircuit Settings page
// 9. Click "Initialize DB" button in Settings
//
// That's it! No Supabase, no external database needed.
// ============================================================

const GEMINI_API_KEY = "PASTE_YOUR_GEMINI_API_KEY_HERE";
const DRIVE_FOLDER_ID = "PASTE_YOUR_DRIVE_FOLDER_ID_HERE";

// Optional: set manually if you already have a database spreadsheet
const SPREADSHEET_ID_OVERRIDE = "";

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
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
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
  if (params.action) {
    try {
      return routeAction(params);
    } catch (err) {
      return jsonResp({ error: err.message });
    }
  }
  return jsonResp({
    status: "MetroCircuit AI Backend v4.0 (V8) is running",
    database: "Google Sheets",
    timestamp: new Date().toISOString()
  });
}

function routeAction(data) {
  switch (data.action) {
    case "init_db":            return initDB();
    case "upload":             return uploadFile(data);
    case "list_documents":     return listDocuments(data);
    case "delete_document":    return deleteDocumentAction(data);
    case "process_document":   return processDocumentAction(data);
    case "create_folder":      return createFolderAction(data);
    case "delete_folder":      return deleteFolderAction(data);
    case "list_folders":       return listFoldersAction();
    case "query":              return handleQuery(data);
    case "sync_drive":         return syncDriveFiles();
    case "health":             return jsonResp({ status: "ok", version: "4.0", db: "sheets", runtime: "V8" });
    default:                   return jsonResp({ error: "Unknown action: " + data.action });
  }
}

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

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
      folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (e) {
      return jsonResp({ error: "Invalid DRIVE_FOLDER_ID. Check your Apps Script config. ID: " + DRIVE_FOLDER_ID });
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
// PROCESS DOCUMENT (for synced files that need chunking)
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
    docSheet.getRange(docRow, 6).setValue("processing");
    SpreadsheetApp.flush();

    // Get the file from Drive
    let file;
    try {
      file = DriveApp.getFileById(doc.drive_file_id);
    } catch (e) {
      updateDocStatus(doc.id, "error", 0);
      return jsonResp({ error: "Drive file not found: " + doc.drive_file_id + ". File may have been deleted." });
    }

    // Extract text
    const text = extractTextFromFile(file, doc.name);

    if (!text || text.trim().length < 10) {
      updateDocStatus(doc.id, "error", 0);
      return jsonResp({
        error: "Could not extract text from '" + doc.name + "' (type: " + doc.file_type + "). " +
               "Check Apps Script Executions log for details. The file may be an image-only PDF or unsupported format."
      });
    }

    Logger.log("Extracted " + text.length + " characters from " + doc.name);

    // Delete old chunks if any
    deleteChunksByDocId(doc.id);

    // Process into chunks
    const result = processTextIntoChunks(doc.id, text);

    // Update status
    updateDocStatus(doc.id, "indexed", result.processed);

    return jsonResp({
      status: "indexed",
      documentId: doc.id,
      chunksProcessed: result.processed,
      totalChunks: result.total,
      textLength: text.length
    });

  } catch (err) {
    Logger.log("Process error: " + err.message + "\n" + err.stack);
    return jsonResp({ error: "Processing failed: " + err.message });
  }
}

// ============================================================
// SHARED: Process text into chunks with embeddings
// ============================================================

function processTextIntoChunks(docId, text) {
  const chunks = engineeringChunk(text);
  Logger.log("Created " + chunks.length + " chunks for doc " + docId);

  const chunkSheet = getSheet("Chunks");
  let processedCount = 0;

  for (let j = 0; j < chunks.length; j++) {
    try {
      const extraction = extractEngineeringData(chunks[j]);

      let embedding;
      try {
        embedding = getGeminiEmbedding(chunks[j]);
      } catch (embErr) {
        Logger.log("Embedding failed for chunk " + j + ": " + embErr.message);
        embedding = []; // Store empty embedding — can re-process later
      }

      chunkSheet.appendRow([
        Utilities.getUuid(),
        docId,
        chunks[j],
        j + 1,
        extraction.panel || "",
        extraction.voltage || "",
        JSON.stringify(extraction.components || []),
        JSON.stringify(extraction.connections || []),
        JSON.stringify(embedding),
        new Date().toISOString()
      ]);
      processedCount++;
    } catch (chunkErr) {
      Logger.log("Chunk " + j + " error: " + chunkErr.message);
    }

    // Rate limiting to avoid Gemini quota issues
    if (j > 0 && j % 2 === 0) Utilities.sleep(1000);
  }

  return { processed: processedCount, total: chunks.length };
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
      folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (e) {
      return jsonResp({
        error: "Cannot open Drive folder. Check DRIVE_FOLDER_ID in Code.gs. Current value: " +
               DRIVE_FOLDER_ID + ". Error: " + e.message
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
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY;
  Logger.log("Gemini Vision call: mimeType=" + mimeType + ", dataSize=" + base64Data.length);

  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: "Extract ALL text from this document completely. Include every word, number, label, heading, table cell, and caption. Preserve the document structure. Do NOT summarize. Output raw text only." }
      ]
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 }
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = res.getResponseCode();
  const raw = res.getContentText();
  Logger.log("Gemini Vision status: " + statusCode);

  if (statusCode !== 200) {
    Logger.log("Gemini Vision ERROR: " + raw.substring(0, 500));
    return "";
  }

  try {
    const result = JSON.parse(raw);
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const extractedText = result.candidates[0].content.parts[0].text;
      Logger.log("Gemini Vision extracted: " + extractedText.length + " chars");
      return extractedText;
    }
    Logger.log("Gemini Vision: no candidates. Response: " + raw.substring(0, 300));
  } catch (e) {
    Logger.log("Gemini Vision parse error: " + e.message);
  }
  return "";
}

// ============================================================
// SMART ENGINEERING CHUNKING
// ============================================================

function engineeringChunk(text) {
  // Try engineering-specific splits first
  let sections = text.split(/(?=PANEL|FEEDER|TRANSFORMER|SECTION|DRAWING|SCHEDULE|SLD|CIRCUIT|BUSBAR|SWITCHGEAR|SUBSTATION)/gi);

  // If no engineering keywords found, split by double newlines
  if (sections.length <= 1) {
    sections = text.split(/\n\s*\n/);
  }

  // If still just one big block, split by single newlines
  if (sections.length <= 1) {
    sections = text.split(/\n/);
  }

  // Group into ~1200 char chunks
  const chunks = [];
  let buffer = "";

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (buffer.length + trimmed.length < 1200) {
      buffer += "\n\n" + trimmed;
    } else {
      if (buffer.trim()) chunks.push(buffer.trim());
      buffer = trimmed;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());

  // Break up any oversized chunks
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length > 1500) {
      for (let k = 0; k < chunk.length; k += 1000) {
        finalChunks.push(chunk.substring(k, Math.min(k + 1200, chunk.length)));
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  // Ensure we always return at least one chunk
  if (finalChunks.length === 0) {
    return [text.substring(0, 1200)];
  }

  Logger.log("Chunking result: " + finalChunks.length + " chunks from " + text.length + " chars");
  return finalChunks;
}

// ============================================================
// GEMINI: Component extraction
// ============================================================

function extractEngineeringData(text) {
  const prompt = 'Extract structured data from this electrical engineering text.\n' +
    'Return ONLY valid JSON:\n' +
    '{"panel":"","voltage":"","components":["MCCB","ACB"],"connections":[{"from":"X","to":"Y"}]}\n\n' +
    'Text:\n' + text.substring(0, 2000);

  try {
    const res = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        }),
        muteHttpExceptions: true
      }
    );

    const statusCode = res.getResponseCode();
    if (statusCode !== 200) {
      Logger.log("Extraction API error: " + statusCode);
      return fallbackExtract(text);
    }

    const output = JSON.parse(res.getContentText());
    if (!output.candidates || !output.candidates[0]) return fallbackExtract(text);

    let t = output.candidates[0].content.parts[0].text;
    t = t.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(t);
  } catch (e) {
    Logger.log("Extraction error: " + e.message);
    return fallbackExtract(text);
  }
}

function fallbackExtract(text) {
  const patterns = ["MCCB", "ACB", "MCB", "TRANSFORMER", "RELAY", "CONTACTOR", "BUSBAR", "CT", "PT", "VCB", "ISOLATOR", "FUSE", "MOTOR", "PLC", "CAPACITOR", "STARTER", "CABLE", "TERMINAL"];
  const found = [];
  const upper = text.toUpperCase();
  for (const pat of patterns) {
    if (upper.includes(pat)) found.push(pat);
  }
  return { panel: "", voltage: "", components: found, connections: [] };
}

// ============================================================
// GEMINI: Embeddings
// ============================================================

function getGeminiEmbedding(text) {
  const res = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=" + GEMINI_API_KEY,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        content: { parts: [{ text: text.substring(0, 2000) }] }
      }),
      muteHttpExceptions: true
    }
  );

  const statusCode = res.getResponseCode();
  const raw = res.getContentText();

  if (statusCode !== 200) {
    Logger.log("Embedding API error (" + statusCode + "): " + raw.substring(0, 300));
    throw new Error("Embedding failed (HTTP " + statusCode + "): " + raw.substring(0, 150));
  }

  const result = JSON.parse(raw);
  if (!result.embedding || !result.embedding.values) {
    throw new Error("Embedding response missing values: " + raw.substring(0, 200));
  }
  return result.embedding.values;
}

// ============================================================
// RAG QUERY (cosine similarity search)
// ============================================================

function handleQuery(data) {
  if (!data.query) return jsonResp({ error: "Query required" });

  Logger.log("Query: " + data.query);

  // 1. Get query embedding
  let queryEmb;
  try {
    queryEmb = getGeminiEmbedding(data.query);
  } catch (e) {
    return jsonResp({ error: "Failed to generate query embedding: " + e.message });
  }

  // 2. Load all chunks
  const chunkSheet = getSheet("Chunks");
  const rawData = chunkSheet.getDataRange().getValues();
  const matches = [];

  for (let i = 1; i < rawData.length; i++) {
    // Apply filters
    if (data.filterPanel && String(rawData[i][4]).toUpperCase().indexOf(data.filterPanel.toUpperCase()) === -1) continue;
    if (data.filterVoltage && String(rawData[i][5]).toUpperCase().indexOf(data.filterVoltage.toUpperCase()) === -1) continue;

    try {
      const chunkEmb = JSON.parse(rawData[i][8]);
      if (!chunkEmb || chunkEmb.length === 0) continue; // Skip empty embeddings

      const similarity = cosineSimilarity(queryEmb, chunkEmb);

      matches.push({
        id: rawData[i][0],
        document_id: rawData[i][1],
        content: rawData[i][2],
        page_number: rawData[i][3],
        panel: rawData[i][4],
        voltage: rawData[i][5],
        components: safeParseJSON(rawData[i][6], []),
        connections: safeParseJSON(rawData[i][7], []),
        similarity
      });
    } catch (e) {
      // Skip chunks with bad embeddings
    }
  }

  // 3. Sort by similarity and take top N
  const matchCount = parseInt(data.matchCount) || 8;
  matches.sort((a, b) => b.similarity - a.similarity);
  const topMatches = matches.slice(0, matchCount);

  // 4. Build context and generate answer
  const context = topMatches.map(m => m.content).join("\n\n---\n\n");
  const answer = generateAnswer(data.query, context, data.outputType || "text");

  // 5. Log query
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
    matchCount: topMatches.length
  });
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
    prompt = "You are an electrical engineering expert. Based ONLY on the context, answer as JSON: " +
      '{summary, components[], connections[{from,to}], voltage_levels[], panel_info, notes}. ';
  } else if (outputType === "schematic") {
    prompt = "You are an electrical schematic expert. Based ONLY on the context, return JSON: " +
      '{"components":[{"id":"...","type":"...","label":"..."}],"connections":[{"from":"...","to":"...","label":"..."}]}. ';
  } else {
    prompt = "You are an electrical engineering expert reviewing metro circuit drawings. " +
      "Answer based ONLY on the context. Cite page/panel references. Never fabricate data. ";
  }

  prompt += "\n\nCONTEXT:\n" + context.substring(0, 10000) + "\n\nQUERY:\n" + query;

  const res = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
      }),
      muteHttpExceptions: true
    }
  );

  const statusCode = res.getResponseCode();
  if (statusCode !== 200) {
    Logger.log("Answer generation error: " + statusCode + " " + res.getContentText().substring(0, 300));
    return "Unable to generate answer. API returned HTTP " + statusCode;
  }

  const result = JSON.parse(res.getContentText());
  if (!result.candidates || !result.candidates[0]) {
    return "Unable to generate answer. No candidates in response.";
  }
  return result.candidates[0].content.parts[0].text;
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
