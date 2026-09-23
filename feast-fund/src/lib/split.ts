export type SplitParticipant = { id: string; name: string; email?: string | null };

export type SplitItem = {
  id: string;
  name: string;
  price_cents: number;
  is_shared: boolean;
  participant_ids: string[];
};

export type PersonTotal = {
  participantId: string;
  name: string;
  email?: string | null;
  itemsCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  lines: { name: string; cents: number; shared: boolean; ways: number }[];
};

export type SplitResult = {
  people: PersonTotal[];
  subtotalCents: number;
  unassignedCents: number;
  grandTotalCents: number;
};

export function computeSplit(
  items: SplitItem[],
  participants: SplitParticipant[],
  taxCents: number,
  tipCents: number,
): SplitResult {
  const people: PersonTotal[] = participants.map((p) => ({
    participantId: p.id,
    name: p.name,
    email: p.email ?? null,
    itemsCents: 0,
    taxCents: 0,
    tipCents: 0,
    totalCents: 0,
    lines: [],
  }));
  const byId = new Map(people.map((p) => [p.participantId, p]));

  let subtotalCents = 0;
  let unassignedCents = 0;

  for (const item of items) {
    subtotalCents += item.price_cents;
    const ids = item.participant_ids.filter((id) => byId.has(id));
    if (ids.length === 0) {
      unassignedCents += item.price_cents;
      continue;
    }
    // Split evenly, distributing remainder cents to the first people.
    const base = Math.floor(item.price_cents / ids.length);
    const remainder = item.price_cents - base * ids.length;
    ids.forEach((id, index) => {
      const share = base + (index < remainder ? 1 : 0);
      const person = byId.get(id)!;
      person.itemsCents += share;
      person.lines.push({
        name: item.name || "Item",
        cents: share,
        shared: ids.length > 1,
        ways: ids.length,
      });
    });
  }

  const assignedCents = people.reduce((sum, p) => sum + p.itemsCents, 0);
  const extras = [
    { key: "taxCents" as const, total: taxCents },
    { key: "tipCents" as const, total: tipCents },
  ];

  for (const extra of extras) {
    if (extra.total === 0 || people.length === 0) continue;
    let allocated = 0;
    people.forEach((person, index) => {
      const share =
        assignedCents > 0
          ? Math.floor((person.itemsCents * extra.total) / assignedCents)
          : Math.floor(extra.total / people.length);
      person[extra.key] = share;
      allocated += share;
      if (index === people.length - 1) {
        // Give any rounding leftovers to the last person.
        person[extra.key] += extra.total - allocated;
      }
    });
  }

  for (const person of people) {
    person.totalCents = person.itemsCents + person.taxCents + person.tipCents;
  }

  return {
    people,
    subtotalCents,
    unassignedCents,
    grandTotalCents: subtotalCents + taxCents + tipCents,
  };
}

export function formatMoney(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function parseMoneyToCents(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const amount = Number.parseFloat(cleaned);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}
