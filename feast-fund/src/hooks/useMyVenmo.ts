import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** The signed-in user's own Venmo username (stored on their private profile row). */
export function useMyVenmo() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["my-venmo"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("venmo_username")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.venmo_username ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async (username: string | null) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      // Upsert only touches the columns given, so an existing display name is kept.
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: auth.user.id, venmo_username: username });
      if (error) throw error;
      return username;
    },
    onSuccess: (username) => {
      queryClient.setQueryData(["my-venmo"], username);
      toast.success(username ? `Your Venmo is set to @${username}` : "Your Venmo was removed");
    },
    onError: () => toast.error("Could not save your Venmo username"),
  });

  return {
    username: query.data ?? null,
    loading: query.isLoading,
    /** Resolves true when saved; failures are already shown as a toast. */
    save: (username: string | null) =>
      save.mutateAsync(username).then(
        () => true,
        () => false,
      ),
  };
}
