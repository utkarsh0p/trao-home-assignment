"use client";

import { useState } from "react";

// Which requirements a question or card claims to cover. This is what makes coverage
// checkable rather than a matter of opinion, so it is editable rather than read-only.

export default function RequirementPicker({ requirements, selected, onChange, label }) {
  const [open, setOpen] = useState(false);
  const chosen = new Set(selected ?? []);

  function toggle(id) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {(selected ?? []).map((id) => {
          const requirement = requirements.find((r) => r.id === id);
          return (
            <span
              key={id}
              title={requirement?.text ?? "Unknown requirement"}
              className="inline-flex items-center gap-1 rounded-full bg-sky px-2.5 py-0.5 text-[11px] font-semibold text-ink/70"
            >
              {id}
              {requirement ? "" : " (missing)"}
            </span>
          );
        })}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="cursor-pointer rounded-full border border-dashed border-ink/20 px-2.5 py-0.5
                     text-[11px] font-semibold text-ink/50 transition-colors duration-200
                     hover:border-ink/40 hover:text-ink focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
        >
          {selected?.length ? "Edit" : "Link a requirement"}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(420px,80vw)] rounded-xl border border-ink/10 bg-surface p-2 shadow-float">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
            {label}
          </p>
          <ul className="max-h-64 overflow-y-auto">
            {requirements.map((requirement) => (
              <li key={requirement.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-[13px] leading-[1.5] text-ink/70 transition-colors duration-200 hover:bg-ink/[0.04]">
                  <input
                    type="checkbox"
                    checked={chosen.has(requirement.id)}
                    onChange={() => toggle(requirement.id)}
                    className="mt-0.5 size-4 shrink-0 accent-[#2D52EB]"
                  />
                  <span>
                    <b className="font-semibold text-ink">{requirement.id}</b> {requirement.text}
                    {requirement.priority === "must" && (
                      <span className="ml-1.5 rounded-full bg-sky px-1.5 py-0.5 text-[10px] font-semibold text-ink/70">
                        must
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1 w-full cursor-pointer rounded-lg px-2 py-2 text-sm font-semibold text-ink/60
                       transition-colors duration-200 hover:bg-ink/5 hover:text-ink
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
