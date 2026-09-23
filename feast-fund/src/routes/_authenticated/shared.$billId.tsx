import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { computeSplit, formatMoney, type SplitItem } from "@/lib/split";
import { paidConfirmationMailto } from "@/lib/requests";

export const Route = createFileRoute("/_authenticated/shared/$billId")({
  head: () => ({
    meta: [
      { title: "A bill shared with you — Tab Split" },
      {
        name: "description",
        content: "See the dishes tagged to you on a bill someone shared, and what you owe them.",
      },
      { property: "og:title", content: "A bill shared with you — Tab Split" },
      {
        property: "og:description",
        content: "See the dishes tagged to you and what you owe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharedBillPage,
});

type Bill = {
  id: string;
  user_id: string;
  title: string;
  restaurant: string | null;
  bill_date: string;
  currency: string;
  tax_cents: number;
  tip_cents: number;
  share_token: string;
  owner_email: string | null;
};

type Participant = { id: string; name: string; email: string | null; paid_at: string | null };

function SharedBillPage() {
  const { billId } = Route.useParams();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["shared-bill-view", billId],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const [billRes, peopleRes, itemsRes] = await Promise.all([
        supabase.from("bills").select("*").eq("id", billId).maybeSingle(),
        supabase.from("participants").select("id, name, email, paid_at").eq("bill_id", billId).order("created_at"),
        supabase
          .from("bill_items")
          .select("id, name, price_cents, is_shared, position, item_shares(participant_id)")
          .eq("bill_id", billId)
          .order("position")
          .order("created_at"),
      ]);
      if (billRes.error) throw billRes.error;
      if (!billRes.data) return null;
      const items: SplitItem[] = (itemsRes.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        price_cents: item.price_cents,
        is_shared: item.is_shared,
        participant_ids: (item.item_shares ?? []).map(
          (s: { participant_id: string }) => s.participant_id,
        ),
      }));
      return {
        bill: billRes.data as Bill,
        participants: (peopleRes.data ?? []) as Participant[],
        items,
        myEmail: auth.user?.email?.toLowerCase() ?? null,
      };
    },
  });

  const markPaid = useMutation({
    mutationFn: async ({ participantId, paid }: { participantId: string; paid: boolean }) => {
      const { data, error } = await supabase.rpc("mark_participant_paid", {
        _participant_id: participantId,
        _paid: paid,
      });
      if (error) throw error;
      if (!data) throw new Error("You can't change the payment status on this bill");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shared-bill-view", billId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update payment status"),
  });

  if (query.isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="p-10 text-center text-sm text-muted-foreground">Loading…</main>
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-5 py-16 text-center">
          <div className="paper-card p-8">
            <h1 className="text-3xl">Bill not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This bill isn't shared with the email address you're signed in with.
            </p>
            <Link
              to="/bills"
              className="mt-5 inline-block text-sm text-muted-foreground underline hover:text-foreground"
            >
              Back to your bills
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { bill, participants, items, myEmail } = query.data;
  const split = computeSplit(items, participants, bill.tax_cents, bill.tip_cents);
  const me = myEmail
    ? split.people.find(
        (person) =>
          participants.find((p) => p.id === person.participantId)?.email?.toLowerCase() === myEmail,
      )
    : undefined;
  const myParticipant = me
    ? participants.find((p) => p.id === me.participantId)
    : undefined;
  const myPaidAt = myParticipant?.paid_at ?? null;
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/s/${bill.share_token}` : "";

  const onMarkPaid = (paid: boolean) => {
    if (!me || !myParticipant) return;
    markPaid.mutate(
      { participantId: me.participantId, paid },
      {
        onSuccess: () => {
          if (paid && bill.owner_email) {
            window.location.href = paidConfirmationMailto({
              ownerEmail: bill.owner_email,
              bill: {
                title: bill.title,
                restaurant: bill.restaurant,
                currency: bill.currency,
                shareUrl,
              },
              personName: me.name,
              totalCents: me.totalCents,
            });
          }
        },
      },
    );
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Shared with you</p>
        <h1 className="mt-2 text-4xl">{bill.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {bill.restaurant ? `${bill.restaurant} · ` : ""}
          {new Date(bill.bill_date + "T00:00:00").toLocaleDateString()}
        </p>

        {me && (
          <section className="paper-card mt-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl">Your share</h2>
              {myPaidAt ? (
                <span className="inline-flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
                    <Check className="size-3" /> Paid {new Date(myPaidAt).toLocaleDateString()}
                  </span>
                  <button
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={() => onMarkPaid(false)}
                  >
                    Undo
                  </button>
                </span>
              ) : (
                <Button size="sm" onClick={() => onMarkPaid(true)} disabled={markPaid.isPending}>
                  <Check className="size-4" /> Mark as paid
                </Button>
              )}
            </div>
            <p className="mt-1 font-display text-4xl text-primary">
              {formatMoney(me.totalCents, bill.currency)}
            </p>
            <ul className="mt-4 space-y-1.5 text-sm">
              {me.lines.map((line, index) => (
                <li key={index} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {line.name}
                    {line.shared ? ` · shared ${line.ways} ways` : ""}
                  </span>
                  <span>{formatMoney(line.cents, bill.currency)}</span>
                </li>
              ))}
              {(me.taxCents > 0 || me.tipCents > 0) && (
                <li className="flex justify-between gap-3 border-t border-border pt-1.5">
                  <span className="text-muted-foreground">Tax &amp; tip</span>
                  <span>{formatMoney(me.taxCents + me.tipCents, bill.currency)}</span>
                </li>
              )}
            </ul>
          </section>
        )}

        <section className="paper-card mt-5 p-6">
          <h2 className="text-2xl">Everything on this bill</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {items.map((item) => {
              const names = item.participant_ids
                .map((id) => participants.find((p) => p.id === id)?.name)
                .filter(Boolean)
                .join(", ");
              return (
                <li key={item.id} className="flex justify-between gap-3 border-b border-border/60 pb-2">
                  <span>
                    {item.name || "Item"}
                    <span className="block text-xs text-muted-foreground">
                      {names || "Not tagged to anyone"}
                    </span>
                  </span>
                  <span>{formatMoney(item.price_cents, bill.currency)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="paper-card mt-5 p-6">
          <h2 className="text-2xl">Who owes what</h2>
          <div className="mt-4 space-y-2 text-sm">
            {split.people.map((person) => (
              <div key={person.participantId} className="flex justify-between gap-3">
                <span className={person.participantId === me?.participantId ? "font-medium" : ""}>
                  {person.name}
                </span>
                <span>{formatMoney(person.totalCents, bill.currency)}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Bill total</span>
            <span className="font-display text-2xl">
              {formatMoney(split.grandTotalCents, bill.currency)}
            </span>
          </div>
        </section>

        <p className="mt-6 text-xs text-muted-foreground">
          This bill belongs to someone else, so it's read-only for you.
        </p>
      </main>
    </div>
  );
}
