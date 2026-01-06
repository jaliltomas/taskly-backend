-- PostgreSQL Database Initialization Script
-- Requires pgvector extension

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create IVFFlat index for fast similarity search (run after adding products)
-- CREATE INDEX IF NOT EXISTS idx_products_embedding ON products_unique 
-- USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Insert default categories
INSERT INTO categories (name, markup_retail, markup_reseller, is_fixed_amount) VALUES
    ('iPhone', 0.15, 0.05, FALSE),
    ('iPhone Usado', 0.12, 0.04, FALSE),
    ('Samsung', 0.15, 0.05, FALSE),
    ('Samsung Usado', 0.12, 0.04, FALSE),
    ('Motorola', 0.15, 0.05, FALSE),
    ('Xiaomi', 0.15, 0.05, FALSE),
    ('Apple Watch', 0.15, 0.05, FALSE),
    ('iPad', 0.15, 0.05, FALSE),
    ('MacBook', 0.12, 0.04, FALSE),
    ('AirPods', 0.15, 0.05, FALSE),
    ('Accesorios', 0.25, 0.10, FALSE),
    ('Otros', 0.15, 0.05, FALSE)
ON CONFLICT (name) DO NOTHING;
