-- Sets up the Tab Split database on a fresh Supabase project.
-- Paste into the Supabase SQL editor and run once. Generated from supabase/migrations/.

-- ===== 20260909150100_c10fab8c-5d8e-4a38-8129-360df476fe1c.sql =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled bill',
  restaurant text,
  bill_date date NOT NULL DEFAULT current_date,
  currency text NOT NULL DEFAULT 'USD',
  tax_cents integer NOT NULL DEFAULT 0,
  tip_cents integer NOT NULL DEFAULT 0,
  share_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bills_share_token_key ON public.bills(share_token);
CREATE INDEX bills_user_id_idx ON public.bills(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bills" ON public.bills FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX participants_bill_id_idx ON public.participants(bill_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own participants" ON public.participants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid()));

CREATE TABLE public.bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0,
  is_shared boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bill_items_bill_id_idx ON public.bill_items(bill_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_items TO authenticated;
GRANT ALL ON public.bill_items TO service_role;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own items" ON public.bill_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid()));

CREATE TABLE public.item_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.bill_items(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, participant_id)
);
CREATE INDEX item_shares_item_id_idx ON public.item_shares(item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_shares TO authenticated;
GRANT ALL ON public.item_shares TO service_role;
ALTER TABLE public.item_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own item shares" ON public.item_shares FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bill_items i JOIN public.bills b ON b.id = i.bill_id WHERE i.id = item_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bill_items i JOIN public.bills b ON b.id = i.bill_id WHERE i.id = item_id AND b.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER bills_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.get_shared_bill(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'bill', jsonb_build_object(
      'id', b.id,
      'title', b.title,
      'restaurant', b.restaurant,
      'bill_date', b.bill_date,
      'currency', b.currency,
      'tax_cents', b.tax_cents,
      'tip_cents', b.tip_cents,
      'owner_name', p.display_name
    ),
    'participants', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'name', pa.name) ORDER BY pa.created_at)
      FROM participants pa WHERE pa.bill_id = b.id), '[]'::jsonb),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'price_cents', i.price_cents, 'is_shared', i.is_shared,
        'participant_ids', COALESCE((SELECT jsonb_agg(s.participant_id) FROM item_shares s WHERE s.item_id = i.id), '[]'::jsonb)
      ) ORDER BY i.position, i.created_at)
      FROM bill_items i WHERE i.bill_id = b.id), '[]'::jsonb)
  )
  FROM bills b
  LEFT JOIN profiles p ON p.id = b.user_id
  WHERE b.share_token = _token;
$$;

REVOKE ALL ON FUNCTION public.get_shared_bill(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_bill(text) TO anon, authenticated, service_role;

-- ===== 20260916120000_bill_guest_read_access.sql =====
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
    WHERE p.bill_id = _bill_id
      AND p.email IS NOT NULL
      AND lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

CREATE INDEX IF NOT EXISTS participants_email_lower_idx ON public.participants (lower(email));

CREATE POLICY "guests read bills" ON public.bills
  FOR SELECT TO authenticated
  USING (public.is_bill_guest(id));

CREATE POLICY "guests read participants" ON public.participants
  FOR SELECT TO authenticated
  USING (public.is_bill_guest(bill_id));

CREATE POLICY "guests read items" ON public.bill_items
  FOR SELECT TO authenticated
  USING (public.is_bill_guest(bill_id));

CREATE POLICY "guests read item shares" ON public.item_shares
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bill_items i
    WHERE i.id = item_shares.item_id AND public.is_bill_guest(i.bill_id)
  ));

-- ===== 20260916130000_payment_requests.sql =====
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

-- ===== 20260916140000_bills_is_draft.sql =====
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- ===== 20261006120000_friends.sql =====
-- Each user's own list of friends, used to fill in people on a bill.
CREATE TABLE public.friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX friends_user_id_idx ON public.friends(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friends TO authenticated;
GRANT ALL ON public.friends TO service_role;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own friends" ON public.friends FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ===== 20261006130000_friends_unique.sql =====
-- No two friends in one user's list may share a name or an email (case-insensitive).
CREATE UNIQUE INDEX friends_user_name_key ON public.friends (user_id, lower(btrim(name)));
CREATE UNIQUE INDEX friends_user_email_key ON public.friends (user_id, lower(btrim(email)))
  WHERE email IS NOT NULL;


-- ===== 20261006140000_scan_usage.sql =====
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


-- ===== 20261006150000_guest_access_excludes_drafts.sql =====
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

