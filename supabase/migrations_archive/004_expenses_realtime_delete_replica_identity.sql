-- Migration 004: Enable full replica identity for expenses realtime DELETE payloads.
--
-- Purpose:
-- Supabase Realtime DELETE events need OLD row data so the frontend can remove
-- deleted expenses from tenant-scoped state without a full reload.
--
-- This does not change table columns, data, RLS policies, or app behavior
-- outside logical replication payloads.

alter table public.expenses replica identity full;
