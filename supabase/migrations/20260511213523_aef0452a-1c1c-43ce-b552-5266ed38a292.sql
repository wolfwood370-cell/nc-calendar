-- Revoke EXECUTE on all SECURITY DEFINER helpers from public/anon.
-- These functions are intended for use inside RLS policies and triggers only,
-- never as a public API surface.
REVOKE EXECUTE ON FUNCTION public.prevent_coach_id_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;