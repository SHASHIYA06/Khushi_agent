// ============================================================
// MetroCircuit AI Reviewer — Google Apps Script Backend v2.0
// Deploy as Web App: Execute as Me, Access: Anyone
// ============================================================
// SETUP INSTRUCTIONS:
// 1. Create new Apps Script project at script.google.com
// 2. Replace the 4 constants below with your actual values
// 3. Enable "Drive API" in Resources → Advanced Google Services
// 4. Deploy → New Deployment → Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy the deployment URL to your MetroCircuit Settings page
// ============================================================

const GEMINI_API_KEY = "PASTE_YOUR_GEMINI_API_KEY_HERE";
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
const SUPABASE_SERVICE_ROLE_KEY = "PASTE_YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE";
const DRIVE_FOLDER_ID = "PASTE_YOUR_DRIVE_FOLDER_ID_HERE";

// ============================================================
// REQUEST ROUTING (supports both GET and POST)
// ============================================================

function doPost(e) {
  try {
    var data;
    // Handle different content types from frontend
    if (e.postData) {
      data = JSON.parse(e.postData.contents);
    } else {
      return corsResponse({ error: "No data received" });
    }
    return routeAction(data);
  } catch (err) {
    Logger.log("doPost Error: " + err.message);
    return corsResponse({ error: err.message, stack: err.stack });
  }
}

function doGet(e) {
  // Support GET-based calls (fallback for POST redirect issues)
  var params = e.parameter;

  if (params.action) {
    try {
      // For GET requests, action and simple params come as URL params
      var data = {};
      for (var key in params) {
        data[key] = params[key];
      }
      return routeAction(data);
    } catch (err) {
      Logger.log("doGet Error: " + err.message);
      return corsResponse({ error: err.message });
    }
  }

  // Default: health check
  return corsResponse({
    status: "MetroCircuit AI Backend is running",
    version: "2.0",
    timestamp: new Date().toISOString()
  });
}

function routeAction(data) {
  switch (data.action) {
    case "upload": return uploadFile(data);
    case "query": return handleQuery(data);
    case "create_folder": return createFolderAction(data);
    case "delete_folder": return deleteFolderAction(data);
    case "list_folders": return listFolders();
    case "list_documents": return listDocuments(data);
    case "delete_document": return deleteDocumentAction(data);
    case "sync_drive": return syncDriveFiles();
    case "health": return corsResponse({ status: "ok", version: "2.0" });
    default: return corsResponse({ error: "Unknown action: " + data.action });
  }
}

// ============================================================
// CORS-SAFE JSON RESPONSE
// ============================================================

function corsResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// DOCUMENT UPLOAD + PROCESSING
// ============================================================

