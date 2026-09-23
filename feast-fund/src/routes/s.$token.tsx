import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeSplit, formatMoney, type SplitItem } from "@/lib/split";

export const Route = createFileRoute("/s/$token")({
  head: () => ({
    meta: [
      { title: "Your share of the bill — Tab Split" },
      {
        name: "description",
        content: "See exactly which dishes you ordered, your part of shared plates, and what you owe.",
      },
      { property: "og:title", content: "Your share of the bill — Tab Split" },
      {
        property: "og:description",
        content: "See which dishes you ordered, your part of shared plates, and what you owe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharePage,
});

type SharedBill = {
  bill: {
    title: string;
    restaurant: string | null;
    bill_date: string;
    currency: string;
    tax_cents: number;
    tip_cents: number;
    owner_name: string | null;
  };
  participants: { id: string; name: string }[];
  items: SplitItem[];
};

function SharePage() {
  const { token } = Route.useParams();

  const query = useQuery({
    queryKey: ["shared-bill", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_shared_bill", { _token: token });
      if (error) throw error;
      return (data as SharedBill | null) ?? null;
    },
  });

  if (query.isLoading) {
    return <main className="p-10 text-center text-sm text-muted-foreground">Loading…</main>;
  }

  if (!query.data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="paper-card max-w-md p-8 text-center">
          <h1 className="text-3xl">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This share link is wrong or has been removed. Ask whoever sent it for a new one.
          </p>
        </div>
      </main>
    );
  }

  const { bill, participants, items } = query.data;
  const split = computeSplit(items, participants, bill.tax_cents, bill.tip_cents);

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {bill.owner_name ? `Requested by ${bill.owner_name}` : "Bill split"}
      </p>
      <h1 className="mt-2 text-4xl">{bill.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {bill.restaurant ? `${bill.restaurant} · ` : ""}
        {new Date(bill.bill_date + "T00:00:00").toLocaleDateString()}
      </p>

      <div className="mt-8 space-y-4">
        {split.people.map((person) => (
          <section key={person.participantId} className="paper-card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-2xl">{person.name}</h2>
              <span className="font-display text-3xl text-primary">
                {formatMoney(person.totalCents, bill.currency)}
              </span>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {person.lines.map((line, index) => (
                <li key={index} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {line.name}
                    {line.shared ? ` · shared ${line.ways} ways` : ""}
                  </span>
                  <span>{formatMoney(line.cents, bill.currency)}</span>
                </li>
              ))}
              {(person.taxCents > 0 || person.tipCents > 0) && (
                <li className="flex justify-between gap-3 border-t border-border pt-1.5">
                  <span className="text-muted-foreground">Tax &amp; tip</span>
                  <span>{formatMoney(person.taxCents + person.tipCents, bill.currency)}</span>
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8 flex justify-between border-t border-border pt-5">
        <span className="text-sm text-muted-foreground">Bill total</span>
        <span className="font-display text-2xl">
          {formatMoney(split.grandTotalCents, bill.currency)}
        </span>
      </div>

      <Link to="/" className="mt-10 block text-center text-xs text-muted-foreground hover:text-foreground">
        Split your own bill with Tab Split
      </Link>
    </main>
  );
}
