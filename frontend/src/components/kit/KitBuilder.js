"use client";

import { useState } from "react";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import RequireAuth from "@/components/RequireAuth";
import FlashcardsPanel from "@/components/kit/FlashcardsPanel";
import KitHeader from "@/components/kit/KitHeader";
import OverviewPanel from "@/components/kit/OverviewPanel";
import QuestionsPanel from "@/components/kit/QuestionsPanel";
import RolePanel from "@/components/kit/RolePanel";
import SchedulePanel from "@/components/kit/SchedulePanel";
import { useKit } from "@/lib/useKit";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "role", label: "Role" },
  { id: "questions", label: "Questions" },
  { id: "flashcards", label: "Flashcards" },
  { id: "schedule", label: "Schedule" },
];

export default function KitBuilder({ kitId }) {
  return (
    <RequireAuth>
      <Builder kitId={kitId} />
    </RequireAuth>
  );
}

function Builder({ kitId }) {
  const { kit, error, mutate, refetch, dismissError } = useKit(kitId);
  const [tab, setTab] = useState("overview");
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

      <div className="sticky top-20 z-30 border-b border-ink/10 bg-paper/85 backdrop-blur">
        <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-8 lg:px-12">
          <div role="tablist" aria-label="Kit sections" className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map((item) => (
              <button
                key={item.id}
                role="tab"
                type="button"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`shrink-0 cursor-pointer border-b-2 px-4 py-3 text-sm font-semibold
                            transition-colors duration-200 focus-visible:outline-none
                            focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                              tab === item.id
                                ? "border-accent text-ink"
                                : "border-transparent text-ink/60 hover:text-ink"
                            }`}
              >
                {item.label}
                {item.id === "schedule" && scheduleStale && (
                  <span
                    aria-label="needs rebuilding"
                    className="ml-2 inline-block size-1.5 rounded-full bg-accent align-middle"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Shell>
        {error && (
          <div className="mb-8">
            <ErrorCallout title="That change didn't save." error={error}>
              <Button variant="secondary" size="sm" onClick={dismissError}>
                Dismiss
              </Button>
            </ErrorCallout>
          </div>
        )}

        {tab === "overview" && (
          <OverviewPanel {...shared} onGoToRole={() => setTab("role")} />
        )}
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
            refetch={async () => {
              const next = await refetch();
              setScheduleStale(false);
              return next;
            }}
            onGoToQuestions={() => setTab("questions")}
          />
        )}
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