function uploadFile(data) {
  Logger.log("Upload started: " + data.fileName);

  // Validate required fields
  if (!data.file || !data.fileName) {
    return corsResponse({ error: "Missing file or fileName" });
  }

  try {
    // Step 1: Decode base64 and save to Google Drive
    var blob = Utilities.newBlob(
      Utilities.base64Decode(data.file),
      data.mimeType || "application/pdf",
      data.fileName
    );

    var folder;
    try {
      folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (folderErr) {
      return corsResponse({
        error: "Invalid DRIVE_FOLDER_ID. Make sure it exists and is accessible. ID: " + DRIVE_FOLDER_ID
      });
    }

    var file = folder.createFile(blob);
    var fileId = file.getId();
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    Logger.log("File saved to Drive: " + fileId);

    // Step 2: Register document in Supabase
    var docId = data.documentId || Utilities.getUuid();
    var docInsertResult = supabaseInsert("documents", {
      id: docId,
      name: data.fileName,
      folder_id: data.folderId || null,
      drive_file_id: fileId,
      drive_preview_url: "https://drive.google.com/file/d/" + fileId + "/preview",
      file_type: data.mimeType || "application/pdf",
      file_size: blob.getBytes().length,
      status: "processing"
    });

    Logger.log("Document registered in Supabase: " + JSON.stringify(docInsertResult));

    // Step 3: Extract text from file
    var text = extractTextFromFile(file, data.fileName, fileId);

    if (!text || text.trim().length < 10) {
      supabaseUpdate("documents", docId, { status: "error" });
      return corsResponse({
        status: "error",
        message: "Could not extract text from file. Try uploading a text-based PDF.",
        documentId: docId,
        driveFileId: fileId
      });
    }

    Logger.log("Extracted text length: " + text.length);

    // Step 4: Smart engineering chunking
    var chunks = engineeringChunk(text);
    Logger.log("Created " + chunks.length + " chunks");

    // Step 5: Process each chunk (extract components, embed, store)
    var processedCount = 0;
    for (var i = 0; i < chunks.length; i++) {
      try {
        var extraction = extractEngineeringData(chunks[i]);
        var embedding = getGeminiEmbedding(chunks[i]);

        supabaseInsert("chunks", {
          document_id: docId,
          content: chunks[i],
          page_number: i + 1,
          panel: extraction.panel || "",
          voltage: extraction.voltage || "",
          components: extraction.components || [],
          connections: extraction.connections || [],
          metadata: { chunk_index: i, total_chunks: chunks.length },
          embedding: embedding
        });
        processedCount++;
      } catch (chunkErr) {
        Logger.log("Chunk " + i + " error: " + chunkErr.message);
      }

      // Avoid Apps Script timeout - add small delay every 5 chunks
      if (i > 0 && i % 5 === 0) {
        Utilities.sleep(500);
      }
    }

    // Step 6: Update document status
    supabaseUpdate("documents", docId, {
      status: "indexed",
      page_count: processedCount
    });

    Logger.log("Upload complete: " + processedCount + " chunks indexed");

    return corsResponse({
      status: "indexed",
      documentId: docId,
      driveFileId: fileId,
      drivePreviewUrl: "https://drive.google.com/file/d/" + fileId + "/preview",
      chunksProcessed: processedCount,
      totalChunks: chunks.length
    });

  } catch (err) {
    Logger.log("Upload Error: " + err.message + "\n" + err.stack);
    return corsResponse({ error: "Upload failed: " + err.message });
  }
}

// ============================================================
// TEXT EXTRACTION (multi-strategy)
// ============================================================

function extractTextFromFile(file, fileName, fileId) {
  var text = "";

  // Strategy 1: Direct text extraction (txt, csv)
  if (fileName.match(/\.(txt|csv|text)$/i)) {
    try {
      text = file.getBlob().getDataAsString();
      if (text && text.trim().length > 10) return text;
    } catch (e) {
      Logger.log("Direct text extraction failed: " + e.message);
    }
  }

  // Strategy 2: Google Drive OCR (PDF → Google Doc conversion)
  try {
    var ocrResource = {
      title: fileName + "_ocr_temp",
      mimeType: "application/vnd.google-apps.document",
      parents: [{ id: DRIVE_FOLDER_ID }]
    };

    var ocrFile = Drive.Files.insert(ocrResource, file.getBlob(), {
      ocr: true,
      ocrLanguage: "en"
    });

    if (ocrFile && ocrFile.id) {
      var doc = DocumentApp.openById(ocrFile.id);
      text = doc.getBody().getText();
      // Clean up temp file
      DriveApp.getFileById(ocrFile.id).setTrashed(true);

      if (text && text.trim().length > 10) {
        Logger.log("OCR extraction successful: " + text.length + " chars");
        return text;
      }
    }
  } catch (e) {
    Logger.log("OCR extraction failed: " + e.message);
  }

  // Strategy 3: Use Gemini to extract text from the file content
  try {
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    if (bytes.length < 10 * 1024 * 1024) { // Under 10MB
      var base64Content = Utilities.base64Encode(bytes);
      text = geminiExtractTextFromPDF(base64Content, file.getMimeType());
      if (text && text.trim().length > 10) {
        Logger.log("Gemini text extraction successful");
        return text;
      }
    }
  } catch (e) {
    Logger.log("Gemini extraction failed: " + e.message);
  }

  return text;
}

function geminiExtractTextFromPDF(base64Content, mimeType) {
  var res = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + GEMINI_API_KEY,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType || "application/pdf",
                data: base64Content
              }
            },
            {
              text: "Extract ALL text content from this document. Include every word, number, label, and annotation. Preserve the original structure and formatting as much as possible. Do not summarize."
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
        }
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
  // Split by engineering-relevant boundaries
  var sections = text.split(/(?=PANEL|FEEDER|TRANSFORMER|SECTION|DRAWING|SCHEDULE|SLD|CIRCUIT|BUSBAR|SWITCHGEAR|SUBSTATION)/gi);

  // If no engineering splits found, use paragraph-based chunking
  if (sections.length <= 1) {
    sections = text.split(/\n\s*\n/);
  }

  // Merge small sections and split large ones
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

  // Split any chunk that's still too large
  var finalChunks = [];
  for (var j = 0; j < chunks.length; j++) {
    if (chunks[j].length > 1500) {
      for (var k = 0; k < chunks[j].length; k += 1000) {
        var end = Math.min(k + 1200, chunks[j].length);
        finalChunks.push(chunks[j].substring(k, end));
      }
    } else {
      finalChunks.push(chunks[j]);
    }
  }

  return finalChunks.length > 0 ? finalChunks : [text.substring(0, 1200)];
}

