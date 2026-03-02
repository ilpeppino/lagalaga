/*
 * Fix safe merge function ordering for unique provider constraints.
 *
 * Problem:
 * - merge_provider_shadow_user_into_roblox_user_tx updated target.apple_sub/google_sub
 *   while source row still retained the same unique values, causing 23505.
 *
 * Fix:
 * - Cache source provider values into local vars.
 * - Clear source provider columns first.
 * - Then apply cached provider values to target.
 * - Finally delete source row.
 */

CREATE OR REPLACE FUNCTION public.merge_provider_shadow_user_into_roblox_user_tx(
  p_source_user_id UUID,
  p_roblox_platform_user_id TEXT
)
RETURNS TABLE (
  merged BOOLEAN,
  merged_user_id UUID,
  reason_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id UUID;
  v_source_links_count INT;
  v_source_non_provider_links_count INT;
  v_target_provider_overlap_count INT;
  v_has_source_roblox_link BOOLEAN;
  v_has_target_roblox_link BOOLEAN;
  v_blocking_count BIGINT;

  v_source_apple_sub TEXT;
  v_source_apple_email TEXT;
  v_source_apple_email_is_private BOOLEAN;
  v_source_apple_full_name TEXT;
  v_source_google_sub TEXT;
  v_source_google_email TEXT;
  v_source_google_email_verified BOOLEAN;
  v_source_google_full_name TEXT;
BEGIN
  IF p_source_user_id IS NULL OR p_roblox_platform_user_id IS NULL OR btrim(p_roblox_platform_user_id) = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'INVALID_INPUT';
    RETURN;
  END IF;

  SELECT up.user_id
  INTO v_target_user_id
  FROM public.user_platforms up
  WHERE up.platform_id = 'roblox'
    AND up.platform_user_id = p_roblox_platform_user_id
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'TARGET_ROBLOX_USER_NOT_FOUND';
    RETURN;
  END IF;

  IF v_target_user_id = p_source_user_id THEN
    RETURN QUERY SELECT TRUE, v_target_user_id, 'ALREADY_LINKED';
    RETURN;
  END IF;

  PERFORM 1 FROM public.app_users WHERE id IN (p_source_user_id, v_target_user_id) FOR UPDATE;

  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = p_source_user_id) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_NOT_FOUND';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = v_target_user_id) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'TARGET_NOT_FOUND';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_platforms
    WHERE user_id = p_source_user_id
      AND platform_id = 'roblox'
  )
  INTO v_has_source_roblox_link;

  IF v_has_source_roblox_link THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_ALREADY_HAS_ROBLOX';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_platforms
    WHERE user_id = v_target_user_id
      AND platform_id = 'roblox'
  )
  INTO v_has_target_roblox_link;

  IF NOT v_has_target_roblox_link THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'TARGET_MISSING_ROBLOX';
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_source_links_count
  FROM public.user_platforms
  WHERE user_id = p_source_user_id
    AND platform_id IN ('apple', 'google');

  IF v_source_links_count = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_NO_PROVIDER_LINKS';
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_source_non_provider_links_count
  FROM public.user_platforms
  WHERE user_id = p_source_user_id
    AND platform_id NOT IN ('apple', 'google');

  IF v_source_non_provider_links_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_NON_PROVIDER_LINKS';
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_target_provider_overlap_count
  FROM public.user_platforms source_links
  JOIN public.user_platforms target_links
    ON target_links.user_id = v_target_user_id
   AND target_links.platform_id = source_links.platform_id
  WHERE source_links.user_id = p_source_user_id
    AND source_links.platform_id IN ('apple', 'google');

  IF v_target_provider_overlap_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'TARGET_ALREADY_HAS_PROVIDER_LINK';
    RETURN;
  END IF;

  v_blocking_count := 0;
  SELECT COUNT(*) INTO v_blocking_count FROM public.sessions WHERE host_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.session_participants WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.session_invites WHERE created_by = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.friendships WHERE user_id = p_source_user_id OR friend_id = p_source_user_id OR initiated_by = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.match_results WHERE winner_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.reports WHERE reporter_id = p_source_user_id OR target_user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.user_stats WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.user_rankings WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.user_achievements WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.season_rankings WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.account_deletion_requests WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.roblox_friends_cache WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.roblox_friends_cache_legacy WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;
  SELECT COUNT(*) INTO v_blocking_count FROM public.in_app_notifications WHERE user_id = p_source_user_id;
  IF v_blocking_count > 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'SOURCE_HAS_ACTIVITY'; RETURN; END IF;

  INSERT INTO public.user_push_tokens (
    user_id, expo_push_token, device_id, platform, created_at, last_seen_at
  )
  SELECT
    v_target_user_id, expo_push_token, device_id, platform, created_at, last_seen_at
  FROM public.user_push_tokens
  WHERE user_id = p_source_user_id
  ON CONFLICT (user_id, expo_push_token)
  DO UPDATE SET
    device_id = COALESCE(EXCLUDED.device_id, user_push_tokens.device_id),
    platform = COALESCE(EXCLUDED.platform, user_push_tokens.platform),
    last_seen_at = GREATEST(EXCLUDED.last_seen_at, user_push_tokens.last_seen_at);

  DELETE FROM public.user_push_tokens WHERE user_id = p_source_user_id;

  INSERT INTO public.user_notification_prefs (
    user_id, sessions_reminders_enabled, friend_requests_enabled, created_at, updated_at
  )
  SELECT
    v_target_user_id,
    sessions_reminders_enabled,
    friend_requests_enabled,
    created_at,
    updated_at
  FROM public.user_notification_prefs
  WHERE user_id = p_source_user_id
  ON CONFLICT (user_id) DO NOTHING;

  DELETE FROM public.user_notification_prefs WHERE user_id = p_source_user_id;

  UPDATE public.user_platforms
  SET user_id = v_target_user_id,
      updated_at = NOW()
  WHERE user_id = p_source_user_id
    AND platform_id IN ('apple', 'google');

  SELECT
    apple_sub,
    apple_email,
    apple_email_is_private,
    apple_full_name,
    google_sub,
    google_email,
    google_email_verified,
    google_full_name
  INTO
    v_source_apple_sub,
    v_source_apple_email,
    v_source_apple_email_is_private,
    v_source_apple_full_name,
    v_source_google_sub,
    v_source_google_email,
    v_source_google_email_verified,
    v_source_google_full_name
  FROM public.app_users
  WHERE id = p_source_user_id
  FOR UPDATE;

  UPDATE public.app_users
  SET
    apple_sub = NULL,
    apple_email = NULL,
    apple_email_is_private = NULL,
    apple_full_name = NULL,
    google_sub = NULL,
    google_email = NULL,
    google_email_verified = NULL,
    google_full_name = NULL,
    updated_at = NOW()
  WHERE id = p_source_user_id;

  UPDATE public.app_users target
  SET
    apple_sub = COALESCE(target.apple_sub, v_source_apple_sub),
    apple_email = COALESCE(target.apple_email, v_source_apple_email),
    apple_email_is_private = COALESCE(target.apple_email_is_private, v_source_apple_email_is_private),
    apple_full_name = COALESCE(target.apple_full_name, v_source_apple_full_name),
    google_sub = COALESCE(target.google_sub, v_source_google_sub),
    google_email = COALESCE(target.google_email, v_source_google_email),
    google_email_verified = COALESCE(target.google_email_verified, v_source_google_email_verified),
    google_full_name = COALESCE(target.google_full_name, v_source_google_full_name),
    updated_at = NOW()
  WHERE target.id = v_target_user_id;

  DELETE FROM public.app_users WHERE id = p_source_user_id;

  RETURN QUERY SELECT TRUE, v_target_user_id, 'MERGED';
END;
$$;
