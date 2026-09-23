# Money requests and payment confirmations

Requests keep working the way they do now: clicking a request opens your own mail app (Outlook) with the message already written and the "To" set to that person's email address. Nothing is sent behind your back, and no sender domain is needed.

## 0. Creating a bill is a deliberate first step

Instead of a new bill being created instantly, "New bill" now opens the bill page in a **draft** state: you enter the title (and optionally restaurant/date) and hit **Create bill**. Only once the bill is saved do the people/items sections and the **Request money** action appear — so you always hit submit before you can request money, and no stray empty bills pile up in your list.

## 1. Send requests when a bill is ready

On the bill page, next to the totals, a new **Send requests** button:

- Opens a panel listing everyone on the bill with their share amount.
- People with an email get a **Send** button that opens your mail app with that person's address in "To" and their itemised share in the body.
- People without an email are listed as "add an email to request from them", with a **Copy message** option so you can paste it into a chat.
- A **Send all** action opens one message per person in turn, so each mail keeps the correct single recipient.
- Once you open a request for someone, the app records "requested" with the date next to their name, so you can tell who you have already chased.

This panel is available on every bill, old ones included — it is just a button on the bill page, not a one-time step after creating a bill. Right after you create a bill it also appears as a prompt once the bill has at least one person with an email.

## 2. Seeing bills you are tagged on

Already in place: the bills page has a "Shared with you" section listing bills where the creator added you with your email address, and those open in a read-only view showing your own share. This plan adds to that view:

- Your share card gains a **Mark as paid** button.
- The bill shows whether the creator has been told yet.

You add yourself to a bill manually when you want your own share counted, as you chose.

## 3. Marking a payment complete

- On a bill shared with you, **Mark as paid** stamps your row as paid and immediately opens your mail app with a short confirmation addressed to the person who created the bill ("I've sent you my share of X — $Y").
- The creator's bill page shows a **Paid** / **Not paid** marker against each person, with the date paid, plus a count like "3 of 5 paid".
- The creator can also flip someone's status themselves (for example, cash on the table).
- Marking paid can be undone.

## Technical notes

- Migration (additive only): `participants.requested_at timestamptz`, `participants.paid_at timestamptz`, `participants.paid_marked_by uuid`; `bills.owner_email text` set on insert and backfilled from `auth.users` so a guest can address the confirmation to the creator.
- Guests must be able to update only their own paid state, so this goes through a `security definer` function `mark_participant_paid(_participant_id uuid, _paid boolean)` that checks the participant's email against the caller's JWT email (or that the caller owns the bill) — no broadened `UPDATE` policy on `participants`.
- `bills.owner_email` is exposed by the existing guest SELECT policy; that is the creator's contact address, which the guest needs to reply to.
- Request/paid message bodies are built from `computeSplit` in `src/lib/split.ts`, reusing the existing mailto body shape from the bill editor, factored into `src/lib/requests.ts` so the editor and the shared view share it.
- Touched files: new `src/lib/requests.ts`; `src/routes/_authenticated/bills.$billId.tsx` (request panel, paid markers, owner toggle); `src/routes/_authenticated/shared.$billId.tsx` (mark as paid + confirmation mail); `src/routes/_authenticated/bills.index.tsx` (paid count on owned bills); regenerate database types.