// ============================================================
// GEMINI: COMPONENT + CONNECTION EXTRACTION
// ============================================================

function extractEngineeringData(text) {
  var prompt = 'You are an electrical engineering expert. Extract structured data from this text.\n\n' +
    'Return ONLY valid JSON (no markdown, no code blocks):\n' +
    '{\n' +
    '  "panel": "panel name or empty string",\n' +
    '  "voltage": "voltage level or empty string",\n' +
    '  "components": ["component1", "component2"],\n' +
    '  "connections": [{"from": "component1", "to": "component2"}]\n' +
    '}\n\n' +
    'Recognized components: MCCB, ACB, MCB, RCCB, ELCB, TRANSFORMER, RELAY, CONTACTOR, ' +
    'BUSBAR, CT, PT, VCB, ISOLATOR, FUSE, CAPACITOR, MOTOR, STARTER, PLC, TIMER, ' +
    'SURGE_ARRESTER, EARTH_SWITCH, CABLE, TERMINAL_BLOCK\n\n' +
    'Text:\n' + text.substring(0, 2000);

  try {
    var res = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024
          }
        }),
        muteHttpExceptions: true
      }
    );

    var output = JSON.parse(res.getContentText());

    if (!output.candidates || !output.candidates[0]) {
      Logger.log("Gemini extraction: No candidates returned");
      return fallbackExtraction(text);
    }

    var responseText = output.candidates[0].content.parts[0].text;
    responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    return JSON.parse(responseText);
  } catch (e) {
    Logger.log("Gemini extraction error: " + e.message);
    return fallbackExtraction(text);
  }
}

function fallbackExtraction(text) {
  var patterns = ["MCCB", "ACB", "MCB", "TRANSFORMER", "RELAY", "CONTACTOR",
    "BUSBAR", "CT", "PT", "VCB", "ISOLATOR", "FUSE", "MOTOR", "PLC",
    "CAPACITOR", "STARTER", "CABLE", "TERMINAL"];
  var found = [];
  var upper = text.toUpperCase();
  for (var i = 0; i < patterns.length; i++) {
    if (upper.indexOf(patterns[i]) !== -1) {
      found.push(patterns[i]);
    }
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
    Logger.log("Embedding error: " + JSON.stringify(result));
    throw new Error("Failed to generate embedding");
  }

  return result.embedding.values;
}

