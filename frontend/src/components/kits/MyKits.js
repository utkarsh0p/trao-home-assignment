"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import ErrorCallout from "@/components/ErrorCallout";
import KitCard from "@/components/KitCard";
import { KitCardSkeletonGrid } from "@/components/KitCardSkeleton";
import RequireAuth from "@/components/RequireAuth";
import { deleteKit, listKits } from "@/lib/api";

export default function MyKits() {
  return (
    <RequireAuth>
      <KitLibrary />
    </RequireAuth>
  );
}

function KitLibrary() {
  const [result, setResult] = useState({ kits: null, error: null });
  const [query, setQuery] = useState("");
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    listKits(controller.signal)
      .then((kits) => setResult({ kits, error: null }))
      .catch((cause) => {
        if (cause?.name === "AbortError") return;
        setResult({ kits: null, error: cause });
      });

    return () => controller.abort();
  }, []);

  const { kits, error } = result;

  // The list endpoint has no pagination and returns everything, so filtering here costs
  // nothing and beats scrolling once there are a dozen kits.
  const visible = useMemo(() => {
    if (!kits) return null;
    const needle = query.trim().toLowerCase();
    if (!needle) return kits;
    return kits.filter((kit) =>
      [kit.source?.company, kit.source?.role, kit.title]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(needle)),
    );
  }, [kits, query]);

  async function onDelete(kit) {
    const previous = kits;
    // Optimistic: the card goes immediately, and comes back if the server disagrees.
    setResult({ kits: kits.filter((row) => row._id !== kit._id), error: null });
    setDeleteError(null);
    try {
      await deleteKit(kit._id);
    } catch (cause) {
      setResult({ kits: previous, error: null });
      setDeleteError(cause);
    }
  }

  return (
    <section className="bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto w-full max-w-[1320px]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-5xl">
              My kits
            </h1>
            {kits && kits.length > 0 && (
              <p className="mt-3 text-[15px] font-medium text-ink/50">
                {kits.length} kit{kits.length === 1 ? "" : "s"}, newest first.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {kits && kits.length > 1 && (
              <>
                <label htmlFor="kit-filter" className="sr-only">
                  Filter kits by company or role
                </label>
                <input
                  id="kit-filter"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by company or role"
                  className="h-11 w-full rounded-xl border border-ink/[0.07] bg-paper px-3.5 text-base sm:text-[15px]
                             text-ink placeholder:text-ink/35 transition-[border-color,box-shadow]
                             duration-200 focus:border-accent/40 focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-accent/30 sm:w-64"
                />
              </>
            )}
            <Button href="/new" variant="dark" size="sm" className="shrink-0">
              New kit
            </Button>
          </div>
        </div>

        {deleteError && (
          <div className="mt-8 max-w-[680px]">
            <ErrorCallout title="Couldn't delete that kit." error={deleteError} />
          </div>
        )}

        <div className="mt-10">
          {!kits && !error ? (
            <KitCardSkeletonGrid count={6} />
          ) : error ? (
            <div className="max-w-[680px]">
              <ErrorCallout title="We couldn't load your kits." error={error} />
            </div>
          ) : kits.length === 0 ? (
            <EmptyState
              title="No kits yet."
              actions={
                <Button href="/new" variant="primary" className="w-full sm:w-auto">
                  Create your first kit
                </Button>
              }
            >
              Paste a job description and a company website and primer. will do the
              reading &mdash; the posting text itself, though; we never fetch it from a
              job board.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nothing matches that."
              actions={
                <Button variant="secondary" onClick={() => setQuery("")} className="w-full sm:w-auto">
                  Clear the filter
                </Button>
              }
            >
              No kit mentions &ldquo;{query.trim()}&rdquo; in its company or role.
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {visible.map((kit) => (
                <KitCard key={kit._id} kit={kit} onDelete={onDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
