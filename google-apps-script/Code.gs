// ============================================================
// MetroCircuit AI Reviewer — Google Apps Script Backend v3.0
// 🚀 ZERO EXTERNAL DEPENDENCIES — Google Sheets as Database
// Deploy as Web App: Execute as Me, Access: Anyone
// ============================================================
//
// SETUP:
// 1. Create new Apps Script project at script.google.com
// 2. Paste this entire code
// 3. Set GEMINI_API_KEY and DRIVE_FOLDER_ID below
// 4. Enable "Drive API" in Services (+ icon in sidebar)
// 5. Deploy → New Deployment → Web App
//    - Execute as: Me | Access: Anyone
// 6. Copy deployment URL to MetroCircuit Settings page
// 7. Click "Initialize DB" button in Settings — auto-creates
//    a Google Sheet with all required tabs
//
// That's it! No Supabase, no external database needed.
// ============================================================

var GEMINI_API_KEY = "PASTE_YOUR_GEMINI_API_KEY_HERE";
var DRIVE_FOLDER_ID = "PASTE_YOUR_DRIVE_FOLDER_ID_HERE";

// The spreadsheet ID is auto-created and stored in Script Properties.
// You can also set it manually if you want to use an existing sheet.
var SPREADSHEET_ID = "";

// ============================================================
// INTERNAL: Get or create the database spreadsheet
// ============================================================

function getDB() {
  // Check manual override
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  // Check stored ID
  var props = PropertiesService.getScriptProperties();
  var storedId = props.getProperty("DB_SPREADSHEET_ID");

  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (e) {
      Logger.log("Stored spreadsheet not found, creating new one");
    }
  }

  // Create new database spreadsheet
  var ss = SpreadsheetApp.create("MetroCircuit AI Database");

  // Move to Drive folder if possible
  try {
    var file = DriveApp.getFileById(ss.getId());
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {
    Logger.log("Could not move DB to folder: " + e.message);
  }

  // Create sheets
  var docSheet = ss.getActiveSheet();
  docSheet.setName("Documents");
  docSheet.getRange(1, 1, 1, 8).setValues([[
    "id", "name", "folder_id", "drive_file_id", "file_type", "status", "page_count", "created_at"
  ]]);

  var chunkSheet = ss.insertSheet("Chunks");
  chunkSheet.getRange(1, 1, 1, 10).setValues([[
    "id", "document_id", "content", "page_number", "panel", "voltage", "components", "connections", "embedding", "created_at"
  ]]);

  var folderSheet = ss.insertSheet("Folders");
  folderSheet.getRange(1, 1, 1, 4).setValues([[
    "id", "name", "description", "created_at"
  ]]);

  var querySheet = ss.insertSheet("QueryLogs");
  querySheet.getRange(1, 1, 1, 5).setValues([[
    "id", "query", "answer", "match_count", "created_at"
  ]]);

  // Store the ID
  props.setProperty("DB_SPREADSHEET_ID", ss.getId());
  Logger.log("Created database spreadsheet: " + ss.getId());

  return ss;
}

function getSheet(name) {
  var db = getDB();
  var sheet = db.getSheetByName(name);
  if (!sheet) {
    // Create missing sheet
    sheet = db.insertSheet(name);
    if (name === "Documents") {
      sheet.getRange(1, 1, 1, 8).setValues([["id", "name", "folder_id", "drive_file_id", "file_type", "status", "page_count", "created_at"]]);
    } else if (name === "Chunks") {
      sheet.getRange(1, 1, 1, 10).setValues([["id", "document_id", "content", "page_number", "panel", "voltage", "components", "connections", "embedding", "created_at"]]);
    } else if (name === "Folders") {
      sheet.getRange(1, 1, 1, 4).setValues([["id", "name", "description", "created_at"]]);
    } else if (name === "QueryLogs") {
      sheet.getRange(1, 1, 1, 5).setValues([["id", "query", "answer", "match_count", "created_at"]]);
    }
  }
  return sheet;
}

// ============================================================
// REQUEST ROUTING
// ============================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    return routeAction(data);
  } catch (err) {
    Logger.log("doPost Error: " + err.message + "\n" + err.stack);
    return jsonResp({ error: err.message });
  }
}