// ============================================================
// RAG QUERY
// ============================================================

function handleQuery(data) {
  if (!data.query) {
    return corsResponse({ error: "Query text is required" });
  }

  var queryEmbedding = getGeminiEmbedding(data.query);

  var rpcPayload = {
    query_embedding: queryEmbedding,
    match_count: parseInt(data.matchCount) || 8
  };

  if (data.filterPanel) rpcPayload.filter_panel = data.filterPanel;
  if (data.filterVoltage) rpcPayload.filter_voltage = data.filterVoltage;

  var res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/rpc/match_chunks", {
    method: "post",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(rpcPayload),
    muteHttpExceptions: true
  });

  var matches = JSON.parse(res.getContentText());

  if (!Array.isArray(matches)) {
    Logger.log("Supabase RPC error: " + JSON.stringify(matches));
    return corsResponse({
      error: "Vector search failed. Make sure schema.sql has been run and chunks exist.",
      details: matches
    });
  }

  var context = matches.map(function(m) { return m.content; }).join("\n\n---\n\n");

  var answer = generateStructuredAnswer(data.query, context, data.outputType || "text");

  // Log query (non-blocking)
  try {
    supabaseInsert("query_logs", {
      query: data.query,
      answer: typeof answer === "string" ? answer : JSON.stringify(answer),
      match_count: matches.length
    });
  } catch (e) {
    Logger.log("Query log insert failed: " + e.message);
  }

  return corsResponse({
    answer: answer,
    matches: matches,
    matchCount: matches.length
  });
}

function generateStructuredAnswer(query, context, outputType) {
  var systemPrompt = "";

  if (outputType === "json") {
    systemPrompt = "You are an electrical engineering expert. Based ONLY on the provided context, " +
      "answer the query. Return your answer as structured JSON with fields: " +
      "summary, components (array), connections (array of {from, to}), " +
      "wiring_details (array), voltage_levels (array), panel_info, notes. " +
      "NEVER fabricate data. If info is not in context, say so.";
  } else if (outputType === "wiring") {
    systemPrompt = "You are an electrical wiring expert. Based ONLY on the provided context, " +
      "provide detailed wiring information. Include cable sizes, connections, " +
      "terminal numbers, and routing. Format as a clear list.";
  } else if (outputType === "schematic") {
    systemPrompt = "You are an electrical schematic expert. Based ONLY on the provided context, " +
      "describe the schematic structure. Return JSON with: " +
      '{"components": [{"id": "...", "type": "...", "label": "..."}], ' +
      '"connections": [{"from": "...", "to": "...", "label": "..."}]}. ' +
      "NEVER fabricate components.";
  } else {
    systemPrompt = "You are an electrical engineering expert reviewing metro circuit drawings. " +
      "Based ONLY on the provided context, answer the query accurately. " +
      "Always cite page/panel references. Never fabricate data. " +
      "If information is not available in context, clearly state that.";
  }

  var res = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + GEMINI_API_KEY,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        contents: [{
          parts: [{
            text: systemPrompt + "\n\nCONTEXT:\n" + context + "\n\nQUERY:\n" + query
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096
        }
      }),
      muteHttpExceptions: true
    }
  );

  var result = JSON.parse(res.getContentText());

  if (!result.candidates || !result.candidates[0]) {
    return "Unable to generate answer. The Gemini API returned no response. This may be a quota issue.";
  }

  return result.candidates[0].content.parts[0].text;
}

// ============================================================
// FOLDER MANAGEMENT
// ============================================================

function createFolderAction(data) {
  if (!data.name) {
    return corsResponse({ error: "Folder name is required" });
  }

  var result = supabaseInsert("folders", {
    name: data.name,
    description: data.description || ""
  });
  return corsResponse({ status: "created", folder: result });
}

