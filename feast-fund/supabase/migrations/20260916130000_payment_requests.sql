ALTER TABLE public.participants
  ADD COLUMN requested_at timestamptz,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN paid_marked_by uuid;

ALTER TABLE public.bills
  ADD COLUMN owner_email text;

UPDATE public.bills b
SET owner_email = u.email
FROM auth.users u
WHERE u.id = b.user_id AND b.owner_email IS NULL;

CREATE OR REPLACE FUNCTION public.mark_participant_paid(_participant_id uuid, _paid boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bill_id uuid;
  _email text;
BEGIN
  SELECT p.bill_id, lower(p.email) INTO _bill_id, _email
  FROM participants p WHERE p.id = _participant_id;
  IF _bill_id IS NULL THEN RETURN false; END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM bills b WHERE b.id = _bill_id AND b.user_id = auth.uid())
    OR (_email IS NOT NULL AND _email = lower(coalesce(auth.jwt() ->> 'email', '')))
  ) THEN
    RETURN false;
  END IF;

  UPDATE participants
  SET paid_at = CASE WHEN _paid THEN now() ELSE NULL END,
      paid_marked_by = CASE WHEN _paid THEN auth.uid() ELSE NULL END
  WHERE id = _participant_id;
  RETURN true;
END;
$function$;