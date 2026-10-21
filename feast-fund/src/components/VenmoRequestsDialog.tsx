import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VenmoRecipient } from "@/lib/venmo";

export type VenmoRow = {
  participantId: string;
  name: string;
  amount: string;
  recipient: VenmoRecipient | null;
  sentAt: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  rows: VenmoRow[];
  onOpenVenmo: (row: VenmoRow) => void;
  onMarkSent: (row: VenmoRow) => Promise<void>;
  onAddDetails: (row: VenmoRow) => void;
};

/**
 * Walks through everyone who owes money, one Venmo request at a time. Progress is the saved
 * "Venmo request sent" status, so closing or reloading resumes at the first person not yet sent.
 */
export function VenmoRequestsDialog({
  open,
  onClose,
  rows,
  onOpenVenmo,
  onMarkSent,
  onAddDetails,
}: Props) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSkipped(new Set());
  }, [open]);

  const current = rows.find((r) => !r.sentAt && !skipped.has(r.participantId)) ?? null;
  const sentCount = rows.filter((r) => r.sentAt).length;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create all Venmo requests</DialogTitle>
          <DialogDescription>
            One person at a time: open Venmo, press Request there, then come back and mark it sent.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {rows.map((row) => {
            const isCurrent = current?.participantId === row.participantId;
            return (
              <li
                key={row.participantId}
                className={cn(
                  "rounded-lg border border-border p-3 text-sm",
                  isCurrent && "border-primary bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {row.name} · {row.amount}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.sentAt ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Check className="size-3" /> Sent
                      </span>
                    ) : skipped.has(row.participantId) ? (
                      "Skipped"
                    ) : row.recipient ? (
                      row.recipient.kind === "username" ? (
                        `@${row.recipient.id}`
                      ) : (
                        `${row.recipient.id} (mobile)`
                      )
                    ) : (
                      "No Venmo details"
                    )}
                  </span>
                </div>
                {isCurrent && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.recipient ? (
                      <Button size="sm" onClick={() => onOpenVenmo(row)}>
                        <ExternalLink className="size-4" /> Open Venmo for {row.name}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onAddDetails(row)}>
                        Add Venmo details
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !row.recipient}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onMarkSent(row);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Mark sent &amp; next
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSkipped((s) => new Set(s).add(row.participantId))}
                    >
                      Skip
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {!current && (
          <div className="rounded-lg bg-secondary/60 p-3 text-sm">
            Done — {sentCount} of {rows.length} Venmo requests marked sent.
            {skipped.size > 0 && (
              <Button variant="link" size="sm" onClick={() => setSkipped(new Set())}>
                Go back to skipped
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
