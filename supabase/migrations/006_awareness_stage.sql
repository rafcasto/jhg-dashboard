-- ============================================================
-- Migration 006: Add 'awareness' to lead_stage enum
-- AAARRR = Awareness, Acquisition, Activation, Retention, Referral, Revenue
-- ============================================================

-- PostgreSQL requires ALTER TYPE to add enum values; IF NOT EXISTS is pg14+
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'awareness' BEFORE 'acquisition';
