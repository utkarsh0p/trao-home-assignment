"use client";

import { useState } from "react";
import BatchUpload from "@/components/new/BatchUpload";
import RequireAuth from "@/components/RequireAuth";
import SingleRoleForm from "@/components/new/SingleRoleForm";

const TABS = [
  { id: "single", label: "One role" },
  { id: "batch", label: "Several roles" },
];

export default function NewKit() {
  return (
    <RequireAuth>
      <Intake />
    </RequireAuth>
  );
}

function Intake() {
  const [tab, setTab] = useState("single");

  return (
    <section className="bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto w-full max-w-[680px]">
        <h1 className="text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-5xl">
          New prep kit
        </h1>
        <p className="mt-4 text-[15px] leading-[1.55] text-ink/60 sm:text-xl">
          Paste the posting itself &mdash; we never fetch it from a job board &mdash; and
          point us at the company.
        </p>

        <div
          role="tablist"
          aria-label="How many roles"
          className="mt-8 inline-flex gap-1 rounded-xl bg-ink/[0.04] p-1"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              type="button"
              id={`tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors
                          duration-200 focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-accent focus-visible:ring-offset-2 ${
                            tab === item.id
                              ? "bg-surface text-ink shadow-sm"
                              : "text-ink/60 hover:text-ink"
                          }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          className="mt-6"
        >
          {tab === "single" ? <SingleRoleForm /> : <BatchUpload />}
        </div>
      </div>
    </section>
  );
}
