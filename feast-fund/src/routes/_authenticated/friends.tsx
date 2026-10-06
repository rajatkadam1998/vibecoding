import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { duplicateFriendMessage, isDuplicateError, type Friend } from "@/lib/friends";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({ meta: [{ title: "Friends — Tab Split" }] }),
  component: FriendsPage,
});

function FriendsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ name: "", email: "" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["friends"] });

  const friends = useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friends")
        .select("id, name, email")
        .order("name");
      if (error) throw error;
      return data as Friend[];
    },
  });

  const addFriend = useMutation({
    mutationFn: async () => {
      const name = draft.name.trim();
      const email = draft.email.trim() || null;
      if (!name) throw new Error("Add a name first");
      const duplicate = duplicateFriendMessage(friends.data ?? [], { name, email });
      if (duplicate) throw new Error(duplicate);
      const { error } = await supabase.from("friends").insert({ name, email });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft({ name: "", email: "" });
      refresh();
    },
    onError: (e) =>
      toast.error(
        isDuplicateError(e)
          ? "That name or email is already in your friends."
          : e instanceof Error
            ? e.message
            : "Could not add that friend",
      ),
  });

  const updateFriend = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Friend> }) => {
      const { error } = await supabase.from("friends").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) =>
      toast.error(
        isDuplicateError(e)
          ? "That name or email is already in your friends."
          : "Could not save that change",
      ),
  });

  /** Saves an edited field, or puts the old value back if it would duplicate another friend. */
  const saveField = (
    friend: Friend,
    input: HTMLInputElement,
    patch: { name: string } | { email: string | null },
  ) => {
    const duplicate = duplicateFriendMessage(friends.data ?? [], patch, friend.id);
    if (duplicate) {
      toast.error(duplicate);
      input.value = "name" in patch ? friend.name : (friend.email ?? "");
      return;
    }
    updateFriend.mutate({ id: friend.id, patch });
  };

  const removeFriend = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("friends").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("Could not remove that friend"),
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-4xl">Friends</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People you split with often. Start typing a name on a bill and they'll show up as
          suggestions. Add their email so bills appear under their "Shared with you".
        </p>

        <form
          className="paper-card mt-8 flex flex-wrap gap-2 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            addFriend.mutate();
          }}
        >
          <Input
            className="w-48"
            placeholder="Name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Input
            className="w-64"
            type="email"
            placeholder="Email (optional)"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
          <Button type="submit" disabled={addFriend.isPending}>
            <Plus className="size-4" /> Add friend
          </Button>
        </form>

        <div className="mt-6 space-y-2">
          {friends.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {friends.isError && (
            <p className="text-sm text-destructive">Could not load your friends.</p>
          )}
          {friends.data?.length === 0 && (
            <div className="paper-card p-8 text-center text-sm text-muted-foreground">
              No friends yet. Add them here, or use "Save to friends" after adding someone to a
              bill.
            </div>
          )}
          {friends.data?.map((friend) => (
            <div key={friend.id} className="paper-card flex flex-wrap items-center gap-2 p-3">
              <Input
                className="w-48"
                aria-label="Name"
                defaultValue={friend.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== friend.name) saveField(friend, e.target, { name });
                }}
              />
              <Input
                className="w-64"
                type="email"
                aria-label="Email"
                placeholder="Email (optional)"
                defaultValue={friend.email ?? ""}
                onBlur={(e) => {
                  const email = e.target.value.trim() || null;
                  if (email !== friend.email) saveField(friend, e.target, { email });
                }}
              />
              <button
                onClick={() => removeFriend.mutate(friend.id)}
                aria-label={`Remove ${friend.name}`}
                className="ml-auto p-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
