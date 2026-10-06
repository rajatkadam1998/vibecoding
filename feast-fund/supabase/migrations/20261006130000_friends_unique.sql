-- No two friends in one user's list may share a name or an email (case-insensitive).
CREATE UNIQUE INDEX friends_user_name_key ON public.friends (user_id, lower(btrim(name)));
CREATE UNIQUE INDEX friends_user_email_key ON public.friends (user_id, lower(btrim(email)))
  WHERE email IS NOT NULL;
