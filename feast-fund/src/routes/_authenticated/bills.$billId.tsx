import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { scanReceipt } from "@/lib/receipt.functions";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/AppHeader";
import { FriendNameInput } from "@/components/FriendNameInput";
import {
  duplicateFriendMessage,
  FRIEND_COLUMNS,
  isDuplicateError,
  type Friend,
} from "@/lib/friends";
import {
  findFriendForParticipant,
  normalizeMobile,
  normalizeVenmoUsername,
  venmoChargeUrl,
  venmoNote,
  venmoRecipient,
} from "@/lib/venmo";
import { useMyVenmo } from "@/hooks/useMyVenmo";
import {
  PaymentDetailsDialog,
  type DetailsPrompt,
  type DetailsValues,
} from "@/components/PaymentDetailsDialog";
import { VenmoRequestsDialog, type VenmoRow } from "@/components/VenmoRequestsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeSplit, formatMoney, parseMoneyToCents, type SplitItem } from "@/lib/split";
import { requestMailto, requestBody, type BillContext } from "@/lib/requests";

export const Route = createFileRoute("/_authenticated/bills/$billId")({
  component: BillEditor,
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
  is_draft: boolean;
};

type Participant = {
  id: string;
  name: string;
  email: string | null;
  requested_at: string | null;
  venmo_requested_at: string | null;
  paid_at: string | null;
};

const EMPTY_PERSON = { name: "", email: "", venmo: "", mobile: "" };

function BillEditor() {
  const { billId } = Route.useParams();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [newPerson, setNewPerson] = useState(EMPTY_PERSON);
  const [detailsPrompt, setDetailsPrompt] = useState<DetailsPrompt | null>(null);
  const [venmoPanelOpen, setVenmoPanelOpen] = useState(false);
  const myVenmo = useMyVenmo();
  const runScan = useServerFn(scanReceipt);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bill", billId] });

  const query = useQuery({
    queryKey: ["bill", billId],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const [billRes, peopleRes, itemsRes] = await Promise.all([
        supabase.from("bills").select("*").eq("id", billId).single(),
        supabase
          .from("participants")
          .select("id, name, email, requested_at, venmo_requested_at, paid_at")
          .eq("bill_id", billId)
          .order("created_at"),
        supabase
          .from("bill_items")
          .select("id, name, price_cents, is_shared, position, item_shares(participant_id)")
          .eq("bill_id", billId)
          .order("position")
          .order("created_at"),
      ]);
      if (billRes.error) throw billRes.error;
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
        isOwner: billRes.data.user_id === auth.user?.id,
        myEmail: auth.user?.email ?? null,
        myName:
          (auth.user?.user_metadata?.["display_name"] as string | undefined) ??
          (auth.user?.user_metadata?.["full_name"] as string | undefined) ??
          auth.user?.email ??
          "Me",
      };
    },
  });

  // A fresh random token (same 32-hex format as the database default) kills the old /s/ link.
  const resetShareLink = useMutation({
    mutationFn: async () => {
      const share_token = crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabase.from("bills").update({ share_token }).eq("id", billId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Share link reset — the old link no longer works");
      refresh();
    },
    onError: () => toast.error("Could not reset the share link"),
  });

  const patchBill = useMutation({
    mutationFn: async (patch: Partial<Bill>) => {
      const { error } = await supabase.from("bills").update(patch).eq("id", billId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("Could not save that change"),
  });

  const friends = useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const { data, error } = await supabase.from("friends").select(FRIEND_COLUMNS).order("name");
      if (error) throw error;
      return data as Friend[];
    },
  });

  const saveFriend = useMutation({
    mutationFn: async (person: { name: string; email: string | null }) => {
      const duplicate = duplicateFriendMessage(friends.data ?? [], person);
      if (duplicate) throw new Error(duplicate);
      const { error } = await supabase.from("friends").insert(person);
      if (error) throw error;
    },
    onSuccess: (_, person) => {
      toast.success(`${person.name} saved to your friends`);
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (e) =>
      toast.error(
        isDuplicateError(e)
          ? "That name or email is already in your friends."
          : e instanceof Error
            ? e.message
            : "Could not save that friend",
      ),
  });

  /**
   * Saves Venmo / mobile / email for a bill person into Friends: updates the matching friend,
   * or creates one when they aren't a friend yet. Payment details only ever live in Friends,
   * which nobody else can read.
   */
  const savePaymentDetails = async (
    person: { name: string; email: string | null },
    values: DetailsValues,
  ) => {
    const existing = findFriendForParticipant(person, friends.data ?? []);
    const { error } = existing
      ? await supabase.from("friends").update(values).eq("id", existing.id)
      : await supabase
          .from("friends")
          .insert({ name: person.name, email: person.email, ...values });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["friends"] });
    return existing ? "updated" : "created";
  };

  // `person` is set when a friend is picked from the suggestions; otherwise use the form.
  const addPerson = useMutation({
    mutationFn: async (person?: Friend) => {
      const name = (person?.name ?? newPerson.name).trim();
      const email = (person ? person.email : newPerson.email.trim()) || null;
      if (!name) throw new Error("Add a name first");
      const venmo = person ? { value: null, error: null } : normalizeVenmoUsername(newPerson.venmo);
      if (venmo.error) throw new Error(venmo.error);
      const mobile = person ? { value: null, error: null } : normalizeMobile(newPerson.mobile);
      if (mobile.error) throw new Error(mobile.error);
      const { error } = await supabase
        .from("participants")
        .insert({ bill_id: billId, name, email });
      if (error) throw error;
      let savedPayment: "updated" | "created" | null = null;
      if (venmo.value || mobile.value) {
        const values: DetailsValues = {};
        if (venmo.value) values.venmo_username = venmo.value;
        if (mobile.value) values.mobile_number = mobile.value;
        try {
          savedPayment = await savePaymentDetails({ name, email }, values);
        } catch (e) {
          toast.error(
            isDuplicateError(e)
              ? `Added ${name}, but their Venmo details clash with another friend's name or email.`
              : `Added ${name}, but couldn't save their Venmo details.`,
          );
        }
      }
      return { name, email, fromFriends: Boolean(person), savedPayment };
    },
    onSuccess: (added) => {
      setNewPerson(EMPTY_PERSON);
      refresh();
      if (added.savedPayment) {
        toast.success(
          added.savedPayment === "created"
            ? `Added ${added.name} and saved them to your friends with their Venmo details`
            : `Added ${added.name} and updated their Venmo details in Friends`,
        );
        return;
      }
      // Only offer to save people who wouldn't duplicate an existing friend.
      const known = duplicateFriendMessage(friends.data ?? [], added) !== null;
      if (!added.fromFriends && !known) {
        toast(`Added ${added.name}`, {
          action: {
            label: "Save to friends",
            onClick: () => saveFriend.mutate({ name: added.name, email: added.email }),
          },
        });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add that person"),
  });

  const addMe = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const { error } = await supabase.from("participants").insert({
        bill_id: billId,
        name:
          (auth.user.user_metadata?.["display_name"] as string | undefined) ??
          (auth.user.user_metadata?.["full_name"] as string | undefined) ??
          auth.user.email ??
          "Me",
        email: auth.user.email ?? null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("Could not add you to this bill"),
  });

  const removePerson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("participants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const addItem = useMutation({
    mutationFn: async (item?: { name: string; price_cents: number }) => {
      const { error } = await supabase.from("bill_items").insert({
        bill_id: billId,
        name: item?.name ?? "",
        price_cents: item?.price_cents ?? 0,
        position: query.data?.items.length ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const patchItem = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; price_cents?: number; is_shared?: boolean };
    }) => {
      const { error } = await supabase.from("bill_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bill_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const toggleShare = useMutation({
    mutationFn: async ({
      itemId,
      participantId,
      on,
    }: {
      itemId: string;
      participantId: string;
      on: boolean;
    }) => {
      if (on) {
        const { error } = await supabase
          .from("item_shares")
          .insert({ item_id: itemId, participant_id: participantId });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("item_shares")
          .delete()
          .eq("item_id", itemId)
          .eq("participant_id", participantId);
        if (error) throw error;
      }
    },
    onSuccess: refresh,
  });

  const shareWithEveryone = useMutation({
    mutationFn: async (itemId: string) => {
      const people = query.data?.participants ?? [];
      if (people.length === 0) throw new Error("Add people first");
      await supabase.from("item_shares").delete().eq("item_id", itemId);
      const { error } = await supabase
        .from("item_shares")
        .insert(people.map((p) => ({ item_id: itemId, participant_id: p.id })));
      if (error) throw error;
      await supabase.from("bill_items").update({ is_shared: true }).eq("id", itemId);
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not share that plate"),
  });

  // Manual statuses: set only when the owner says the email / Venmo request was actually sent.
  const markSent = useMutation({
    mutationFn: async ({
      participantId,
      channel,
      sent,
    }: {
      participantId: string;
      channel: "email" | "venmo";
      sent: boolean;
    }) => {
      const at = sent ? new Date().toISOString() : null;
      const patch = channel === "email" ? { requested_at: at } : { venmo_requested_at: at };
      const { error } = await supabase.from("participants").update(patch).eq("id", participantId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("Could not update the request status"),
  });

  // Email requests keep their original behaviour: opening one marks the person "requested".
  const markRequested = (participantId: string) =>
    markSent.mutate({ participantId, channel: "email", sent: true });

  /** Saves the Venmo username / mobile collected by the details dialog to Friends. */
  const saveDetails = async (prompt: DetailsPrompt, values: DetailsValues) => {
    const person = query.data?.participants.find((p) => p.id === prompt.participantId);
    if (!person) return false;
    try {
      await savePaymentDetails(person, values);
      toast.success(`Saved ${person.name}'s details`);
      return true;
    } catch (e) {
      toast.error(
        isDuplicateError(e)
          ? "That name or email is already used by another friend."
          : "Could not save those details",
      );
      return false;
    }
  };

  const finalizeBill = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bills").update({ is_draft: false }).eq("id", billId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bill created — you can request money now");
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      refresh();
    },
    onError: () => toast.error("Could not create that bill"),
  });

  const togglePaid = useMutation({
    mutationFn: async ({ participantId, paid }: { participantId: string; paid: boolean }) => {
      const { data, error } = await supabase.rpc("mark_participant_paid", {
        _participant_id: participantId,
        _paid: paid,
      });
      if (error) throw error;
      if (!data) throw new Error("You can't change that person's payment status");
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update payment status"),
  });

  const onPickReceipt = async (file: File) => {
    setScanning(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file"));
        reader.readAsDataURL(file);
      });
      const result = await runScan({ data: { imageDataUrl: dataUrl } });
      const rows = result.items.map((item, index) => ({
        bill_id: billId,
        name: item.name,
        price_cents: Math.round(item.price * 100),
        position: (query.data?.items.length ?? 0) + index,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("bill_items").insert(rows);
        if (error) throw error;
      }
      const patch: Partial<Bill> = {};
      if (result.restaurant && !query.data?.bill.restaurant) patch.restaurant = result.restaurant;
      if (result.tax) patch.tax_cents = Math.round(result.tax * 100);
      if (result.tip) patch.tip_cents = Math.round(result.tip * 100);
      if (Object.keys(patch).length > 0) {
        await supabase.from("bills").update(patch).eq("id", billId);
      }
      refresh();
      toast.success(
        rows.length > 0
          ? `Added ${rows.length} items from the receipt`
          : "No items found — add them by hand",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that receipt");
    } finally {
      setScanning(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (query.isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="mx-auto max-w-4xl px-5 py-10 text-sm text-muted-foreground">Loading bill…</p>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-5 py-10">
          <p className="text-sm text-muted-foreground">We couldn't open that bill.</p>
          <Link to="/bills" className="mt-3 inline-block text-sm underline">
            Back to your bills
          </Link>
        </div>
      </div>
    );
  }

  if (!query.data.isOwner) {
    return <Navigate to="/shared/$billId" params={{ billId }} replace />;
  }

  const { bill, participants, items, myEmail } = query.data;

  const isMe = (person?: { email: string | null } | null) =>
    Boolean(person?.email && myEmail && person.email.toLowerCase() === myEmail.toLowerCase());
  const meOnBill = participants.some((p) => isMe(p));
  // Don't suggest friends who are already on this bill.
  const friendsNotOnBill = (friends.data ?? []).filter(
    (f) =>
      !participants.some((p) =>
        f.email && p.email
          ? f.email.toLowerCase() === p.email.toLowerCase()
          : f.name.toLowerCase() === p.name.toLowerCase(),
      ),
  );

  const split = computeSplit(items, participants, bill.tax_cents, bill.tip_cents);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/s/${bill.share_token}` : "";
  // Venmo only handles US dollars.
  const venmoOk = bill.currency.toUpperCase() === "USD";
  const note = venmoNote(bill);
  const billCtx: BillContext = {
    title: bill.title,
    restaurant: bill.restaurant,
    currency: bill.currency,
    shareUrl,
    venmoPay: venmoOk && myVenmo.username ? { username: myVenmo.username, note } : null,
  };

  // Everyone except you who owes something, with their saved Venmo identifier (if any).
  const owing = split.people
    .map((person) => {
      const participant = participants.find((x) => x.id === person.participantId);
      const friend = participant ? findFriendForParticipant(participant, friends.data ?? []) : null;
      return { person, participant, recipient: venmoRecipient(friend) };
    })
    .filter(
      ({ person, participant }) => participant && !isMe(participant) && person.totalCents > 0,
    );

  const venmoRows: VenmoRow[] = owing.map(({ person, participant, recipient }) => ({
    participantId: person.participantId,
    name: person.name,
    amount: formatMoney(person.totalCents, bill.currency),
    recipient,
    sentAt: participant?.venmo_requested_at ?? null,
  }));

  /** Opens the request in a new tab. Never changes any status. */
  const openVenmoRequest = (participantId: string) => {
    const row = owing.find((o) => o.person.participantId === participantId);
    if (!row?.recipient) return;
    const url = venmoChargeUrl(row.recipient.id, row.person.totalCents, note);
    window.open(url, "_blank", "noopener,noreferrer");
    if (row.recipient.kind === "mobile") {
      void navigator.clipboard?.writeText(row.recipient.id);
      toast(`Opened Venmo for ${row.person.name}`, {
        description: `Their mobile ${row.recipient.id} is copied — if Venmo didn't fill in the recipient, paste it into the "To" search. Then press Request and mark it sent here.`,
      });
    } else {
      toast(`Opened Venmo for ${row.person.name}`, {
        description: "Review it and press Request in Venmo, then mark it sent here.",
      });
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-8">
        <Link to="/bills" className="text-sm text-muted-foreground hover:text-foreground">
          ← All bills
        </Link>

        {/* Bill details */}
        <section className="paper-card mt-4 p-6">
          <input
            className="w-full bg-transparent font-display text-4xl outline-none placeholder:text-muted-foreground/60"
            defaultValue={bill.title}
            placeholder="Dinner at…"
            onBlur={(e) => {
              const title = e.target.value.trim() || "Untitled bill";
              if (title !== bill.title) patchBill.mutate({ title });
            }}
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Restaurant</Label>
              <Input
                defaultValue={bill.restaurant ?? ""}
                placeholder="Osteria Rosa"
                onBlur={(e) => patchBill.mutate({ restaurant: e.target.value.trim() || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                defaultValue={bill.bill_date}
                onChange={(e) => e.target.value && patchBill.mutate({ bill_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input
                defaultValue={bill.currency}
                maxLength={3}
                onBlur={(e) =>
                  patchBill.mutate({ currency: e.target.value.trim().toUpperCase() || "USD" })
                }
              />
            </div>
          </div>
        </section>

        {/* People */}
        <section className="paper-card mt-5 p-6">
          <h2 className="text-2xl">Who was there</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {participants.map((person) => (
              <span
                key={person.id}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm"
              >
                {isMe(person) ? "You" : person.name}
                {person.email ? (
                  <span className="text-xs text-muted-foreground">{person.email}</span>
                ) : null}
                <button
                  onClick={() => removePerson.mutate(person.id)}
                  aria-label={`Remove ${isMe(person) ? "yourself" : person.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ))}
            {participants.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add everyone who shared the table — you can tag items to them below.
              </p>
            )}
          </div>
          {!meOnBill && (
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              onClick={() => addMe.mutate()}
              disabled={addMe.isPending}
            >
              <Plus className="size-4" /> Add me
            </Button>
          )}
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPerson.mutate(undefined);
            }}
          >
            <FriendNameInput
              className="w-40"
              placeholder="Name"
              value={newPerson.name}
              onChange={(name) => setNewPerson({ ...newPerson, name })}
              friends={friendsNotOnBill}
              onPick={(friend) => addPerson.mutate(friend)}
            />
            <Input
              className="w-56"
              type="email"
              placeholder="Email (optional)"
              value={newPerson.email}
              onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
            />
            <Input
              className="w-44"
              placeholder="Venmo @username (optional)"
              value={newPerson.venmo}
              onChange={(e) => setNewPerson({ ...newPerson, venmo: e.target.value })}
            />
            <Input
              className="w-40"
              type="tel"
              placeholder="Mobile (optional)"
              value={newPerson.mobile}
              onChange={(e) => setNewPerson({ ...newPerson, mobile: e.target.value })}
            />
            <Button type="submit" variant="secondary" disabled={addPerson.isPending}>
              <Plus className="size-4" /> Add person
            </Button>
          </form>
        </section>

        {/* Items */}
        <section className="paper-card mt-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl">Items</h2>
            <div className="flex gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPickReceipt(file);
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={scanning}
              >
                {scanning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                {scanning ? "Reading receipt…" : "Scan receipt"}
              </Button>
              <Button variant="secondary" onClick={() => addItem.mutate(undefined)}>
                <Plus className="size-4" /> Add item
              </Button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Snap the receipt to fill this in, or add items one by one.
              </p>
            )}
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/80 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-40 flex-1"
                    defaultValue={item.name}
                    placeholder="Item name"
                    onBlur={(e) => {
                      const name = e.target.value;
                      if (name !== item.name) patchItem.mutate({ id: item.id, patch: { name } });
                    }}
                  />
                  <Input
                    className="w-28"
                    defaultValue={(item.price_cents / 100).toFixed(2)}
                    inputMode="decimal"
                    onBlur={(e) => {
                      const cents = parseMoneyToCents(e.target.value);
                      if (cents !== item.price_cents)
                        patchItem.mutate({ id: item.id, patch: { price_cents: cents } });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => shareWithEveryone.mutate(item.id)}
                    title="Split between everyone"
                  >
                    <Users className="size-4" /> Share
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeItem.mutate(item.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {participants.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Add people to tag this item.
                    </span>
                  )}
                  {participants.map((person) => {
                    const on = item.participant_ids.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        onClick={() =>
                          toggleShare.mutate({ itemId: item.id, participantId: person.id, on: !on })
                        }
                        className={
                          on
                            ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                            : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                        }
                      >
                        {isMe(person) ? "You" : person.name}
                      </button>
                    );
                  })}
                  {item.participant_ids.length > 1 && (
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">
                      shared {item.participant_ids.length} ways
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tax</Label>
              <Input
                defaultValue={(bill.tax_cents / 100).toFixed(2)}
                inputMode="decimal"
                onBlur={(e) => patchBill.mutate({ tax_cents: parseMoneyToCents(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tip</Label>
              <Input
                defaultValue={(bill.tip_cents / 100).toFixed(2)}
                inputMode="decimal"
                onBlur={(e) => patchBill.mutate({ tip_cents: parseMoneyToCents(e.target.value) })}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Tax and tip are shared out in proportion to what each person ordered.
          </p>
        </section>

        {/* Summary */}
        <section className="paper-card mt-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl">Who owes what</h2>
            {!bill.is_draft && (
              <div className="flex flex-wrap gap-2">
                {split.people.some((p) => {
                  const x = participants.find((y) => y.id === p.participantId);
                  return x?.email && !isMe(x);
                }) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const targets = split.people.filter((p) => {
                        const x = participants.find((y) => y.id === p.participantId);
                        return x?.email && !isMe(x);
                      });
                      targets.forEach((p, i) => {
                        const email = participants.find((x) => x.id === p.participantId)!.email!;
                        setTimeout(() => {
                          window.location.href = requestMailto(billCtx, p, email);
                        }, i * 400);
                        markRequested(p.participantId);
                      });
                      toast.success(`Opening ${targets.length} request emails`);
                    }}
                  >
                    <Mail className="size-4" /> Send all requests
                  </Button>
                )}
                {venmoOk && owing.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={() => setVenmoPanelOpen(true)}>
                    <ExternalLink className="size-4" /> Create all Venmo requests
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {split.people.length === 0 && (
              <p className="text-sm text-muted-foreground">Add people to see the split.</p>
            )}
            {split.people.map((person) => {
              const participant = participants.find((x) => x.id === person.participantId);
              const email = participant?.email ?? null;
              const paidAt = participant?.paid_at ?? null;
              const emailSentAt = participant?.requested_at ?? null;
              const venmoSentAt = participant?.venmo_requested_at ?? null;
              const owes = owing.find((o) => o.person.participantId === person.participantId);
              const day = (iso: string) => new Date(iso).toLocaleDateString();
              return (
                <div key={person.participantId} className="rounded-lg bg-secondary/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {isMe(participant) ? "You" : person.name}

                        {!bill.is_draft &&
                          (paidAt ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                              <Check className="size-3" /> Paid {day(paidAt)}
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Not paid
                            </span>
                          ))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(person.itemsCents, bill.currency)} items +{" "}
                        {formatMoney(person.taxCents + person.tipCents, bill.currency)} tax &amp;
                        tip
                        {emailSentAt && ` · requested ${day(emailSentAt)}`}
                        {venmoSentAt && ` · Venmo request sent ${day(venmoSentAt)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-2xl">
                        {formatMoney(person.totalCents, bill.currency)}
                      </span>
                      {!bill.is_draft && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            togglePaid.mutate({
                              participantId: person.participantId,
                              paid: !paidAt,
                            })
                          }
                        >
                          {paidAt ? "Undo paid" : "Mark paid"}
                        </Button>
                      )}
                      {!bill.is_draft &&
                        !isMe(participant) &&
                        (email ? (
                          <Button asChild variant="outline" size="sm">
                            <a
                              href={requestMailto(billCtx, person, email)}
                              onClick={() => markRequested(person.participantId)}
                            >
                              Request
                            </a>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(requestBody(billCtx, person));
                              markRequested(person.participantId);
                              toast.success("Request message copied — paste it anywhere");
                            }}
                          >
                            Copy message
                          </Button>
                        ))}
                    </div>
                  </div>

                  {!bill.is_draft && owes && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                      {/* 1. Venmo request from your browser */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!venmoOk}
                        title={venmoOk ? undefined : "Venmo only supports USD"}
                        onClick={() =>
                          owes.recipient
                            ? openVenmoRequest(person.participantId)
                            : setDetailsPrompt({
                                participantId: person.participantId,
                                name: person.name,
                              })
                        }
                      >
                        <ExternalLink className="size-4" />
                        {owes.recipient ? "Create Venmo request" : "Add Venmo to request"}
                      </Button>
                      {venmoOk && owes.recipient && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            markSent.mutate({
                              participantId: person.participantId,
                              channel: "venmo",
                              sent: !venmoSentAt,
                            })
                          }
                        >
                          {venmoSentAt ? "Undo Venmo sent" : "Mark Venmo sent"}
                        </Button>
                      )}

                      {owes.recipient && (
                        <span className="text-xs text-muted-foreground">
                          Venmo:{" "}
                          {owes.recipient.kind === "username"
                            ? `@${owes.recipient.id}`
                            : `${owes.recipient.id} (mobile)`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!bill.is_draft && participants.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              {participants.filter((p) => p.paid_at).length} of {participants.length} paid
            </p>
          )}

          {split.unassignedCents > 0 && (
            <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {formatMoney(split.unassignedCents, bill.currency)} of items isn't tagged to anyone
              yet.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <div>
              <p className="text-sm text-muted-foreground">Bill total</p>
              <p className="font-display text-3xl">
                {formatMoney(split.grandTotalCents, bill.currency)}
              </p>
            </div>
            {!bill.is_draft && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    toast.success("Share link copied");
                  }}
                >
                  <Copy className="size-4" /> Copy share link
                </Button>
                <Button asChild>
                  <a href={`/s/${bill.share_token}`} target="_blank" rel="noreferrer">
                    Open share page
                  </a>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" disabled={resetShareLink.isPending}>
                      <RefreshCw className="size-4" /> Reset share link
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset the share link?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The current link will stop working for everyone who has it. You'll get a new
                        link to share with the people who should still see this bill.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => resetShareLink.mutate()}>
                        Reset link
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </section>

        {bill.is_draft && (
          <section className="paper-card mt-5 p-6 text-center">
            <h2 className="text-2xl">Ready to create this bill?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Scan or type the items, add everyone and tag their dishes. Create the bill when it
              looks right — then you can request money and share the link.
            </p>
            <Button
              className="mt-5 w-full sm:w-auto"
              size="lg"
              disabled={finalizeBill.isPending}
              onClick={() => finalizeBill.mutate()}
            >
              {finalizeBill.isPending ? "Creating…" : "Create bill"}
            </Button>
          </section>
        )}
      </main>

      <PaymentDetailsDialog
        prompt={detailsPrompt}
        onClose={() => setDetailsPrompt(null)}
        onSave={saveDetails}
      />
      <VenmoRequestsDialog
        open={venmoPanelOpen}
        onClose={() => setVenmoPanelOpen(false)}
        rows={venmoRows}
        onOpenVenmo={(row) => openVenmoRequest(row.participantId)}
        onMarkSent={(row) =>
          markSent.mutateAsync({ participantId: row.participantId, channel: "venmo", sent: true })
        }
        onAddDetails={(row) =>
          setDetailsPrompt({
            participantId: row.participantId,
            name: row.name,
          })
        }
      />
    </div>
  );
}
