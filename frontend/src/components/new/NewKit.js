"use client";

import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import MultiRoleForm from "@/components/new/MultiRoleForm";
import SingleRoleForm from "@/components/new/SingleRoleForm";

export default function NewKit() {
  return (
    <RequireAuth>
      <Intake />
    </RequireAuth>
  );
}

const MODES = [
  { id: "one", label: "One role" },
  { id: "several", label: "Several roles" },
];

function Intake() {
  const [mode, setMode] = useState("one");

  return (
    <section className="bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto w-full max-w-[680px]">
        <h1 className="text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-5xl">
          New prep kit
        </h1>
        <p className="mt-4 text-[15px] leading-[1.55] text-ink/60 sm:text-xl">
          {mode === "one" ? (
            <>
              Paste the posting itself &mdash; we never fetch it from a job board &mdash;
              and point us at the company.
            </>
          ) : (
            <>
              Interviewing in a few places at once? Upload the postings as one file and we
              will build a kit for each.
            </>
          )}
        </p>

        {/* A tablist rather than two links: switching modes is a view change, and a
            half-typed posting should survive a curious click on the other tab. */}
        <div
          role="tablist"
          aria-label="How many roles"
          className="mt-8 inline-flex gap-1 rounded-xl bg-ink/[0.04] p-1"
        >
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={mode === item.id}
              aria-controls={`panel-${item.id}`}
              onClick={() => setMode(item.id)}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold
                          transition-[background-color,color,box-shadow] duration-200
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-accent focus-visible:ring-offset-2 ${
                            mode === item.id
                              ? "bg-surface text-ink shadow-soft"
                              : "text-ink/60 hover:text-ink"
                          }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted. Unmounting the single-role form would throw away a
            pasted description, and unmounting the multi-role one would lose a batch
            that is still being polled. */}
        <div
          role="tabpanel"
          id="panel-one"
          aria-labelledby="tab-one"
          hidden={mode !== "one"}
          className="mt-6"
        >
          <SingleRoleForm />
        </div>

        <div
          role="tabpanel"
          id="panel-several"
          aria-labelledby="tab-several"
          hidden={mode !== "several"}
          className="mt-6"
        >
          <MultiRoleForm />
        </div>
      </div>
    </section>
  );
}
