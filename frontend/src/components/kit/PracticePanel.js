"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import InlineEdit from "@/components/kit/InlineEdit";
import { practiceStats } from "@/lib/kitDerive";
import * as api from "@/lib/api";

/**
 * Practice mode — §7. "A kit the user only reads is a document. Make it something they
 * can work through."
 *
 * The deck is ordered ONCE, at the start of a session, by the server
 * (kit.service.js orderForPractice: never-seen first, then least confident). Re-sorting
 * after every answer would make the card you just rated jump position underneath you;
 * §7 asks us to order the *next* session, so ordering is per-session, not per-card.
 *
 * The session holds only the ORDER — an array of ids — and reads each card's content
 * from the kit, which `mutate` keeps fresh. That is what lets a card be edited mid-run
 * without the screen going stale, and lets a card deleted elsewhere simply drop out
 * instead of rendering a ghost.
 */

const CONFIDENCE = [
  { value: 1, label: "No idea", tint: "bg-sand hover:bg-sand/70" },
  { value: 2, label: "Shaky", tint: "bg-sand/60 hover:bg-sand/40" },
  { value: 3, label: "Getting there", tint: "bg-ink/[0.04] hover:bg-ink/[0.08]" },
  { value: 4, label: "Solid", tint: "bg-mint/60 hover:bg-mint/40" },
  { value: 5, label: "Nailed it", tint: "bg-mint hover:bg-mint/70" },
];

