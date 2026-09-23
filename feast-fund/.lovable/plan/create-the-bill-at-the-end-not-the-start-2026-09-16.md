# Create the bill at the end, not the start

Right now "New bill" sends you to a separate little form before you can do anything. That page goes away. You go straight into the bill, do the real work — scan the receipt, add people, tag the dishes — and the **Create bill** button sits at the bottom, at the end of the flow.

## How it will work

1. Tap **New bill** on your bills list. You land directly on the bill screen (no form page).
2. The bill starts as a draft: title, restaurant, date, receipt scan, people, items and tagging are all editable, exactly as they are today.
3. At the bottom of the screen there is a single prominent **Create bill** button.
4. Requesting money stays hidden until you tap it. Instead, a short line explains: add your people and items, then create the bill to request money.
5. Tapping **Create bill** saves the bill for real. The request-money panel, the paid/not-paid markers and the share link appear right below, in place of the button.
6. Until then, the draft shows on your bills list marked **Draft**, so an abandoned draft is easy to spot and delete. Opening it again drops you back where you were, with **Create bill** still waiting at the bottom.
7. Bills you already created are unaffected — they open as finished bills, with request and paid features available as they are now.

## Technical notes

- Migration (additive): add `bills.is_draft boolean not null default false`; new rows created from the "New bill" button set `is_draft = true`, so existing bills stay finished. Regenerate database types after.
- Delete `src/routes/_authenticated/bills.new.tsx`; the route tree regenerates itself.
- `bills.index.tsx`: `New bill` goes back to inserting a bill row (`title: "New bill"`, `owner_email`, `is_draft: true`) and navigating to `/bills/$billId`. Owned-bill rows show a "Draft" badge when `is_draft`; paid counts render only for non-drafts.
- `bills.$billId.tsx`: read `is_draft` into the `Bill` type. When draft, hide the request-money panel, the per-person paid markers and the share-link block, and render a sticky-bottom `Create bill` action that runs `update({ is_draft: false })` then invalidates the bill query. Title stays inline-editable as today; if left as "New bill" on create, keep it (no blocking validation) but show the title field focused at the top.
- No change to `src/lib/requests.ts`, `src/lib/split.ts`, `shared.$billId.tsx`, or the `mark_participant_paid` function.
