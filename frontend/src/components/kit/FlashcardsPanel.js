"use client";

import { useState } from "react";
import Button from "@/components/Button";
import InlineEdit from "@/components/kit/InlineEdit";
import OriginBadge, { replaceabilityHint } from "@/components/kit/OriginBadge";
import PinButton from "@/components/kit/PinButton";
import RegenerateButton from "@/components/kit/RegenerateButton";
import RequirementPicker from "@/components/kit/RequirementPicker";
import { sortedFlashcards } from "@/lib/kitDerive";
import * as api from "@/lib/api";

export default function FlashcardsPanel({ kit, mutate, refetch }) {
  const cards = sortedFlashcards(kit);
  const requirements = kit.role?.requirements ?? [];

  const patch = (card, body) => mutate(() => api.updateFlashcard(kit._id, card.id, body));
  const remove = (card) => mutate(() => api.deleteFlashcard(kit._id, card.id));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[560px] text-[15px] leading-[1.6] text-ink/70">
          Short prompts to practise against. {cards.length} card
          {cards.length === 1 ? "" : "s"} &mdash; practice mode arrives in the next pass.
        </p>
        <RegenerateButton kit={kit} section="flashcards" refetch={refetch} label="flashcards" />
      </div>

      {cards.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-ink/15 p-8 text-center">
          <p className="text-[15px] leading-[1.6] text-ink/60">
            No flashcards in this kit yet.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className="rounded-2xl border border-ink/10 bg-surface p-4 shadow-lifted sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-ink/35">{card.id}</span>
                  <OriginBadge item={card} />
                  {card.timesSeen > 0 && (
                    <span className="rounded-full bg-ink/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-ink/50">
                      seen {card.timesSeen}&times;
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <PinButton
                    pinned={card.pinned}
                    label={`flashcard ${card.id}`}
                    onToggle={(pinned) => patch(card, { pinned })}
                  />
                  <button
                    type="button"
                    onClick={() => remove(card)}
                    aria-label={`Delete flashcard ${card.id}`}
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg
                               text-ink/35 transition-colors duration-200 hover:bg-[#DC2626]/10
                               hover:text-[#DC2626] focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-accent focus-visible:ring-offset-1"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none"
                         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
                    Front
                  </p>
                  <InlineEdit
                    label={`front of flashcard ${card.id}`}
                    value={card.front}
                    onCommit={(front) => patch(card, { front })}
                    textClassName="text-[15px] font-semibold leading-[1.5] text-ink"
                  />
                </div>
                <div>
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
                    Back
                  </p>
                  <InlineEdit
                    label={`back of flashcard ${card.id}`}
                    value={card.back}
                    placeholder="No answer yet — click to write one."
                    onCommit={(back) => patch(card, { back })}
                    textClassName="text-[15px] leading-[1.6] text-ink/70"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/50">
                    Covers
                  </span>
                  <RequirementPicker
                    label={`Requirements covered by ${card.id}`}
                    requirements={requirements}
                    selected={card.requirement_ids}
                    onChange={(requirement_ids) => patch(card, { requirement_ids })}
                  />
                </div>
                <span className="text-xs font-medium text-ink/35 sm:ml-auto">
                  {replaceabilityHint(card)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddFlashcard kit={kit} mutate={mutate} />
    </div>
  );
}

function AddFlashcard({ kit, mutate }) {
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!front.trim()) return;
    await mutate(() => api.addFlashcard(kit._id, { front: front.trim(), back: back.trim() }));
    setFront("");
    setBack("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full cursor-pointer rounded-xl border border-dashed border-ink/20 px-4 py-3
                   text-sm font-semibold text-ink/50 transition-colors duration-200
                   hover:border-ink/40 hover:text-ink focus-visible:outline-none
                   focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        + Add a flashcard
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-ink/10 bg-surface p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="card-front" className="mb-2 block text-sm font-medium text-ink/60">
            Front
          </label>
          <textarea
            id="card-front"
            value={front}
            onChange={(event) => setFront(event.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-y rounded-xl border border-ink/[0.07] bg-paper px-3.5 py-2.5
                       text-base text-ink focus:border-accent/40 focus:outline-none sm:text-[15px]
                       focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </div>
        <div>
          <label htmlFor="card-back" className="mb-2 block text-sm font-medium text-ink/60">
            Back
          </label>
          <textarea
            id="card-back"
            value={back}
            onChange={(event) => setBack(event.target.value)}
            rows={3}
            className="w-full resize-y rounded-xl border border-ink/[0.07] bg-paper px-3.5 py-2.5
                       text-base text-ink focus:border-accent/40 focus:outline-none sm:text-[15px]
                       focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!front.trim()}>
          Add flashcard
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
