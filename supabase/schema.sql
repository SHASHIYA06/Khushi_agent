-- ============================================================
-- MetroCircuit AI Reviewer — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- FOLDERS TABLE
-- ============================================================
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- DOCUMENTS TABLE
-- ============================================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  drive_file_id TEXT,
  drive_preview_url TEXT,
  file_type TEXT DEFAULT 'pdf',
  file_size BIGINT DEFAULT 0,
  status TEXT DEFAULT 'uploaded', -- uploaded, processing, indexed, error
  page_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- CHUNKS TABLE (with vector embedding)
-- ============================================================
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  page_number INT DEFAULT 0,
  panel TEXT DEFAULT '',
  voltage TEXT DEFAULT '',
  components JSONB DEFAULT '[]'::jsonb,
  connections JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(768),
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- QUERY LOGS
-- ============================================================
CREATE TABLE query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  answer TEXT,
  match_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- VECTOR SIMILARITY SEARCH RPC
-- ============================================================
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_count INT DEFAULT 5,
  filter_panel TEXT DEFAULT NULL,
  filter_voltage TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  page_number INT,
  panel TEXT,
  voltage TEXT,
  components JSONB,
  connections JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.page_number,
    c.panel,
    c.voltage,
    c.components,
    c.connections,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  WHERE
    (filter_panel IS NULL OR c.panel ILIKE '%' || filter_panel || '%')
    AND (filter_voltage IS NULL OR c.voltage ILIKE '%' || filter_voltage || '%')
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_panel ON chunks(panel);
CREATE INDEX idx_documents_folder ON documents(folder_id);
CREATE INDEX idx_documents_status ON documents(status);
