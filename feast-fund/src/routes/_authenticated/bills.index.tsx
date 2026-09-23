import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/split";

export const Route = createFileRoute("/_authenticated/bills/")({
  component: BillsPage,
});

type BillRow = {
  id: string;
  user_id: string;
  title: string;
  restaurant: string | null;
  bill_date: string;
  currency: string;
  tax_cents: number;
  tip_cents: number;
  is_draft: boolean;
  bill_items: { price_cents: number }[];
  participants: { id: string; paid_at: string | null }[];
};


function BillsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", auth.user.id)
        .maybeSingle();
      return {
        id: auth.user.id,
        email: auth.user.email ?? null,
        display_name:
          data?.display_name ??
          (auth.user.user_metadata?.["display_name"] as string | undefined) ??
          (auth.user.user_metadata?.["full_name"] as string | undefined) ??
          auth.user.email ??
          null,
        exists: Boolean(data),
      };

    },
  });

  // Make sure a profile row exists so share pages can show who is asking.
  useEffect(() => {
    const p = profile.data;
    if (!p || p.exists) return;
    supabase
      .from("profiles")
      .upsert({ id: p.id, display_name: p.display_name })
      .then(() => queryClient.invalidateQueries({ queryKey: ["profile"] }));
  }, [profile.data, queryClient]);

  const bills = useQuery({
    queryKey: ["bills"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("bills")
        .select("id, user_id, title, restaurant, bill_date, currency, tax_cents, tip_cents, is_draft, bill_items(price_cents), participants(id, paid_at)")
        .order("bill_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as BillRow[];
      const myId = auth.user?.id ?? "";
      return {
        owned: rows.filter((b) => b.user_id === myId),
        shared: rows.filter((b) => b.user_id !== myId && !b.is_draft),
      };
    },
  });


  const createBill = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const { data, error } = await supabase
        .from("bills")
        .insert({
          user_id: auth.user.id,
          title: "New bill",
          owner_email: auth.user.email ?? null,
          is_draft: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      // Put the creator on the bill straight away so they can tag items to themselves.
      await supabase.from("participants").insert({
        bill_id: data.id as string,
        name:
          (auth.user.user_metadata?.["display_name"] as string | undefined) ??
          (auth.user.user_metadata?.["full_name"] as string | undefined) ??
          auth.user.email ??
          "Me",
        email: auth.user.email ?? null,
      });
      return data.id as string;

    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      navigate({ to: "/bills/$billId", params: { billId: id } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not start a bill"),
  });

  const goToNewBill = () => createBill.mutate();

  const removeBill = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bills").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bill deleted");
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
  });

  return (
    <div className="min-h-screen">
      <AppHeader name={profile.data?.display_name ?? null} />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl">Your bills</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every dinner you've split, and what everyone owed.
            </p>
          </div>
          <Button onClick={goToNewBill}>
            New bill
          </Button>
        </div>

        <div className="mt-8 space-y-3">
          {bills.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {bills.data?.owned.length === 0 && (
            <div className="paper-card p-10 text-center">
              <h2 className="text-2xl">No bills yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Start a bill, snap the receipt or type the items in, then tag each dish to whoever
                ordered it.
              </p>
              <Button className="mt-5" onClick={goToNewBill}>
                Start your first bill
              </Button>
            </div>
          )}
          {bills.data?.owned.map((bill) => {
            const total =
              bill.bill_items.reduce((sum, i) => sum + i.price_cents, 0) +
              bill.tax_cents +
              bill.tip_cents;
            return (
              <div key={bill.id} className="paper-card flex items-center justify-between gap-4 p-5">
                <Link
                  to="/bills/$billId"
                  params={{ billId: bill.id }}
                  className="min-w-0 flex-1"
                >
                  <p className="flex items-center gap-2 truncate font-display text-2xl">
                    {bill.title}
                    {bill.is_draft && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground">
                        Draft
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {bill.restaurant ? `${bill.restaurant} · ` : ""}
                    {new Date(bill.bill_date + "T00:00:00").toLocaleDateString()} ·{" "}
                    {bill.participants.length} {bill.participants.length === 1 ? "person" : "people"}
                    {!bill.is_draft &&
                      bill.participants.length > 0 &&
                      ` · ${bill.participants.filter((p) => p.paid_at).length} of ${bill.participants.length} paid`}
                  </p>
                </Link>
                <div className="text-right">
                  <p className="font-display text-2xl">{formatMoney(total, bill.currency)}</p>
                  <button
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                    onClick={() => removeBill.mutate(bill.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <section className="mt-12">
          <h2 className="text-3xl">Shared with you</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bills where someone added you using {profile.data?.email ?? "your email address"}.
          </p>
          <div className="mt-5 space-y-3">
            {bills.data?.shared.length === 0 && (
              <div className="paper-card p-8 text-center text-sm text-muted-foreground">
                Nothing yet. A bill shows up here once the person who made it adds you with this exact
                email address — otherwise ask them for their share link.
              </div>
            )}
            {bills.data?.shared.map((bill) => {
              const total =
                bill.bill_items.reduce((sum, i) => sum + i.price_cents, 0) +
                bill.tax_cents +
                bill.tip_cents;
              return (
                <Link
                  key={bill.id}
                  to="/shared/$billId"
                  params={{ billId: bill.id }}
                  className="paper-card flex items-center justify-between gap-4 p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-2xl">{bill.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {bill.restaurant ? `${bill.restaurant} · ` : ""}
                      {new Date(bill.bill_date + "T00:00:00").toLocaleDateString()} ·{" "}
                      {bill.participants.length}{" "}
                      {bill.participants.length === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <p className="font-display text-2xl">{formatMoney(total, bill.currency)}</p>
                </Link>
              );
            })}
          </div>
        </section>

      </main>
    </div>
  );
}
