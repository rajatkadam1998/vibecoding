import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Receipt, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import heroImage from "@/assets/table-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tab Split — Split a restaurant bill item by item" },
      {
        name: "description",
        content:
          "Snap the receipt, tag each dish to the person who ordered it, split shared plates evenly, and send everyone a link with exactly what they owe.",
      },
      { property: "og:title", content: "Tab Split — Split a restaurant bill item by item" },
      {
        property: "og:description",
        content:
          "Tag each dish to whoever ordered it, split shared plates, and share a link with what everyone owes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session, loading } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="font-display text-2xl">Tab Split</span>
        {!loading &&
          (session ? (
            <Button asChild size="sm">
              <Link to="/bills">Your bills</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="ghost">
              <Link to="/auth">Sign in</Link>
            </Button>
          ))}
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <section className="grid items-center gap-10 py-10 lg:grid-cols-2 lg:py-16">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-primary">
              No more napkin arithmetic
            </p>
            <h1 className="mt-4 text-5xl leading-[1.05] sm:text-6xl">
              Everyone pays for what they actually ordered.
            </h1>
            <p className="mt-5 max-w-md text-muted-foreground">
              Snap the receipt or type it in, tag each dish to a person, split the shared plates
              evenly, then send everyone a link with their exact total.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to={session ? "/bills" : "/auth"}>
                  {session ? "Open your bills" : "Split a bill"}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Create an account</Link>
              </Button>
            </div>
          </div>
          <img
            src={heroImage}
            width={1600}
            height={1008}
            alt="Shared plates of pasta and a paper receipt on a restaurant table"
            className="rounded-2xl border border-border object-cover shadow-[0_30px_60px_-40px_oklch(0.24_0.024_45/0.6)]"
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Camera,
              title: "Scan the receipt",
              text: "A photo of the bill becomes a list of items and prices you can edit.",
            },
            {
              icon: Users,
              title: "Tag each dish",
              text: "Tap the people who ordered it — one name or the whole table.",
            },
            {
              icon: Receipt,
              title: "Split shared plates",
              text: "Shared plates divide evenly, and tax and tip follow what each person ate.",
            },
            {
              icon: Send,
              title: "Send the ask",
              text: "Share one link with everyone, or email each person their own total.",
            },
          ].map((step) => (
            <div key={step.title} className="paper-card p-5">
              <step.icon className="size-5 text-primary" />
              <h2 className="mt-3 text-xl">{step.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
