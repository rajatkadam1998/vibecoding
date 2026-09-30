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