export default function PracticePanel({ kit, mutate, onBrowse, session, setSession }) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rateError, setRateError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const kitId = kit._id;
  const stats = practiceStats(kit);

  // The session — the card ORDER and where we are in it — is owned by FlashcardsPanel, so
  // stepping out to browse and back does not silently restart the run at card one.
  const { order, index } = session;
  const setOrder = useCallback((value) => setSession({ order: value, index: 0 }), [setSession]);
  const setIndex = useCallback(
    (next) => setSession((prev) => ({ ...prev, index: next(prev.index) })),
    [setSession],
  );

  const applySession = useCallback(
    (cards) => {
      setSession({ order: cards.map((card) => card.id), index: 0 });
      setRevealed(false);
      setEditing(false);
      setError(null);
      setRateError(null);
    },
    [setSession],
  );

  // Same shape as useKit's loader: the promise settles outside the effect body. Only runs
  // when there is no session yet, so returning from browse resumes rather than reorders.
  useEffect(() => {
    if (order) return undefined;
    const controller = new AbortController();
    api
      .practiceNext(kitId, controller.signal)
      .then((result) => applySession(result.cards))
      .catch((cause) => {
        if (cause?.name === "AbortError") return;
        setError(cause);
      });
    return () => controller.abort();
  }, [kitId, order, attempt, applySession]);

  /**
   * "Practise again" / "Try again". Clearing the order is the whole implementation — the
   * effect above re-requests whenever there is no session, so the ratings just recorded
   * are reflected in the new ordering. Fetching here as well would race it.
   *
   * `attempt` is what makes the retry path work: after a failed load `order` is already
   * null, so clearing it again would not change the effect's deps and nothing would fire.
   */
  const restart = useCallback(() => {
    setError(null);
    setRateError(null);
    setOrder(null);
    setAttempt((value) => value + 1);
  }, [setOrder]);

  // Resolve the order against the kit, dropping anything deleted since the session began.
  const deck = useMemo(() => {
    if (!order) return null;
    const byId = new Map((kit.flashcards ?? []).map((card) => [card.id, card]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  }, [order, kit.flashcards]);

  const card = deck?.[index];
  const finished = Boolean(deck) && deck.length > 0 && index >= deck.length;

  const rate = useCallback(
    async (confidence) => {
      if (!card || saving) return;
      setSaving(true);
      setRateError(null);
      try {
        await mutate(() => api.recordConfidence(kitId, card.id, confidence));
        setIndex((value) => value + 1);
        setRevealed(false);
        setEditing(false);
      } catch {
        // Stay on the card so the rating isn't lost — and say so HERE. The kit-level
        // callout renders at the top of the content column, off-screen mid-deck.
        setRateError("That rating didn't save. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [card, kitId, mutate, saving, setIndex],
  );

  const back = useCallback(() => {
    setIndex((value) => Math.max(0, value - 1));
    setRevealed(false);
    setEditing(false);
    setRateError(null);
  }, [setIndex]);

  const patchCard = (body) => mutate(() => api.updateFlashcard(kitId, card.id, body));

  useKeyboard({ active: Boolean(card), revealed, setRevealed, rate, back, canGoBack: index > 0 });

  if (error) {
    return (
      <ErrorCallout title="Couldn't start a practice session." error={error}>
        <Button variant="secondary" size="sm" onClick={restart}>
          Try again
        </Button>
      </ErrorCallout>
    );
  }

  if (!deck) {
    return (
      <div className="mx-auto max-w-[680px]">
        <div className="h-64 animate-pulse rounded-2xl bg-ink/[0.04]" />
        <span className="sr-only">Loading your deck</span>
      </div>
    );
  }

  if (deck.length === 0) {
    return (
      <div className="mx-auto max-w-[520px] rounded-2xl border border-dashed border-ink/15 p-10 text-center">
        <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink">
          There is nothing to practise yet.
        </h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-ink/60">
          This kit has no cards yet. Write one by hand, or regenerate the deck.
        </p>
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" size="sm" onClick={onBrowse}>
            Browse all cards
          </Button>
        </div>
      </div>
    );
  }

  const requirementTotal = stats.practised.length + stats.notPractised.length;

  return (
    <div className="mx-auto max-w-[680px]">
      {finished ? (
        <Done stats={stats} onAgain={restart} />
      ) : (
        <>
          {/* A deck this small is usually the posting's fault, not a bug — say so rather
              than letting the user wonder. §10. Inside this branch so the finished screen
              doesn't stack three summaries on top of each other. */}
          {deck.length <= 2 && (
            <p className="mb-6 rounded-2xl bg-sand p-4 text-[15px] leading-[1.6] text-ink/70">
              <b className="font-semibold text-ink">
                A short deck — {deck.length} card{deck.length === 1 ? "" : "s"}.
              </b>{" "}
              Cards are written from what the posting actually asked for, and this one
              yielded {requirementTotal} requirement{requirementTotal === 1 ? "" : "s"}. The
              Company tab says what was and wasn&rsquo;t found.
            </p>
          )}

          <Progress index={index} total={deck.length} />

          {/* The card changes under the user with no page move; announce where they are. */}
          <p aria-live="polite" className="sr-only">
            Card {index + 1} of {deck.length}
          </p>

          <div className="mt-5 rounded-2xl border border-ink/10 bg-surface p-6 shadow-lifted sm:p-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
              Card {index + 1} of {deck.length}
            </p>

            {editing ? (
              <div className="mt-3">
                <InlineEdit
                  label="the prompt on this card"
                  value={card.front}
                  onCommit={(front) => patchCard({ front })}
                  textClassName="text-xl font-semibold leading-[1.35] tracking-[-0.02em] text-ink sm:text-2xl"
                />
              </div>
            ) : (
              <p className="mt-4 text-xl font-semibold leading-[1.35] tracking-[-0.02em] text-ink sm:text-2xl">
                {card.front}
              </p>
            )}

            {revealed ? (
              <div className="mt-6 border-t border-ink/10 pt-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
                    Answer
                  </p>
                  {/* The honest moment to fix a card is the one you are looking at. */}
                  <button
                    type="button"
                    onClick={() => setEditing((value) => !value)}
                    aria-pressed={editing}
                    className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-ink/50
                               transition-colors duration-200 hover:bg-ink/5 hover:text-ink
                               focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-accent focus-visible:ring-offset-1"
                  >
                    {editing ? "Done editing" : "Edit card"}
                  </button>
                </div>

                {editing ? (
                  <InlineEdit
                    label="the answer on this card"
                    value={card.back}
                    placeholder="No answer yet — write one."
                    onCommit={(back) => patchCard({ back })}
                    textClassName="text-[15px] leading-[1.6] text-ink/70 sm:text-base"
                    autoEdit
                  />
                ) : (
                  <p className="mt-2 text-[15px] leading-[1.6] text-ink/70 sm:text-base">
                    {card.back || "This card has no answer written yet."}
                  </p>
                )}

                <p className="mt-7 text-sm font-medium text-ink/60">How well did you know that?</p>
                {rateError && (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl bg-sand px-3.5 py-2.5 text-sm font-medium text-ink/70"
                  >
                    {rateError}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {CONFIDENCE.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={saving}
                      onClick={() => rate(option.value)}
                      className={`cursor-pointer rounded-xl px-2 py-3 text-[13px] font-semibold
                                  text-ink/70 transition-colors duration-200
                                  focus-visible:outline-none focus-visible:ring-2
                                  focus-visible:ring-accent focus-visible:ring-offset-2
                                  disabled:pointer-events-none disabled:opacity-50 ${option.tint}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-8">
                <Button variant="primary" onClick={() => setRevealed(true)}>
                  Show answer
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={back}
              disabled={index === 0}
              className="cursor-pointer rounded-lg px-2 py-1 text-sm font-medium text-ink/50
                         transition-colors duration-200 hover:text-ink focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                         disabled:pointer-events-none disabled:opacity-30"
            >
              &larr; Previous card
            </button>
            <p className="text-xs font-medium text-ink/35">
              Space to reveal &middot; 1&ndash;5 to rate &middot; &larr; to go back
            </p>
          </div>
        </>
      )}

      <Covered stats={stats} />
    </div>
  );
}

/** §7: "Show what has been covered and what has not" — by name, never by id. */
function Covered({ stats }) {
  const total = stats.practised.length + stats.notPractised.length;

  return (
    <section className="mt-10 border-t border-ink/10 pt-8">
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">What you&rsquo;ve covered</h3>
      {/* Lifetime, not this session — said out loud, because the progress bar directly
          above this counts only the current run and the two numbers disagree. */}
      <p className="mt-2 text-[15px] leading-[1.6] text-ink/60">
        Across every session so far: {stats.seen} of {stats.total} card
        {stats.total === 1 ? "" : "s"} practised
        {total > 0 &&
          `, covering ${stats.practised.length} of ${total} thing${total === 1 ? "" : "s"} the posting asks for`}
        .
      </p>

      {stats.notPractised.length > 0 && (
        <>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
            Not practised yet
          </p>
          <ul className="mt-3 flex max-w-[680px] flex-col gap-2">
            {stats.notPractised.map((requirement) => (
              <li
                key={requirement.id}
                className="flex gap-3 text-[15px] leading-[1.6] text-ink/60"
              >
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink/20" />
                {requirement.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Done({ stats, onAgain }) {
  // `shaky` is every low-rated card in the kit, not only the ones seen in this run — so
  // this says what the next session will lead with, and never claims how this one went.
  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-8 text-center shadow-lifted sm:p-10">
      <h3 className="text-2xl font-semibold tracking-[-0.035em] text-ink">Session finished.</h3>
      <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-[1.6] text-ink/60">
        {stats.shaky.length > 0
          ? `${stats.shaky.length} card${stats.shaky.length === 1 ? "" : "s"} you rated shaky or worse will come first next time.`
          : "Nothing is sitting at shaky or worse. The next round leads with whatever you have seen least."}
      </p>
      <div className="mt-7 flex justify-center">
        <Button variant="primary" size="sm" onClick={onAgain}>
          Practise again
        </Button>
      </div>
    </div>
  );
}

function Progress({ index, total }) {
  const pct = total === 0 ? 0 : Math.round((index / total) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={index}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label="Cards completed this session"
      className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * The whole session is runnable from the keyboard, which §12 asks for.
 *
 * Two different guards, because the two kinds of binding compete with different things:
 *
 *   * Space and Enter ACTIVATE a focused button or link. A shortcut that preventDefaults
 *     them would mean tabbing to "Previous card" and pressing Space reveals the answer
 *     instead of pressing the button — so these defer to any focused interactive element.
 *   * Digits and ArrowLeft activate nothing, so they only need to keep out of text entry.
 *
 * Going back and re-rating overwrites `confidence` and increments `timesSeen` again —
 * there is no un-rate endpoint. Acceptable: the ordering only reads the latest value.
 */
const TEXT_ENTRY = "input, textarea, select, [contenteditable='true']";
const ACTIVATABLE = `${TEXT_ENTRY}, button, a[href], summary, [tabindex]:not([tabindex='-1'])`;

function useKeyboard({ active, revealed, setRevealed, rate, back, canGoBack }) {
  useEffect(() => {
    if (!active) return undefined;

    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const matches = (selector) => Boolean(target?.closest?.(selector));

      if (event.key === " " || event.key === "Enter") {
        if (revealed || matches(ACTIVATABLE)) return;
        event.preventDefault();
        setRevealed(true);
        return;
      }

      if (matches(TEXT_ENTRY)) return;

      if (event.key === "ArrowLeft" && canGoBack) {
        event.preventDefault();
        back();
        return;
      }

      if (revealed && event.key >= "1" && event.key <= "5") {
        event.preventDefault();
        rate(Number(event.key));
      }
    }

    // Re-attached whenever the bindings change — `rate` closes over the current card.
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, revealed, setRevealed, rate, back, canGoBack]);
}
