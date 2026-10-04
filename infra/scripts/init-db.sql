-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create test database for integration tests
SELECT 'CREATE DATABASE ai_crm_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ai_crm_test')\gexec
