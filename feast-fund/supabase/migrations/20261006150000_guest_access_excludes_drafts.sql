-- Tagged people (guests) only get access once the owner has created the bill,
-- not while it is still a draft. All "guests read …" policies go through this check.
CREATE OR REPLACE FUNCTION public.is_bill_guest(_bill_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM participants p
    JOIN bills b ON b.id = p.bill_id
    WHERE p.bill_id = _bill_id
      AND NOT b.is_draft
      AND p.email IS NOT NULL
      AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Guests can't mark themselves paid on a draft either; the owner still can.
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
    OR (
      _email IS NOT NULL
      AND _email = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND EXISTS (SELECT 1 FROM bills b WHERE b.id = _bill_id AND NOT b.is_draft)
    )
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
