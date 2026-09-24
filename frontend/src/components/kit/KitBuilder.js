"use client";

import { useState } from "react";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import RequireAuth from "@/components/RequireAuth";
import FlashcardsPanel from "@/components/kit/FlashcardsPanel";
import KitHeader, { ExportButton } from "@/components/kit/KitHeader";
import KitNav from "@/components/kit/KitNav";
import CompanyPanel from "@/components/kit/CompanyPanel";
import QuestionsPanel from "@/components/kit/QuestionsPanel";
import RolePanel from "@/components/kit/RolePanel";
import SchedulePanel from "@/components/kit/SchedulePanel";
import { useKit } from "@/lib/useKit";

export default function KitBuilder({ kitId }) {
  return (
    <RequireAuth>
      <Builder kitId={kitId} />
    </RequireAuth>
  );
}

function Builder({ kitId }) {
  const { kit, error, mutate, refetch, dismissError } = useKit(kitId);
  const [tab, setTab] = useState("company");
  const [scheduleStale, setScheduleStale] = useState(false);

  if (error && !kit) {
    return (
      <Shell>
        <ErrorCallout
          title={
            error.code === "KIT_NOT_FOUND" ? "We couldn't find that kit." : "Couldn't load the kit."
          }
          error={
            error.code === "KIT_NOT_FOUND"
              ? { ...error, message: "It may have been deleted, or it belongs to another account." }
              : error
          }
        >
          <Button href="/mykits" variant="secondary">
            Back to my kits
          </Button>
        </ErrorCallout>
      </Shell>
    );
  }

  if (!kit) {
    return (
      <Shell>
        <div className="flex flex-col gap-4">
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-ink/[0.04]" />
          <div className="h-5 w-1/3 animate-pulse rounded-lg bg-ink/[0.04]" />
          <div className="mt-6 h-40 animate-pulse rounded-2xl bg-ink/[0.04]" />
        </div>
        <span className="sr-only">Loading the kit</span>
      </Shell>
    );
  }

  const shared = { kit, mutate, refetch };

  return (
    <div className="bg-paper pb-20">
      <KitHeader kit={kit} />

      {/* Below lg only: at lg and up the sidebar in the shell takes over.
          Pins to the very top: the site header only sticks on the home page, so off the
          home page it has scrolled away by the time this bar lands.
          Solid fill: a translucent one let the panel text ghost through underneath. */}
      <div className="sticky top-0 z-30 border-b border-ink/10 bg-paper lg:hidden">
        <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-8 lg:px-12">
          <KitNav
            tab={tab}
            setTab={setTab}
            scheduleStale={scheduleStale}
            orientation="horizontal"
          />
        </div>
      </div>

      <Shell>
        {/* Narrow nav column, wide content column — deliberately not an even split.
            `self-start` keeps the grid from stretching the aside to the row height, which
            would leave `sticky` with nothing to travel through. `minmax(0,1fr)` lets the
            content column shrink so its overflow-x-auto children can scroll inside it. */}
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 xl:gap-12">
          <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
            <p className="mb-3 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-ink/60">
              Sections
            </p>
            <KitNav
              tab={tab}
              setTab={setTab}
              scheduleStale={scheduleStale}
              orientation="vertical"
            />
            <div className="mt-4 border-t border-ink/10 pt-3">
              <ExportButton kit={kit} className="px-2" />
            </div>
          </aside>

          <div className="min-w-0">
            {error && (
              <div className="mb-8">
                <ErrorCallout title="That change didn't save." error={error}>
                  <Button variant="secondary" size="sm" onClick={dismissError}>
                    Dismiss
                  </Button>
                </ErrorCallout>
              </div>
            )}

            {tab === "company" && <CompanyPanel {...shared} />}
            {tab === "role" && (
              <RolePanel kit={kit} onGoToQuestions={() => setTab("questions")} />
            )}
            {tab === "questions" && (
              <QuestionsPanel
                {...shared}
                // Regenerating a category leaves the new questions in no day and does not
                // recompute minutes, so flag the schedule as needing a rebuild.
                onNeedsSchedule={() => setScheduleStale(true)}
              />
            )}
            {tab === "flashcards" && <FlashcardsPanel {...shared} />}
            {tab === "schedule" && (
              <SchedulePanel
                kit={kit}
                mutate={mutate}
                refetch={async () => {
                  const next = await refetch();
                  setScheduleStale(false);
                  return next;
                }}
                onGoToQuestions={() => setTab("questions")}
                onPractise={() => setTab("flashcards")}
              />
            )}

            {/* Below lg the sidebar is hidden, so the export lives at the foot of the
                page — out of the way, rather than the loudest control in the header. */}
            <div className="mt-12 border-t border-ink/10 pt-4 lg:hidden">
              <ExportButton kit={kit} />
            </div>
          </div>
        </div>
      </Shell>
    </div>
  );
}

function Shell({ children }) {
  return (
    <section className="px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
      <div className="mx-auto w-full max-w-[1320px]">{children}</div>
    </section>
  );
}
