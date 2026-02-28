/*
 * Add Apple as a supported auth platform identity.
 */

INSERT INTO public.platforms (id, name, icon_url, deep_link_scheme)
VALUES ('apple', 'Apple', NULL, NULL)
ON CONFLICT (id) DO NOTHING;
