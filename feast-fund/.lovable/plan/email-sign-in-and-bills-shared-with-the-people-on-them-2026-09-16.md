# Email sign-in, and bills shared with the people on them

## Sign in with email and password

The sign-in page already has email, password and "create account" fields, but email sign-in isn't switched on for the app yet, so it fails. I'll turn it on so:

- Creating an account with an email and password works, with your name saved to your profile.
- New accounts get a confirmation email first, then sign in.
- Google sign-in stays as it is.

Nothing needs to change on the sign-in screen's design.

## Bills you created, and bills you're on

Today a bill is only visible to the person who created it. After this change, when you're signed in you see:

- **Your bills** — the ones you created. Full editing, as now.
- **Shared with you** — bills where someone added you using the email address you signed in with.

A bill someone shared with you opens read-only: the restaurant, date, every item, who ordered what, and your own total highlighted. You can't edit or delete someone else's bill.

Matching is by email address, case-insensitive. If a bill's owner typed a different address for you than the one you signed up with, that bill won't appear — the share link still works for that case. The bills list will say this plainly when the shared section is empty.

## The account you signed up with

People you add to a bill don't need accounts. Adding an email address just means that if they ever sign in with it, the bill shows up for them.

## Technical notes

- Call `enable_email_auth`; leave auto-confirm off (confirmation email flow already handled in `auth.tsx`).
- Migration: a `security definer` helper `public.is_bill_guest(_bill_id uuid)` that checks
  `exists (select 1 from participants where bill_id = _bill_id and lower(email) = lower(auth.jwt() ->> 'email'))`,
  with `search_path = public`, to avoid recursive RLS.
- Add `SELECT`-only policies (`TO authenticated`) on `bills`, `participants`, `bill_items` and `item_shares` using that helper, alongside the existing owner-scoped `ALL` policies. Owner policies unchanged, so guests get read but never write. Existing grants already cover `authenticated`.
- Index `participants (lower(email))` for the lookup.
- `bills.index.tsx`: split the query into owned (`user_id = user.id`) and shared (everything else returned by RLS), render two sections, empty-state copy explaining the email match.
- New read-only route `src/routes/_authenticated/shared.$billId.tsx` reusing `computeSplit` and the layout pieces of the editor without any mutation controls; shared-section links point there. Editor route continues to require ownership and redirects to the read-only view when the signed-in user isn't the owner.
- Regenerate Supabase types after the migration and run a typecheck.
