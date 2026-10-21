-- Venmo payment requests.
-- Friends: optional Venmo username and mobile number (only the owner can read their friends).
ALTER TABLE public.friends
  ADD COLUMN venmo_username text,
  ADD COLUMN mobile_number  text,
  ADD CONSTRAINT friends_venmo_format  CHECK (venmo_username IS NULL OR venmo_username ~ '^[A-Za-z0-9_-]{5,30}$'),
  ADD CONSTRAINT friends_mobile_format CHECK (mobile_number  IS NULL OR mobile_number  ~ '^\+?[0-9]{7,15}$');

-- The bill owner's own Venmo username, used in "pay me" links (profiles are private to each user).
ALTER TABLE public.profiles
  ADD COLUMN venmo_username text,
  ADD CONSTRAINT profiles_venmo_format CHECK (venmo_username IS NULL OR venmo_username ~ '^[A-Za-z0-9_-]{5,30}$');

-- Set only when the owner clicks "Mark Venmo request sent"; opening Venmo never sets it.
ALTER TABLE public.participants
  ADD COLUMN venmo_requested_at timestamptz;
