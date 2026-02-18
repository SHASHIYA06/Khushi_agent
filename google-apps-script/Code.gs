// ============================================================
// MetroCircuit AI Reviewer — Google Apps Script Backend
// Deploy as Web App: Execute as Me, Access: Anyone
// ============================================================

const GEMINI_API_KEY = "PASTE_YOUR_GEMINI_API_KEY_HERE";
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
const SUPABASE_SERVICE_ROLE_KEY = "PASTE_YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE";
const DRIVE_FOLDER_ID = "PASTE_YOUR_DRIVE_FOLDER_ID_HERE";

// ============================================================
// ROUTING
// ============================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    switch (data.action) {
      case "upload": return uploadFile(data);
      case "query": return handleQuery(data);
      case "create_folder": return createFolder(data);
      case "delete_folder": return deleteFolder(data);
      case "list_folders": return listFolders();
      case "list_documents": return listDocuments(data);
      case "delete_document": return deleteDocument(data);
      default: return jsonResponse({ error: "Unknown action" });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doGet(e) {
  return jsonResponse({ status: "MetroCircuit AI Backend is running" });
}

// ============================================================
// DOCUMENT UPLOAD + PROCESSING
// ============================================================

function uploadFile(data) {
  // Decode base64 file and save to Drive
  const blob = Utilities.newBlob(
    Utilities.base64Decode(data.file),
    data.mimeType,
    data.fileName
  );

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const file = folder.createFile(blob);
  const fileId = file.getId();

  // Register document in Supabase
  const docId = data.documentId || Utilities.getUuid();
  supabaseInsert("documents", {
    id: docId,
    name: data.fileName,
    folder_id: data.folderId || null,
    drive_file_id: fileId,
    drive_preview_url: "https://drive.google.com/file/d/" + fileId + "/preview",
    file_type: data.mimeType,
    file_size: blob.getBytes().length,
    status: "processing"
  });

  // Extract text from the file
  let text = "";
  try {
    text = file.getBlob().getDataAsString();
  } catch (e) {
    // For non-text files (scanned PDFs), try OCR via Drive
    try {
      const ocrFile = Drive.Files.copy(
        { title: data.fileName + "_ocr", mimeType: "application/vnd.google-apps.document" },
        fileId,
        { ocr: true }
      );
      const doc = DocumentApp.openById(ocrFile.id);
      text = doc.getBody().getText();
      DriveApp.getFileById(ocrFile.id).setTrashed(true);
    } catch (e2) {
      text = "Unable to extract text from this file.";
    }
  }

  if (!text || text.trim().length < 10) {
    supabaseUpdate("documents", docId, { status: "error" });
    return jsonResponse({ status: "error", message: "Could not extract text" });
  }

  // Smart engineering chunking
  const chunks = engineeringChunk(text);

  // Process each chunk
  chunks.forEach(function(chunkText, index) {
    try {
      // Extract electrical components and connections via Gemini
      const extraction = extractEngineeringData(chunkText);

      // Generate embedding
      const embedding = getGeminiEmbedding(chunkText);

      // Save chunk to Supabase
      supabaseInsert("chunks", {
        document_id: docId,
        content: chunkText,
        page_number: index + 1,
        panel: extraction.panel || "",
        voltage: extraction.voltage || "",
        components: extraction.components || [],
        connections: extraction.connections || [],
        metadata: { chunk_index: index, total_chunks: chunks.length },
        embedding: embedding
      });
    } catch (chunkErr) {
      Logger.log("Chunk " + index + " error: " + chunkErr.message);
    }
  });

  // Update document status
  supabaseUpdate("documents", docId, {
    status: "indexed",
    page_count: chunks.length
  });

  return jsonResponse({
    status: "indexed",
    documentId: docId,
    driveFileId: fileId,
    chunksProcessed: chunks.length
  });
}

// ============================================================
// SMART ENGINEERING CHUNKING
// ============================================================

function engineeringChunk(text) {
  // Split by engineering-relevant boundaries
  var sections = text.split(/(?=PANEL|FEEDER|TRANSFORMER|SECTION|DRAWING|SCHEDULE|SLD|CIRCUIT|BUSBAR)/gi);

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
      // Split with overlap
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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + GEMINI_API_KEY,
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
    var responseText = output.candidates[0].content.parts[0].text;

    // Clean markdown code blocks if present
    responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    return JSON.parse(responseText);
  } catch (e) {
    // Fallback: pattern-based detection
    return {
      panel: "",
      voltage: "",
      components: detectComponentsBasic(text),
      connections: []
    };
  }
}

function detectComponentsBasic(text) {
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
  return found;
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
  return result.embedding.values;
}

// ============================================================
// RAG QUERY
// ============================================================

function handleQuery(data) {
  var queryEmbedding = getGeminiEmbedding(data.query);

  // Vector similarity search via Supabase RPC
  var rpcPayload = {
    query_embedding: queryEmbedding,
    match_count: data.matchCount || 8
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
  var context = matches.map(function(m) { return m.content; }).join("\n\n---\n\n");

  // Generate answer with structured prompting
  var answer = generateStructuredAnswer(data.query, context, data.outputType || "text");

  // Log query
  supabaseInsert("query_logs", {
    query: data.query,
    answer: typeof answer === "string" ? answer : JSON.stringify(answer),
    match_count: matches.length
  });

  return jsonResponse({
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
      "terminal numbers, and routing. Format as a clear table/list.";
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
  return result.candidates[0].content.parts[0].text;
}

// ============================================================
// FOLDER MANAGEMENT
// ============================================================

function createFolder(data) {
  var folder = supabaseInsert("folders", {
    name: data.name,
    description: data.description || ""
  });
  return jsonResponse({ status: "created", folder: folder });
}

function deleteFolder(data) {
  supabaseDelete("folders", data.folderId);
  return jsonResponse({ status: "deleted" });
}

function listFolders() {
  var res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/folders?order=created_at.desc", {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY
    }
  });
  return jsonResponse({ folders: JSON.parse(res.getContentText()) });
}

// ============================================================
// DOCUMENT MANAGEMENT
// ============================================================

function listDocuments(data) {
  var url = SUPABASE_URL + "/rest/v1/documents?order=created_at.desc";
  if (data.folderId) url += "&folder_id=eq." + data.folderId;

  var res = UrlFetchApp.fetch(url, {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY
    }
  });
  return jsonResponse({ documents: JSON.parse(res.getContentText()) });
}

function deleteDocument(data) {
  // Delete from Drive if possible
  try {
    if (data.driveFileId) {
      DriveApp.getFileById(data.driveFileId).setTrashed(true);
    }
  } catch (e) {}

  // Delete from Supabase (cascades to chunks)
  supabaseDelete("documents", data.documentId);
  return jsonResponse({ status: "deleted" });
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
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
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

// ============================================================
// RESPONSE HELPER
// ============================================================

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