function deleteFolderAction(data) {
  if (!data.folderId) {
    return corsResponse({ error: "Folder ID is required" });
  }
  supabaseDelete("folders", data.folderId);
  return corsResponse({ status: "deleted" });
}

function listFolders() {
  var res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/folders?order=created_at.desc", {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY
    },
    muteHttpExceptions: true
  });

  var data = JSON.parse(res.getContentText());
  return corsResponse({ folders: Array.isArray(data) ? data : [] });
}

// ============================================================
// DOCUMENT MANAGEMENT
// ============================================================

function listDocuments(data) {
  var url = SUPABASE_URL + "/rest/v1/documents?order=created_at.desc";
  if (data && data.folderId) url += "&folder_id=eq." + data.folderId;

  var res = UrlFetchApp.fetch(url, {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY
    },
    muteHttpExceptions: true
  });

  var docs = JSON.parse(res.getContentText());
  return corsResponse({ documents: Array.isArray(docs) ? docs : [] });
}

function deleteDocumentAction(data) {
  if (!data.documentId) {
    return corsResponse({ error: "Document ID is required" });
  }

  // Delete from Drive if possible
  try {
    if (data.driveFileId) {
      DriveApp.getFileById(data.driveFileId).setTrashed(true);
    }
  } catch (e) {
    Logger.log("Drive delete failed (file may not exist): " + e.message);
  }

  // Delete chunks first, then document
  supabaseDeleteWhere("chunks", "document_id", data.documentId);
  supabaseDelete("documents", data.documentId);
  return corsResponse({ status: "deleted" });
}

// ============================================================
// DRIVE SYNC — Pull files from Drive that aren't in Supabase
// ============================================================

function syncDriveFiles() {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var files = folder.getFiles();
    var synced = [];

    while (files.hasNext()) {
      var file = files.next();
      var fileId = file.getId();

      // Check if already in Supabase
      var existing = supabaseSelect("documents", "drive_file_id=eq." + fileId);
      if (existing && existing.length > 0) continue;

      // Register in Supabase
      var docId = Utilities.getUuid();
      supabaseInsert("documents", {
        id: docId,
        name: file.getName(),
        drive_file_id: fileId,
        drive_preview_url: "https://drive.google.com/file/d/" + fileId + "/preview",
        file_type: file.getMimeType(),
        file_size: file.getSize(),
        status: "uploaded"
      });

      synced.push({ name: file.getName(), id: docId });
    }

    return corsResponse({
      status: "synced",
      newFiles: synced.length,
      files: synced
    });
  } catch (err) {
    return corsResponse({ error: "Drive sync failed: " + err.message });
  }
}

// ============================================================
// SUPABASE HELPERS
// ============================================================

function supabaseInsert(table, data) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/" + table, {
    method: "post",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });

  var responseText = res.getContentText();
  try {
    var parsed = JSON.parse(responseText);
    if (parsed.message || parsed.error) {
      Logger.log("Supabase insert error (" + table + "): " + responseText);
    }
    return parsed;
  } catch (e) {
    Logger.log("Supabase insert parse error: " + responseText);
    return null;
  }
}

function supabaseUpdate(table, id, data) {
  UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/" + table + "?id=eq." + id, {
    method: "patch",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
}

function supabaseDelete(table, id) {
  UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/" + table + "?id=eq." + id, {
    method: "delete",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY
    },
    muteHttpExceptions: true
  });
}

function supabaseDeleteWhere(table, column, value) {
  UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/" + table + "?" + column + "=eq." + value, {
    method: "delete",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY
    },
    muteHttpExceptions: true
  });
}

function supabaseSelect(table, filter) {
  var url = SUPABASE_URL + "/rest/v1/" + table;
  if (filter) url += "?" + filter;

  var res = UrlFetchApp.fetch(url, {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY
    },
    muteHttpExceptions: true
  });

  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    return [];
  }
}
