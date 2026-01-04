-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to execute raw SQL (for admin operations)
CREATE OR REPLACE FUNCTION execute_sql(sql_query TEXT, sql_params JSONB DEFAULT '[]')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Execute the query (simplified version - in production you'd want more security)
    EXECUTE sql_query INTO result;
    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION vector_search(
    table_name TEXT,
    embedding_column TEXT,
    query_embedding vector(3072),
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 10
)
RETURNS TABLE(
    id TEXT,
    content TEXT,
    similarity FLOAT,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Knowledge chunks search
    IF table_name = 'knowledge_chunks' THEN
        RETURN QUERY
        SELECT 
            kc.id::TEXT,
            kc.content,
            1 - (kc.embedding <=> query_embedding) AS similarity,
            kc.metadata
        FROM knowledge_chunks kc
        WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
        ORDER BY kc.embedding <=> query_embedding
        LIMIT match_count;
    
    -- Document chunks search
    ELSIF table_name = 'document_chunks' THEN
        RETURN QUERY
        SELECT 
            dc.id::TEXT,
            dc.content,
            1 - (dc.embedding <=> query_embedding) AS similarity,
            dc.metadata
        FROM document_chunks dc
        WHERE dc.embedding IS NOT NULL 
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
        ORDER BY dc.embedding <=> query_embedding
        LIMIT match_count;
    
    -- Combined search across both tables
    ELSIF table_name = 'all_chunks' THEN
        RETURN QUERY
        (
            SELECT 
                kc.id::TEXT,
                kc.content,
                1 - (kc.embedding <=> query_embedding) AS similarity,
                kc.metadata
            FROM knowledge_chunks kc
            WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
            
            UNION ALL
            
            SELECT 
                dc.id::TEXT,
                dc.content,
                1 - (dc.embedding <=> query_embedding) AS similarity,
                dc.metadata
            FROM document_chunks dc
            WHERE dc.embedding IS NOT NULL 
            AND 1 - (dc.embedding <=> query_embedding) > match_threshold
        )
        ORDER BY similarity DESC
        LIMIT match_count;
    END IF;
    
    RETURN;
END;
$$;

-- Function for hybrid search (BM25 + vector)
CREATE OR REPLACE FUNCTION hybrid_search(
    query_text TEXT,
    query_embedding vector(3072),
    alpha FLOAT DEFAULT 0.6,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 10
)
RETURNS TABLE(
    id TEXT,
    content TEXT,
    similarity FLOAT,
    bm25_score FLOAT,
    hybrid_score FLOAT,
    metadata JSONB,
    source_table TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH vector_scores AS (
        -- Vector similarity scores from knowledge chunks
        SELECT 
            kc.id::TEXT,
            kc.content,
            1 - (kc.embedding <=> query_embedding) AS similarity,
            kc.metadata,
            'knowledge_chunks' AS source_table
        FROM knowledge_chunks kc
        WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
        
        UNION ALL
        
        -- Vector similarity scores from document chunks
        SELECT 
            dc.id::TEXT,
            dc.content,
            1 - (dc.embedding <=> query_embedding) AS similarity,
            dc.metadata,
            'document_chunks' AS source_table
        FROM document_chunks dc
        WHERE dc.embedding IS NOT NULL 
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ),
    text_scores AS (
        -- Text search scores (simplified BM25 using built-in FTS)
        SELECT 
            vs.id,
            vs.content,
            vs.similarity,
            vs.metadata,
            vs.source_table,
            -- Simple text matching score (in real implementation, use proper BM25)
            CASE 
                WHEN vs.content ILIKE '%' || query_text || '%' THEN 1.0
                ELSE 0.0
            END AS bm25_score
        FROM vector_scores vs
    )
    SELECT 
        ts.id,
        ts.content,
        ts.similarity,
        ts.bm25_score,
        -- Hybrid score: weighted combination of vector and text scores
        (alpha * ts.similarity + (1 - alpha) * ts.bm25_score) AS hybrid_score,
        ts.metadata,
        ts.source_table
    FROM text_scores ts
    ORDER BY hybrid_score DESC
    LIMIT match_count;
END;
$$;

-- Function to get embedding statistics
CREATE OR REPLACE FUNCTION embedding_stats()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    knowledge_count INT;
    document_count INT;
    total_embeddings INT;
    result JSONB;
BEGIN
    -- Count embeddings in knowledge chunks
    SELECT COUNT(*) INTO knowledge_count 
    FROM knowledge_chunks 
    WHERE embedding IS NOT NULL;
    
    -- Count embeddings in document chunks
    SELECT COUNT(*) INTO document_count 
    FROM document_chunks 
    WHERE embedding IS NOT NULL;
    
    total_embeddings := knowledge_count + document_count;
    
    result := jsonb_build_object(
        'knowledge_chunks_with_embeddings', knowledge_count,
        'document_chunks_with_embeddings', document_count,
        'total_embeddings', total_embeddings,
        'generated_at', NOW()
    );
    
    RETURN result;
END;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx 
ON knowledge_chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
ON document_chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Text search indexes for hybrid search
CREATE INDEX IF NOT EXISTS knowledge_chunks_content_gin_idx 
ON knowledge_chunks 
USING gin(to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS document_chunks_content_gin_idx 
ON document_chunks 
USING gin(to_tsvector('english', content));

-- Metadata indexes for filtering
CREATE INDEX IF NOT EXISTS knowledge_chunks_metadata_gin_idx 
ON knowledge_chunks 
USING gin(metadata);

CREATE INDEX IF NOT EXISTS document_chunks_metadata_gin_idx 
ON document_chunks 
USING gin(metadata);