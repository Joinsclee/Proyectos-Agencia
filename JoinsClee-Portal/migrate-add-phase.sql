-- ============================================
-- Migración: Agregar columnas phase y task_group a tasks
-- Ejecutar en el SQL Editor de Supabase ANTES de seed-speedlaunch.sql
-- ============================================

-- Agregar columna phase (nombre de la fase: "Fase 0 - Análisis y Diagnóstico", etc.)
ALTER TABLE portal.tasks ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT '';

-- Agregar columna task_group (grupo de tarea dentro de la fase: "Métricas", "Inv. Competencia", etc.)
ALTER TABLE portal.tasks ADD COLUMN IF NOT EXISTS task_group TEXT DEFAULT '';
