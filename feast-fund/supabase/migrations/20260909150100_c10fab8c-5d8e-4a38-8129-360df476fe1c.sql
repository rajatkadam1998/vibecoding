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