function doGet(e) {
  var params = e.parameter || {};
  if (params.action) {
    try {
      return routeAction(params);
    } catch (err) {
      return jsonResp({ error: err.message });
    }
  }
  return jsonResp({
    status: "MetroCircuit AI Backend v3.0 is running",
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
    case "health":             return jsonResp({ status: "ok", version: "3.0", db: "sheets" });
    default:                   return jsonResp({ error: "Unknown action: " + data.action });
  }
}

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// PROCESS DOCUMENT (for synced files that need chunking)
// ============================================================

function processDocumentAction(data) {
  if (!data.documentId) return jsonResp({ error: "Document ID required" });

  try {
    // Find document in sheet
    var docSheet = getSheet("Documents");
    var docData = docSheet.getDataRange().getValues();
    var docRow = -1;
    var doc = null;

    for (var i = 1; i < docData.length; i++) {
      if (docData[i][0] === data.documentId) {
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

    if (!doc) return jsonResp({ error: "Document not found" });
    if (!doc.drive_file_id) return jsonResp({ error: "No Drive file linked" });

    // Update status to processing
    docSheet.getRange(docRow, 6).setValue("processing");

    // Get the file from Drive
    var file = DriveApp.getFileById(doc.drive_file_id);

    // Extract text
    var text = extractTextFromFile(file, doc.name);

    if (!text || text.trim().length < 10) {
      updateDocStatus(doc.id, "error", 0);
      return jsonResp({ status: "error", message: "Could not extract text from file" });
    }

    Logger.log("Extracted " + text.length + " characters from " + doc.name);

    // Delete old chunks if any
    deleteChunksByDocId(doc.id);

    // Chunk the text
    var chunks = engineeringChunk(text);
    Logger.log("Created " + chunks.length + " chunks");

    // Process each chunk
    var chunkSheet = getSheet("Chunks");
    var processedCount = 0;

    for (var j = 0; j < chunks.length; j++) {
      try {
        var extraction = extractEngineeringData(chunks[j]);
        var embedding = getGeminiEmbedding(chunks[j]);

        chunkSheet.appendRow([
          Utilities.getUuid(),
          doc.id,
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

      // Avoid timeout
      if (j > 0 && j % 3 === 0) Utilities.sleep(500);
    }

    // Update status
    updateDocStatus(doc.id, "indexed", processedCount);

    return jsonResp({
      status: "indexed",
      documentId: doc.id,
      chunksProcessed: processedCount,
      totalChunks: chunks.length,
      textLength: text.length
    });

  } catch (err) {
    Logger.log("Process error: " + err.message + "\n" + err.stack);
    return jsonResp({ error: "Processing failed: " + err.message });
  }
}

// ============================================================
// INIT DATABASE
// ============================================================

function initDB() {
  try {
    var db = getDB();
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

  var sheet = getSheet("Folders");
  var id = Utilities.getUuid();
  var now = new Date().toISOString();

  sheet.appendRow([id, data.name, data.description || "", now]);

  return jsonResp({
    status: "created",
    folder: { id: id, name: data.name, description: data.description || "", created_at: now }
  });
}

function deleteFolderAction(data) {
  if (!data.folderId) return jsonResp({ error: "Folder ID required" });

  var sheet = getSheet("Folders");
  deleteRowById(sheet, data.folderId);

  // Also delete documents in this folder
  var docSheet = getSheet("Documents");
  var docData = docSheet.getDataRange().getValues();
  for (var i = docData.length - 1; i >= 1; i--) {
    if (docData[i][2] === data.folderId) {
      // Delete chunks for this document
      deleteChunksByDocId(docData[i][0]);
      docSheet.deleteRow(i + 1);
    }
  }

  return jsonResp({ status: "deleted" });
}

function listFoldersAction() {
  var sheet = getSheet("Folders");
  var data = sheet.getDataRange().getValues();
  var folders = [];

  for (var i = 1; i < data.length; i++) {
    folders.push({
      id: data[i][0],
      name: data[i][1],
      description: data[i][2],
      created_at: data[i][3]
    });
  }

  // Sort by created_at descending
  folders.sort(function(a, b) {
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return jsonResp({ folders: folders });
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
    var blob = Utilities.newBlob(
      Utilities.base64Decode(data.file),
      data.mimeType || "application/pdf",
      data.fileName
    );

    var folder;
    try {
      folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (e) {
      return jsonResp({ error: "Invalid DRIVE_FOLDER_ID: " + DRIVE_FOLDER_ID });
    }

    var file = folder.createFile(blob);
    var fileId = file.getId();

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log("Could not set sharing: " + e.message);
    }

    // 2. Register document in Google Sheets
    var docId = data.documentId || Utilities.getUuid();
    var docSheet = getSheet("Documents");
    var now = new Date().toISOString();

    docSheet.appendRow([
      docId,
      data.fileName,
      data.folderId || "",
      fileId,
      data.mimeType || "application/pdf",
      "processing",
      0,
      now
    ]);

    Logger.log("Document registered: " + docId);

    // 3. Extract text
    var text = extractTextFromFile(file, data.fileName);

    if (!text || text.trim().length < 10) {
      updateDocStatus(docId, "error", 0);
      return jsonResp({
        status: "error",
        message: "Could not extract text from file",
        documentId: docId,
        driveFileId: fileId
      });
    }

    Logger.log("Extracted " + text.length + " characters");

    // 4. Chunk the text
    var chunks = engineeringChunk(text);
    Logger.log("Created " + chunks.length + " chunks");

    // 5. Process each chunk
    var chunkSheet = getSheet("Chunks");
    var processedCount = 0;

    for (var i = 0; i < chunks.length; i++) {
      try {
        var extraction = extractEngineeringData(chunks[i]);
        var embedding = getGeminiEmbedding(chunks[i]);

        chunkSheet.appendRow([
          Utilities.getUuid(),
          docId,
          chunks[i],
          i + 1,
          extraction.panel || "",
          extraction.voltage || "",
          JSON.stringify(extraction.components || []),
          JSON.stringify(extraction.connections || []),
          JSON.stringify(embedding),
          new Date().toISOString()
        ]);
        processedCount++;
      } catch (chunkErr) {
        Logger.log("Chunk " + i + " error: " + chunkErr.message);
      }

      // Avoid timeout
      if (i > 0 && i % 3 === 0) Utilities.sleep(500);
    }

    // 6. Update status
    updateDocStatus(docId, "indexed", processedCount);

    return jsonResp({
      status: "indexed",
      documentId: docId,
      driveFileId: fileId,
      drivePreviewUrl: "https://drive.google.com/file/d/" + fileId + "/preview",
      chunksProcessed: processedCount,
      totalChunks: chunks.length
    });

  } catch (err) {
    Logger.log("Upload Error: " + err.message + "\n" + err.stack);
    return jsonResp({ error: "Upload failed: " + err.message });
  }
}

// ============================================================
// DOCUMENT LISTING & MANAGEMENT
// ============================================================

function listDocuments(data) {
  var sheet = getSheet("Documents");
  var rawData = sheet.getDataRange().getValues();
  var documents = [];

  for (var i = 1; i < rawData.length; i++) {
    var doc = {
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

  // Sort by created_at descending
  documents.sort(function(a, b) {
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return jsonResp({ documents: documents });
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
  var sheet = getSheet("Documents");
  deleteRowById(sheet, data.documentId);

  return jsonResp({ status: "deleted" });
}

// ============================================================
// DRIVE SYNC
// ============================================================

function syncDriveFiles() {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var files = folder.getFiles();
    var synced = [];

    // Get existing drive file IDs
    var docSheet = getSheet("Documents");
    var docData = docSheet.getDataRange().getValues();
    var existingDriveIds = {};
    for (var i = 1; i < docData.length; i++) {
      existingDriveIds[docData[i][3]] = true;
    }

    while (files.hasNext()) {
      var file = files.next();
      var fileId = file.getId();

      if (existingDriveIds[fileId]) continue;

      // Skip the database spreadsheet itself
      if (file.getMimeType() === "application/vnd.google-apps.spreadsheet") continue;

      var docId = Utilities.getUuid();
      var now = new Date().toISOString();

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

      synced.push({ name: file.getName(), id: docId });
    }

    return jsonResp({
      status: "synced",
      newFiles: synced.length,
      files: synced
    });
  } catch (err) {
    return jsonResp({ error: "Drive sync failed: " + err.message });
  }
}

// ============================================================
// TEXT EXTRACTION (multi-strategy)
// ============================================================

function extractTextFromFile(file, fileName) {
  var text = "";

  // Strategy 1: Direct text (txt, csv)
  if (fileName.match(/\.(txt|csv|text)$/i)) {
    try {
      text = file.getBlob().getDataAsString();
      if (text && text.trim().length > 10) return text;
    } catch (e) {}
  }

  // Strategy 2: Google Drive OCR
  try {
    var ocrFile = Drive.Files.insert(
      {
        title: fileName + "_ocr_temp",
        mimeType: "application/vnd.google-apps.document"
      },
      file.getBlob(),
      { ocr: true, ocrLanguage: "en" }
    );

    if (ocrFile && ocrFile.id) {
      var doc = DocumentApp.openById(ocrFile.id);
      text = doc.getBody().getText();
      DriveApp.getFileById(ocrFile.id).setTrashed(true);
      if (text && text.trim().length > 10) return text;
    }
  } catch (e) {
    Logger.log("OCR failed: " + e.message);
  }

  // Strategy 3: Gemini Vision for PDFs/images
  try {
    var bytes = file.getBlob().getBytes();
    if (bytes.length < 10 * 1024 * 1024) {
      text = geminiExtractText(Utilities.base64Encode(bytes), file.getMimeType());
      if (text && text.trim().length > 10) return text;
    }
  } catch (e) {
    Logger.log("Gemini extract failed: " + e.message);
  }

  return text;
}

function geminiExtractText(base64Data, mimeType) {
  var res = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: "Extract ALL text from this document. Include every word, number, label. Preserve structure. Do not summarize." }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      }),
      muteHttpExceptions: true
    }
  );

  var result = JSON.parse(res.getContentText());
  if (result.candidates && result.candidates[0]) {
    return result.candidates[0].content.parts[0].text;
  }
  return "";
}

// ============================================================
// SMART ENGINEERING CHUNKING
// ============================================================

function engineeringChunk(text) {
  var sections = text.split(/(?=PANEL|FEEDER|TRANSFORMER|SECTION|DRAWING|SCHEDULE|SLD|CIRCUIT|BUSBAR|SWITCHGEAR|SUBSTATION)/gi);

  if (sections.length <= 1) {
    sections = text.split(/\n\s*\n/);
  }

  var chunks = [];
  var buffer = "";

  for (var i = 0; i < sections.length; i++) {
    var section = sections[i].trim();
    if (!section) continue;
    if (buffer.length + section.length < 1200) {
      buffer += "\n\n" + section;
    } else {
      if (buffer.trim()) chunks.push(buffer.trim());
      buffer = section;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());

  var finalChunks = [];
  for (var j = 0; j < chunks.length; j++) {
    if (chunks[j].length > 1500) {
      for (var k = 0; k < chunks[j].length; k += 1000) {
        finalChunks.push(chunks[j].substring(k, Math.min(k + 1200, chunks[j].length)));
      }
    } else {
      finalChunks.push(chunks[j]);
    }
  }

  return finalChunks.length > 0 ? finalChunks : [text.substring(0, 1200)];
}

// ============================================================
// GEMINI: COMPONENT EXTRACTION
// ============================================================

function extractEngineeringData(text) {
  var prompt = 'Extract structured data from this electrical engineering text.\n' +
    'Return ONLY valid JSON:\n' +
    '{"panel":"","voltage":"","components":["MCCB","ACB"],"connections":[{"from":"X","to":"Y"}]}\n\n' +
    'Text:\n' + text.substring(0, 2000);

  try {
    var res = UrlFetchApp.fetch(
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

    var output = JSON.parse(res.getContentText());
    if (!output.candidates || !output.candidates[0]) return fallbackExtract(text);
    var t = output.candidates[0].content.parts[0].text;
    t = t.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(t);
  } catch (e) {
    return fallbackExtract(text);
  }
}

function fallbackExtract(text) {
  var patterns = ["MCCB","ACB","MCB","TRANSFORMER","RELAY","CONTACTOR","BUSBAR","CT","PT","VCB","ISOLATOR","FUSE","MOTOR","PLC","CAPACITOR","STARTER","CABLE","TERMINAL"];
  var found = [];
  var upper = text.toUpperCase();
  for (var i = 0; i < patterns.length; i++) {
    if (upper.indexOf(patterns[i]) !== -1) found.push(patterns[i]);
  }
  return { panel: "", voltage: "", components: found, connections: [] };
}

// ============================================================
// GEMINI: EMBEDDINGS
// ============================================================

function getGeminiEmbedding(text) {
  var res = UrlFetchApp.fetch(
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

  var result = JSON.parse(res.getContentText());
  if (!result.embedding || !result.embedding.values) {
    throw new Error("Embedding failed: " + JSON.stringify(result).substring(0, 200));
  }
  return result.embedding.values;
}

// ============================================================
// RAG QUERY (with cosine similarity in Apps Script)
// ============================================================

function handleQuery(data) {
  if (!data.query) return jsonResp({ error: "Query required" });

  Logger.log("Query: " + data.query);

  // 1. Get query embedding
  var queryEmb = getGeminiEmbedding(data.query);

  // 2. Load all chunks from Sheets
  var chunkSheet = getSheet("Chunks");
  var rawData = chunkSheet.getDataRange().getValues();
  var matches = [];

  for (var i = 1; i < rawData.length; i++) {
    // Apply filters
    if (data.filterPanel && rawData[i][4].toString().toUpperCase().indexOf(data.filterPanel.toUpperCase()) === -1) continue;
    if (data.filterVoltage && rawData[i][5].toString().toUpperCase().indexOf(data.filterVoltage.toUpperCase()) === -1) continue;

    try {
      var chunkEmb = JSON.parse(rawData[i][8]);
      var similarity = cosineSimilarity(queryEmb, chunkEmb);

      matches.push({
        id: rawData[i][0],
        document_id: rawData[i][1],
        content: rawData[i][2],
        page_number: rawData[i][3],
        panel: rawData[i][4],
        voltage: rawData[i][5],
        components: JSON.parse(rawData[i][6] || "[]"),
        connections: JSON.parse(rawData[i][7] || "[]"),
        similarity: similarity
      });
    } catch (e) {
      // Skip chunks with bad embeddings
    }
  }

  // 3. Sort by similarity and take top N
  var matchCount = parseInt(data.matchCount) || 8;
  matches.sort(function(a, b) { return b.similarity - a.similarity; });
  matches = matches.slice(0, matchCount);

  // 4. Build context and generate answer
  var context = matches.map(function(m) { return m.content; }).join("\n\n---\n\n");
  var answer = generateAnswer(data.query, context, data.outputType || "text");

  // 5. Log query
  try {
    var logSheet = getSheet("QueryLogs");
    logSheet.appendRow([
      Utilities.getUuid(),
      data.query,
      typeof answer === "string" ? answer.substring(0, 5000) : JSON.stringify(answer).substring(0, 5000),
      matches.length,
      new Date().toISOString()
    ]);
  } catch (e) {}

  return jsonResp({
    answer: answer,
    matches: matches,
    matchCount: matches.length
  });
}

// ============================================================
// COSINE SIMILARITY
// ============================================================

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  var dot = 0, normA = 0, normB = 0;
  for (var i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  var denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================
// GEMINI: GENERATE ANSWER
// ============================================================

function generateAnswer(query, context, outputType) {
  var prompt = "";

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

  var res = UrlFetchApp.fetch(
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

  var result = JSON.parse(res.getContentText());
  if (!result.candidates || !result.candidates[0]) {
    return "Unable to generate answer. Check your Gemini API key quota.";
  }
  return result.candidates[0].content.parts[0].text;
}

// ============================================================
// SHEET HELPERS
// ============================================================

function deleteRowById(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function deleteChunksByDocId(docId) {
  var sheet = getSheet("Chunks");
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === docId) {
      sheet.deleteRow(i + 1);
    }
  }
}

function updateDocStatus(docId, status, pageCount) {
  var sheet = getSheet("Documents");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === docId) {
      sheet.getRange(i + 1, 6).setValue(status);
      sheet.getRange(i + 1, 7).setValue(pageCount);
      return;
    }
  }
}
