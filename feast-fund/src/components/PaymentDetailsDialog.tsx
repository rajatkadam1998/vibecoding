import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeMobile, normalizeVenmoUsername } from "@/lib/venmo";

/** Someone on the bill who needs a Venmo username or mobile before a request can be made. */
export type DetailsPrompt = { participantId: string; name: string };

export type DetailsValues = {
  venmo_username?: string | null;
  mobile_number?: string | null;
};

type Props = {
  prompt: DetailsPrompt | null;
  onClose: () => void;
  /** Resolves true when saved; the dialog then closes. */
  onSave: (prompt: DetailsPrompt, values: DetailsValues) => Promise<boolean>;
};

export function PaymentDetailsDialog({ prompt, onClose, onSave }: Props) {
  const [venmo, setVenmo] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVenmo("");
    setMobile("");
    setError(null);
  }, [prompt]);

  if (!prompt) return null;

  const submit = async () => {
    const v = normalizeVenmoUsername(venmo);
    if (v.error) return setError(v.error);
    const m = normalizeMobile(mobile);
    if (m.error) return setError(m.error);
    if (!v.value && !m.value) return setError("Add a Venmo username or a mobile number.");
    setSaving(true);
    const ok = await onSave(prompt, { venmo_username: v.value, mobile_number: m.value });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {prompt.name}'s Venmo</DialogTitle>
          <DialogDescription>
            A Venmo username works best; a mobile number is the fallback. Saved to your Friends.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="details-venmo">Venmo username</Label>
            <Input
              id="details-venmo"
              autoFocus
              placeholder="@username"
              value={venmo}
              onChange={(e) => setVenmo(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="details-mobile">Mobile (if no username)</Label>
            <Input
              id="details-mobile"
              type="tel"
              placeholder="+1 917 555 0100"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
