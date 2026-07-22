"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A text input that suggests full addresses as the tech types (via
 * /api/address-suggest). Prefill it with whatever the AI heard in the note;
 * the tech types a little and picks the matching full address.
 */
export default function AddressInput({
  value,
  onChange,
  placeholder = "Address",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const justPicked = useRef(false);

  useEffect(() => {
    // Don't re-query right after the tech picks a suggestion.
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/address-suggest?q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="relative">
      <input
        type="text"
        autoCapitalize="words"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul className="tt-elevate absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  justPicked.current = true;
                  onChange(s);
                  setSuggestions([]);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2.5 text-left text-[15px] text-foreground hover:bg-brand-50 transition"
              >
                📍 {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
