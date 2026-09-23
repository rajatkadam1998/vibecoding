# Test plan: who can see which bills

## What I'm checking

Two real accounts: **kadamrajat8@gmail.com** (bill creator) and **rajatkadamiitb@gmail.com** (the person tagged on the bill).

### Check 1 — a bill belongs only to its creator

1. Sign in as kadamrajat8@gmail.com, create a bill with an item, no people added, and finish it.
2. Sign in as rajatkadamiitb@gmail.com and open the bills page.
3. Expected: that bill appears nowhere — not under "Your bills", not under "Shared with you".

### Check 2 — a tagged person sees it as shared

1. As kadamrajat8@gmail.com, create a bill: add a couple of items, add a person with the email rajatkadamiitb@gmail.com, tag items to them, then press "Create bill".
2. Expected for kadamrajat8@gmail.com: the bill is listed under "Your bills" and is fully editable.
3. Sign in as rajatkadamiitb@gmail.com.
4. Expected: the same bill is listed under "Shared with you", opens read-only with their own total shown, and is not in their "Your bills".
5. Also confirm they cannot change it (no editing controls, and a direct attempt to edit is refused).

## How I run it

Both accounts are driven through the real app in a browser, clicking the same buttons a person would, with screenshots at each step. I also read the stored data directly to confirm the permission rules block cross-account access rather than the screen merely hiding it.

## Cleanup

Test bills created during the run are deleted afterwards, so your bills list is left as it was.

## Reporting

For each of the two checks: pass or fail, what each account actually saw, and — if anything fails — the cause and the fix.
