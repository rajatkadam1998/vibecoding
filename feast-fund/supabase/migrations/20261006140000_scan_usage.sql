-- Caps receipt scans (paid Claude API calls) per user per rolling 24 hours.
CREATE TABLE public.scan_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scan_usage_user_time_idx ON public.scan_usage(user_id, created_at);
-- No policies and no grants: users can't read or write rows directly,
-- only through use_scan_credit() below.
ALTER TABLE public.scan_usage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.scan_usage TO service_role;

-- Records one scan for the signed-in user if they are under the limit.
-- Returns true when the scan may go ahead, false when the limit is reached.
CREATE OR REPLACE FUNCTION public.use_scan_credit(_daily_limit integer DEFAULT 20)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _limit integer := LEAST(GREATEST(_daily_limit, 0), 20);
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  -- Serialise concurrent calls for the same user so parallel scans can't overshoot.
  PERFORM pg_advisory_xact_lock(hashtext(_uid::text));
  IF (SELECT count(*) FROM scan_usage
      WHERE user_id = _uid AND created_at > now() - interval '24 hours') >= _limit THEN
    RETURN false;
  END IF;
  INSERT INTO scan_usage (user_id) VALUES (_uid);
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.use_scan_credit(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_scan_credit(integer) TO authenticated;
