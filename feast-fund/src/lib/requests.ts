import { formatMoney, type PersonTotal } from "@/lib/split";

export type BillContext = {
  title: string;
  restaurant: string | null;
  currency: string;
  shareUrl: string;
};

export function requestBody(bill: BillContext, person: PersonTotal): string {
  const lines = person.lines
    .map(
      (line) =>
        `• ${line.name}${line.shared ? ` (shared ${line.ways} ways)` : ""}: ${formatMoney(line.cents, bill.currency)}`,
    )
    .join("\n");
  return `Hi ${person.name},

Here's your share of ${bill.title}${bill.restaurant ? ` at ${bill.restaurant}` : ""}:

${lines}
Tax: ${formatMoney(person.taxCents, bill.currency)}
Tip: ${formatMoney(person.tipCents, bill.currency)}

Total: ${formatMoney(person.totalCents, bill.currency)}

Full breakdown: ${bill.shareUrl}
`;
}

export function requestMailto(bill: BillContext, person: PersonTotal, email: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(
    `Your share of ${bill.title}`,
  )}&body=${encodeURIComponent(requestBody(bill, person))}`;
}

export function paidConfirmationMailto(args: {
  ownerEmail: string;
  bill: BillContext;
  personName: string;
  totalCents: number;
}): string {
  const { ownerEmail, bill, personName, totalCents } = args;
  const body = `Hi,

I've sent you my share of ${bill.title}${bill.restaurant ? ` at ${bill.restaurant}` : ""}: ${formatMoney(totalCents, bill.currency)}.

— ${personName}

Full breakdown: ${bill.shareUrl}
`;
  return `mailto:${ownerEmail}?subject=${encodeURIComponent(
    `Paid: ${personName} — ${bill.title}`,
  )}&body=${encodeURIComponent(body)}`;
}
