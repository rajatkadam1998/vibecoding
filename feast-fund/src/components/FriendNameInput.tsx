import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchFriends, type Friend } from "@/lib/friends";

type Props = {
  value: string;
  onChange: (value: string) => void;
  friends: Friend[];
  onPick: (friend: Friend) => void;
  className?: string;
  placeholder?: string;
};

/** A name box that suggests matching friends as you type. */
export function FriendNameInput({
  value,
  onChange,
  friends,
  onPick,
  className,
  placeholder,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = open ? matchFriends(friends, value) : [];

  const pick = (friend: Friend) => {
    onPick(friend);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            // Pick the highlighted friend instead of submitting the form.
            e.preventDefault();
            pick(matches[Math.min(active, matches.length - 1)]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
        >
          {matches.map((friend, i) => (
            <li
              key={friend.id}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(friend);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2",
                i === active && "bg-secondary",
              )}
            >
              <span className="truncate">{friend.name}</span>
              {friend.email ? (
                <span className="truncate text-xs text-muted-foreground">{friend.email}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
