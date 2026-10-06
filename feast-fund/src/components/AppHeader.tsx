import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function AppHeader({ name }: { name?: string | null }) {
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <header className="border-b border-border/70">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
        <Link to="/bills" className="font-display text-2xl">
          Tab Split
        </Link>
        <div className="flex items-center gap-3">
          {name ? <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span> : null}
          <Link
            to="/friends"
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Friends
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
