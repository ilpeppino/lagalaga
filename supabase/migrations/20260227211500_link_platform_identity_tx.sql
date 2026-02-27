/*
 * Transaction-safe platform linking helper.
 * Enforces deterministic linking with conflict detection under race conditions.
 */

CREATE OR REPLACE FUNCTION public.link_platform_to_user_tx(
  p_user_id UUID,
  p_platform_id TEXT,
  p_platform_user_id TEXT,
  p_platform_username TEXT DEFAULT NULL,
  p_platform_display_name TEXT DEFAULT NULL,
  p_platform_avatar_url TEXT DEFAULT NULL,
  p_roblox_profile_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  linked_user_id UUID,
  conflict_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_user_id UUID;
BEGIN
  SELECT user_id
    INTO v_existing_user_id
    FROM public.user_platforms
   WHERE platform_id = p_platform_id
     AND platform_user_id = p_platform_user_id
   LIMIT 1;

  IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> p_user_id THEN
    RETURN QUERY SELECT p_user_id, v_existing_user_id;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.user_platforms (
      user_id,
      platform_id,
      platform_user_id,
      platform_username,
      platform_display_name,
      platform_avatar_url,
      verified_at,
      updated_at
    )
    VALUES (
      p_user_id,
      p_platform_id,
      p_platform_user_id,
      p_platform_username,
      p_platform_display_name,
      p_platform_avatar_url,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, platform_id)
    DO UPDATE SET
      platform_user_id = EXCLUDED.platform_user_id,
      platform_username = EXCLUDED.platform_username,
      platform_display_name = EXCLUDED.platform_display_name,
      platform_avatar_url = EXCLUDED.platform_avatar_url,
      verified_at = EXCLUDED.verified_at,
      updated_at = NOW();
  EXCEPTION
    WHEN unique_violation THEN
      SELECT user_id
        INTO v_existing_user_id
        FROM public.user_platforms
       WHERE platform_id = p_platform_id
         AND platform_user_id = p_platform_user_id
       LIMIT 1;

      IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> p_user_id THEN
        RETURN QUERY SELECT p_user_id, v_existing_user_id;
        RETURN;
      END IF;
  END;

  IF p_platform_id = 'roblox' THEN
    UPDATE public.app_users
       SET roblox_user_id = p_platform_user_id,
           roblox_username = p_platform_username,
           roblox_display_name = COALESCE(p_platform_display_name, roblox_display_name),
           roblox_profile_url = COALESCE(p_roblox_profile_url, roblox_profile_url),
           updated_at = NOW()
     WHERE id = p_user_id;
  END IF;

  RETURN QUERY SELECT p_user_id, NULL::UUID;
END;
$$;

COMMENT ON FUNCTION public.link_platform_to_user_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Links a platform identity to a user atomically. Returns conflict_user_id when identity belongs to another account.';
