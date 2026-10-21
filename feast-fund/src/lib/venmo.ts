import type { Friend } from "@/lib/friends";

/** Same rules as the database checks on friends/profiles. */
const VENMO_USERNAME = /^[A-Za-z0-9_-]{5,30}$/;
const MOBILE = /^\+?[0-9]{7,15}$/;

type Normalized = { value: string | null; error: string | null };

/** "@Priya-Shah " → "Priya-Shah". Empty input means "no username". */
export function normalizeVenmoUsername(input: string | null | undefined): Normalized {
  const value = (input ?? "").trim().replace(/^@+/, "");
  if (!value) return { value: null, error: null };
  if (!VENMO_USERNAME.test(value)) {
    return { value: null, error: "Venmo usernames are 5–30 letters, numbers, - or _." };
  }
  return { value, error: null };
}

/** "+1 (917) 555-0100" → "+19175550100". Keeps a leading + and never changes the country code. */
export function normalizeMobile(input: string | null | undefined): Normalized {
  const raw = (input ?? "").trim();
  if (!raw) return { value: null, error: null };
  const value = (raw.startsWith("+") ? "+" : "") + raw.replace(/\D/g, "");
  if (!MOBILE.test(value)) {
    return { value: null, error: "Mobile numbers need 7–15 digits (a leading + is fine)." };
  }
  return { value, error: null };
}

export type VenmoRecipient = { id: string; kind: "username" | "mobile" };

/** Venmo username first, then mobile number. */
export function venmoRecipient(
  friend: Pick<Friend, "venmo_username" | "mobile_number"> | null | undefined,
): VenmoRecipient | null {
  if (friend?.venmo_username) return { id: friend.venmo_username, kind: "username" };
  if (friend?.mobile_number) return { id: friend.mobile_number, kind: "mobile" };
  return null;
}

/** "Meal at Le Bain on Sep 30, 2026" (bill title when there's no restaurant). */
export function venmoNote(bill: { restaurant: string | null; title: string; bill_date: string }) {
  const place = bill.restaurant?.trim() || bill.title.trim() || "dinner";
  // bill_date is a plain YYYY-MM-DD; read it as a local date so it doesn't shift by timezone.
  const date = new Date(`${bill.bill_date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Meal at ${place} on ${date}`;
}

const amount = (cents: number) => (cents / 100).toFixed(2);

function venmoUrl(txn: "charge" | "pay", recipient: string, cents: number, note: string) {
  return (
    `https://venmo.com/?txn=${txn}` +
    `&recipients=${encodeURIComponent(recipient)}` +
    `&amount=${encodeURIComponent(amount(cents))}` +
    `&note=${encodeURIComponent(note)}`
  );
}

/** You request money from them (opens in your browser). */
export const venmoChargeUrl = (theirId: string, cents: number, note: string) =>
  venmoUrl("charge", theirId, cents, note);

/** They pay you (link inside the request email). */
export const venmoPayUrl = (yourUsername: string, cents: number, note: string) =>
  venmoUrl("pay", yourUsername, cents, note);

/** Bill people are copies of name/email, so match them back to a saved friend: email first, then name. */
export function findFriendForParticipant(
  participant: { name: string; email: string | null },
  friends: Friend[],
): Friend | null {
  const email = participant.email?.trim().toLowerCase();
  if (email) {
    const byEmail = friends.find((f) => f.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = participant.name.trim().toLowerCase();
  return friends.find((f) => f.name.trim().toLowerCase() === name) ?? null;
}
