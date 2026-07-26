"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createContact,
  updateContact,
  deleteContact,
  importContacts,
} from "@/lib/supabase/customers";
import { contactsAvailable, pickContacts } from "@/lib/contacts";
import { formatPhone } from "@/lib/phone";
import type { Contact } from "@/lib/types";

type Draft = {
  first: string;
  last: string;
  email: string;
  phone: string;
  address: string;
};

const EMPTY: Draft = { first: "", last: "", email: "", phone: "", address: "" };

/** Split a stored full name into first + last for the edit form. Everything
 *  after the first space is treated as the last name. */
function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

function joinName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(" ");
}

function mapHref(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

export default function ContactsList({ initial }: { initial: Contact[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initial);
  const [query, setQuery] = useState("");
  // null = closed; "new" = adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [importing, setImporting] = useState(false);
  // Whether the phone's address book is reachable (native app or Android
  // Chrome). Computed after mount so server and client render the same first
  // pass; on iOS Safari it stays false and the Import button is hidden.
  const [canImport, setCanImport] = useState(false);
  useEffect(() => {
    setCanImport(contactsAvailable());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.email, c.phone, c.address]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [contacts, query]);

  function openNew() {
    setError(null);
    setDraft(EMPTY);
    setEditing("new");
  }

  function openEdit(c: Contact) {
    setError(null);
    const { first, last } = splitName(c.name);
    setDraft({
      first,
      last,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
    });
    setEditing(c.id);
  }

  function closeForm() {
    setEditing(null);
    setDraft(EMPTY);
    setError(null);
  }

  function save() {
    setError(null);
    const name = joinName(draft.first, draft.last);
    const payload = {
      name,
      email: draft.email,
      phone: draft.phone,
      address: draft.address,
    };
    startTransition(async () => {
      if (editing === "new") {
        const res = await createContact(payload);
        if (res.error) {
          setError(res.error);
          return;
        }
        setContacts((prev) =>
          [
            ...prev,
            {
              id: res.id as string,
              name,
              email: draft.email.trim() || null,
              phone: draft.phone.trim() || null,
              address: draft.address.trim() || null,
            },
          ].sort((a, b) => a.name.localeCompare(b.name))
        );
      } else if (editing) {
        const res = await updateContact(editing, payload);
        if (res.error) {
          setError(res.error);
          return;
        }
        const id = editing;
        setContacts((prev) =>
          prev
            .map((c) =>
              c.id === id
                ? {
                    ...c,
                    name,
                    email: draft.email.trim() || null,
                    phone: draft.phone.trim() || null,
                    address: draft.address.trim() || null,
                  }
                : c
            )
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      closeForm();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteContact(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setConfirmDelete(null);
    });
  }

  async function runImport() {
    setNotice(null);
    setError(null);
    setImporting(true);
    try {
      const picked = await pickContacts();
      if (!picked.length) {
        setImporting(false);
        return;
      }
      const res = await importContacts(
        picked.map((p) => ({
          name: p.name,
          email: p.email,
          phone: p.phone,
          address: p.address,
        }))
      );
      if (res.error) {
        setError(res.error);
        setImporting(false);
        return;
      }
      if (res.added) {
        // Pull the fresh directory so imported rows show with their ids.
        const added = res.added;
        const skip = res.skipped;
        setNotice(
          `Added ${added} contact${added === 1 ? "" : "s"}` +
            (skip ? `. ${skip} already saved.` : ".")
        );
        // Merge optimistically; ids come on next load. Reload to be safe.
        window.location.reload();
        return;
      }
      setNotice(
        res.skipped
          ? "Those contacts are already saved."
          : "No contacts were added."
      );
    } catch {
      setError("Couldn't read your contacts.");
    } finally {
      setImporting(false);
    }
  }

  const formOpen = editing !== null;

  return (
    <div>
      {/* Top actions */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={openNew}
          disabled={formOpen}
          className="rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-[15px] shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
        >
          Add a client
        </button>
        {canImport && (
          <button
            type="button"
            onClick={runImport}
            disabled={importing || pending}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-foreground font-medium text-[15px] hover:bg-brand-50 disabled:opacity-60 transition"
          >
            {importing ? "Importing..." : "Import from phone"}
          </button>
        )}
      </div>

      {notice && (
        <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-[14px] text-brand">
          {notice}
        </div>
      )}

      {/* Add / edit form */}
      {formOpen && (
        <div className="mb-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="text-[16px] font-semibold text-foreground mb-3">
            {editing === "new" ? "New client" : "Edit client"}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={draft.first}
              onChange={(e) => setDraft({ ...draft, first: e.target.value })}
              placeholder="First name"
              autoFocus
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <input
              type="text"
              value={draft.last}
              onChange={(e) => setDraft({ ...draft, last: e.target.value })}
              placeholder="Last name"
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <input
            type="tel"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            placeholder="Phone"
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            placeholder="Email"
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <input
            type="text"
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            placeholder="Address"
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <p className="mt-2 text-[13px] text-muted">
            First name is required, plus at least a phone, email, or address.
          </p>
          {error && (
            <p className="mt-2 text-[14px] text-red-600">{error}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-[15px] shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
            >
              {pending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={pending}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-foreground font-medium text-[15px] hover:bg-brand-50 disabled:opacity-60 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      {contacts.length > 0 && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients"
          className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      )}

      {/* List */}
      {contacts.length === 0 ? (
        <p className="mt-6 text-center text-[15px] text-muted">
          No clients yet. Add one above, or they will show up here after your
          first recorded job.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-center text-[15px] text-muted">
          No clients match that search.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-foreground truncate">
                    {c.name}
                  </p>
                  <div className="mt-1 space-y-0.5 text-[14px]">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="block text-brand hover:underline"
                      >
                        {formatPhone(c.phone)}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="block text-brand hover:underline break-all"
                      >
                        {c.email}
                      </a>
                    )}
                    {c.address && (
                      <a
                        href={mapHref(c.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-muted hover:underline"
                      >
                        {c.address}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="rounded-md px-2 py-1 text-[13px] font-medium text-brand hover:bg-brand-50 transition"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(c.id)}
                    className="rounded-md px-2 py-1 text-[13px] font-medium text-muted hover:text-red-600 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {confirmDelete === c.id && (
                <div className="mt-3 rounded-lg bg-red-50 px-3 py-2.5">
                  <p className="text-[14px] text-red-700">
                    Remove {c.name} from your clients?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      disabled={pending}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-white text-[13px] font-medium hover:bg-red-700 disabled:opacity-60 transition"
                    >
                      {pending ? "Removing..." : "Remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      disabled={pending}
                      className="rounded-md border border-border bg-surface px-3 py-1.5 text-foreground text-[13px] font-medium hover:bg-background disabled:opacity-60 transition"
                    >
                      Keep
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
