"use client";

import { useState } from "react";
import Button from "@/components/Button";
import InlineEdit from "@/components/kit/InlineEdit";
import PinButton from "@/components/kit/PinButton";
import PracticePanel from "@/components/kit/PracticePanel";
import RegenerateButton from "@/components/kit/RegenerateButton";
import { sortedFlashcards } from "@/lib/kitDerive";
import * as api from "@/lib/api";

/**
 * One deck, two uses — the brief asks for both and never asks for two screens.
 *
 * Practising is what you open this for, so it is the default. Browsing exists for the
 * things you cannot do mid-session: adding a card by hand and deleting one (§6). Fixing
 * a card's wording happens in either place, but mostly on the card you are practising,
 * which is when you notice it is wrong.
 */
export default function FlashcardsPanel({ kit, mutate, refetch }) {
  const cards = sortedFlashcards(kit);
  const [view, setView] = useState("practise");

  // Owned here, not inside PracticePanel, so stepping out to browse a card and coming
  // back resumes the run instead of silently restarting it at card one.
  const [session, setSession] = useState({ order: null, index: 0 });
  const [regenerated, setRegenerated] = useState(false);

  // Regenerating replaces card ids mid-run. Left alone, the session's stored ids resolve
  // to nothing while the index stays put, so the user is teleported to a different card
  // or straight to "finished" with no explanation. Drop the session and say why.
  const onRegenerated = () => {
    setSession({ order: null, index: 0 });
    setRegenerated(true);
  };

  const practising = view === "practise";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
            {practising ? "Practice" : "All cards"}
            <span className="ml-3 text-base font-medium text-ink/50">{cards.length}</span>
          </h2>
          <p className="mt-2 max-w-[520px] text-[15px] leading-[1.6] text-ink/60">
            {practising
              ? "Least confident first, then whatever you have seen least."
              : "Everything in the deck. Add one, delete one, or fix the wording."}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {/* Hidden with an empty deck: there is nothing to practise, and the empty state
              already offers the only useful way out. Two of these on screen was the bug. */}
          {cards.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={!practising}
              onClick={() => setView(practising ? "browse" : "practise")}
            >
              {practising ? "Browse all cards" : "Back to practising"}
            </Button>
          )}
          <RegenerateButton
            kit={kit}
            section="flashcards"
            refetch={refetch}
            onRegenerated={onRegenerated}
            label="cards"
          />
        </div>
      </div>

      {/* Only while the replacement session is still untouched — once a card has been
          rated this is stale news, so it clears itself rather than needing a dismiss. */}
      {regenerated && practising && session.index === 0 && (
        <p className="mb-6 rounded-2xl bg-sand p-4 text-[15px] leading-[1.6] text-ink/70">
          <b className="font-semibold text-ink">The deck changed under your session.</b> These
          are new cards, so practice has started again from the top.
        </p>
      )}

      {practising ? (
        <PracticePanel
          kit={kit}
          mutate={mutate}
          onBrowse={() => setView("browse")}
          session={session}
          setSession={setSession}
        />
      ) : (
        <CardList kit={kit} cards={cards} mutate={mutate} />
      )}
    </div>
  );
}

function CardList({ kit, cards, mutate }) {
  const [openId, setOpenId] = useState(null);

  const patch = (card, body) => mutate(() => api.updateFlashcard(kit._id, card.id, body));
  const remove = (card) => mutate(() => api.deleteFlashcard(kit._id, card.id));

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-surface">
      {cards.length === 0 ? (
        <p className="px-5 py-8 text-center text-[15px] leading-[1.6] text-ink/60">
          No cards in this kit yet. Regenerate them, or write one by hand.
        </p>
      ) : (
        <ul className="divide-y divide-ink/[0.07]">
          {cards.map((card, index) => {
            const open = openId === card.id;
            const bodyId = `flashcard-body-${card.id}`;
            return (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : card.id)}
                  aria-expanded={open}
                  aria-controls={bodyId}
                  className="flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left
                             transition-colors duration-200 hover:bg-ink/[0.02]
                             focus-visible:outline-none focus-visible:ring-2
                             focus-visible:ring-accent focus-visible:ring-inset sm:px-6"
                >
                  <svg
                    viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`mt-1 size-3.5 shrink-0 text-ink/35 transition-transform
                                duration-200 ${open ? "rotate-90" : ""}`}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <span
                    className={`min-w-0 flex-1 text-[15px] font-semibold leading-[1.45] text-ink
                                sm:text-base ${open ? "" : "line-clamp-1"}`}
                  >
                    {card.front}
                  </span>
                </button>

                {open && (
                  <div id={bodyId} className="border-t border-ink/[0.07] px-4 pb-5 pt-4 sm:px-6">
                    <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
                      Prompt
                    </p>
                    <InlineEdit
                      label={`front of card ${index + 1}`}
                      value={card.front}
                      onCommit={(front) => patch(card, { front })}
                      textClassName="text-[15px] font-semibold leading-[1.5] text-ink"
                    />

                    <p className="mt-4 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
                      Answer
                    </p>
                    <InlineEdit
                      label={`back of card ${index + 1}`}
                      value={card.back}
                      placeholder="No answer yet — click to write one."
                      onCommit={(back) => patch(card, { back })}
                      textClassName="text-[15px] leading-[1.6] text-ink/70"
                    />

                    <div className="mt-5 flex items-center justify-end gap-1">
                      <PinButton
                        pinned={card.pinned}
                        label="this card"
                        onToggle={(pinned) => patch(card, { pinned })}
                      />
                      <button
                        type="button"
                        onClick={() => remove(card)}
                        aria-label="Delete this card"
                        title="Delete this card"
                        className="inline-flex size-8 cursor-pointer items-center justify-center
                                   rounded-lg text-ink/35 transition-colors duration-200
                                   hover:bg-[#DC2626]/10 hover:text-[#DC2626]
                                   focus-visible:outline-none focus-visible:ring-2
                                   focus-visible:ring-accent focus-visible:ring-offset-1"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none"
                             stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
                             strokeLinejoin="round">
                          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
        className="w-full cursor-pointer border-t border-ink/[0.07] px-4 py-3.5 text-left text-sm
                   font-semibold text-ink/50 transition-colors duration-200 hover:bg-ink/[0.02]
                   hover:text-ink focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-accent focus-visible:ring-inset sm:px-6"
      >
        + Add a card
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="border-t border-ink/[0.07] p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="card-front" className="mb-2 block text-sm font-medium text-ink/60">
            Prompt
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
            Answer
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
          Add card
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
