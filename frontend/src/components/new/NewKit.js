"use client";

import RequireAuth from "@/components/RequireAuth";
import SingleRoleForm from "@/components/new/SingleRoleForm";

export default function NewKit() {
  return (
    <RequireAuth>
      <Intake />
    </RequireAuth>
  );
}

function Intake() {
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

        <div className="mt-8">
          <SingleRoleForm />
        </div>
      </div>
    </section>
  );
}
