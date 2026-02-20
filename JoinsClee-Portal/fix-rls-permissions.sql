-- ============================================
-- Fix: Permitir lectura publica (anon) en las tablas del portal
-- y permitir INSERT en task_comments para comentarios de clientes.
-- Ejecutar en SQL Editor de Supabase.
-- ============================================

-- Deshabilitar RLS en las tablas del portal
ALTER TABLE portal.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE portal.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE portal.tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE portal.milestones DISABLE ROW LEVEL SECURITY;
ALTER TABLE portal.task_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE portal.project_templates DISABLE ROW LEVEL SECURITY;

-- Permisos de lectura para anon en todo el schema
GRANT USAGE ON SCHEMA portal TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA portal TO anon;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA portal TO anon;

-- Permiso de escritura para anon SOLO en task_comments (comentarios de clientes)
GRANT INSERT ON portal.task_comments TO anon;
