"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Edit in place. Typing only touches local state, so there is no round trip per keystroke
 * (§3.12), and the value is committed once, on blur.
 *
 * It commits ONLY if the text actually changed. That is not an optimisation: the server's
 * markEdited promotes origin generated → edited on the mere presence of a field in the
 * patch, and an edited item is permanently exempt from regeneration. Saving an untouched
 * field would quietly make the kit un-regenerable.
 */
export default function InlineEdit({
  value,
  onCommit,
  label,
  placeholder = "Empty",
  multiline = true,
  className = "",
  textClassName = "",
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  const committed = useRef(value ?? "");

  // Adopt changes that came from elsewhere — a regeneration, or a mutation response —
  // but never while the user is mid-edit.
  useEffect(() => {
    if (editing) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(value ?? "");
    committed.current = value ?? "";
  }, [value, editing]);

  useEffect(() => {
    if (!editing || !ref.current) return;
    const node = ref.current;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [editing]);

  async function commit() {
    setEditing(false);
    const next = draft.trim();

    if (next === committed.current.trim()) {
      setDraft(committed.current);
      return;
    }

    setSaving(true);
    const previous = committed.current;
    committed.current = next;
    try {
      await onCommit(next);
    } catch {
      // The kit hook surfaces the error; here we just put the text back.
      committed.current = previous;
      setDraft(previous);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
        className={`group/edit w-full cursor-text rounded-lg px-2 py-1.5 text-left
                    transition-colors duration-200 hover:bg-ink/[0.04]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                    focus-visible:ring-offset-2 ${className}`}
      >
        <span
          className={`block whitespace-pre-wrap break-words ${textClassName} ${
            value ? "" : "text-ink/35 italic"
          }`}
        >
          {value || placeholder}
        </span>
        {saving && <span className="ml-2 text-xs font-medium text-ink/50">saving…</span>}
      </button>
    );
  }

  const Control = multiline ? "textarea" : "input";

  return (
    <Control
      ref={ref}
      aria-label={label}
      value={draft}
      rows={multiline ? Math.max(2, draft.split("\n").length + 1) : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(committed.current);
          setEditing(false);
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Enter" && !multiline) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      // textClassName carries the caller's type size, which is 15px in places. `max-sm:`
      // sorts after plain utilities in the generated CSS, so this raises the small ones to
      // 16px on phones — below that iOS zooms on focus — without touching desktop.
      className={`w-full resize-y rounded-lg border border-accent/40 bg-paper px-2 py-1.5
                  text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30
                  ${textClassName} ${className} max-sm:text-base`}
    />
  );
}
