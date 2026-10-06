export type Friend = { id: string; name: string; email: string | null };

/**
 * Scores how well `query` matches `text` (higher is better, 0 = no match):
 * whole-text prefix > word prefix > substring > letters in order ("jhn" → "John").
 */
function score(text: string, query: string): number {
  const t = text.toLowerCase();
  if (t.startsWith(query)) return 4;
  if (t.split(/[\s@._-]+/).some((word) => word.startsWith(query))) return 3;
  if (t.includes(query)) return 2;
  let at = 0;
  for (const ch of t) {
    if (ch === query[at]) at++;
    if (at === query.length) return 1;
  }
  return 0;
}

const same = (a: string | null, b: string | null) =>
  a != null && b != null && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Explains why `person` would duplicate an existing friend (same name or same email),
 * or returns null. `ignoreId` skips the friend being edited.
 */
export function duplicateFriendMessage(
  friends: Friend[],
  person: { name?: string; email?: string | null },
  ignoreId?: string,
): string | null {
  const others = friends.filter((f) => f.id !== ignoreId);
  const byName = person.name != null && others.find((f) => same(f.name, person.name!));
  if (byName) return `You already have a friend named ${byName.name}.`;
  const byEmail = person.email && others.find((f) => same(f.email, person.email!));
  if (byEmail) return `${byEmail.name} already uses ${byEmail.email}.`;
  return null;
}

/** The database's unique-index error (Postgres 23505), for when the list on screen was stale. */
export const isDuplicateError = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";

/** Friends that best match what was typed, best first. Matches name or email. */
export function matchFriends(friends: Friend[], typed: string, limit = 6): Friend[] {
  const query = typed.trim().toLowerCase();
  if (!query) return [];
  return friends
    .map((friend) => ({
      friend,
      // A name match ranks above an equally good email match.
      rank: Math.max(
        score(friend.name, query) * 2,
        friend.email ? score(friend.email, query) * 2 - 1 : 0,
      ),
    }))
    .filter((r) => r.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.friend.name.localeCompare(b.friend.name))
    .slice(0, limit)
    .map((r) => r.friend);
}
