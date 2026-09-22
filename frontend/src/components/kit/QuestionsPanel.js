"use client";

import { useState } from "react";
import { Reorder } from "motion/react";
import Button from "@/components/Button";
import QuestionRow from "@/components/kit/QuestionRow";
import RegenerateButton from "@/components/kit/RegenerateButton";
import {
  CATEGORY_LABELS,
  QUESTION_CATEGORIES,
  questionsByCategory,
} from "@/lib/kitDerive";
import * as api from "@/lib/api";

export default function QuestionsPanel({ kit, mutate, refetch, onNeedsSchedule }) {
  const groups = questionsByCategory(kit);

  // One row open at a time, scoped by category because ids collide across them.
  const [openKey, setOpenKey] = useState(null);
  const [filter, setFilter] = useState("all");

  const patch = (question, body) =>
    mutate(() => api.updateQuestion(kit._id, question.id, body));

  const remove = (question) => mutate(() => api.deleteQuestion(kit._id, question.id));

  /**
   * `order` is absolute and integer-only — no fractional insertion — so on any reorder we
   * renumber the category densely from 1 and send only what changed. Partial moves are
   * the endpoint's designed behaviour, so untouched questions keep their values.
   */
  const commitOrder = (ordered, extra = {}) => {
    const moves = ordered
      .map((question, index) => ({ id: question.id, order: index + 1 }))
      .filter((move, index) => ordered[index].order !== move.order || extra[move.id])
      .map((move) => ({ ...move, ...(extra[move.id] ?? {}) }));

    if (moves.length === 0) return Promise.resolve();
    return mutate(() => api.reorderQuestions(kit._id, { moves }));
  };

  const nudge = (category) => (question, delta) => {
    const list = [...groups[category]];
    const from = list.findIndex((entry) => entry.id === question.id);
    const to = from + delta;
    if (to < 0 || to >= list.length) return;
    list.splice(to, 0, ...list.splice(from, 1));
    commitOrder(list);
  };

  /**
   * Moving between categories needs `order` as well as `category`: a category change on
   * its own leaves the old order value, which drops the question into the middle of its
   * new list.
   */
  const moveCategory = (question, category) => {
    if (category === question.category) return;
    const target = [...groups[category], { ...question, category }];
    setOpenKey(null);
    return commitOrder(target, { [question.id]: { category } });
  };

  const shown =
    filter === "all" ? QUESTION_CATEGORIES : QUESTION_CATEGORIES.filter((c) => c === filter);

  return (
    <div>
      {/* Sits under the horizontal tab bar below lg; at lg that bar is gone and the
          sidebar takes over, so this pins at the top and stays inside its column.
          Filtering to one category is what turns four stacked sections into one screen. */}
      <div className="sticky top-[3.25rem] z-20 -mx-5 mb-8 border-b border-ink/10 bg-paper px-5 py-3 sm:-mx-8 sm:px-8 lg:top-0 lg:mx-0 lg:px-0">
        <div className="flex gap-2 overflow-x-auto">
          <Chip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="All"
            count={kit.questions?.length ?? 0}
          />
          {QUESTION_CATEGORIES.map((category) => (
            <Chip
              key={category}
              active={filter === category}
              onClick={() => setFilter(category)}
              label={CATEGORY_LABELS[category]}
              count={groups[category].length}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-10">
        {shown.map((category) => (
          <section key={category}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
                {CATEGORY_LABELS[category]}
                <span className="ml-3 text-base font-medium text-ink/50">
                  {groups[category].length}
                </span>
              </h2>
              <RegenerateButton
                kit={kit}
                section={category}
                refetch={refetch}
                label={CATEGORY_LABELS[category].toLowerCase()}
                onRegenerated={() => {
                  setOpenKey(null);
                  onNeedsSchedule?.();
                }}
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-ink/10 bg-surface">
              {groups[category].length === 0 ? (
                <p className="px-5 py-8 text-center text-[15px] leading-[1.6] text-ink/60">
                  No {CATEGORY_LABELS[category].toLowerCase()} questions. The generator only
                  writes what the posting and the research justify &mdash; regenerate this
                  category, or add one by hand.
                </p>
              ) : (
                <CategoryList
                  category={category}
                  questions={groups[category]}
                  openKey={openKey}
                  setOpenKey={setOpenKey}
                  onPatch={patch}
                  onDelete={remove}
                  onNudge={nudge(category)}
                  onMoveCategory={moveCategory}
                  onCommitOrder={commitOrder}
                />
              )}

              <AddQuestion kit={kit} category={category} mutate={mutate} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold
                  transition-colors duration-200 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    active
                      ? "bg-ink text-white"
                      : "border border-ink/20 text-ink/60 hover:border-ink/40 hover:text-ink"
                  }`}
    >
      {label}
      <span className={`ml-2 tabular-nums ${active ? "text-white/60" : "text-ink/35"}`}>
        {count}
      </span>
    </button>
  );
}

/**
 * Owns the order while a drag is in flight. Reorder.Group fires onReorder on every swap,
 * so persisting there would mean a request per pixel of travel; the list moves locally and
 * the new order is sent once, on drop.
 */
function CategoryList({
  category,
  questions,
  openKey,
  setOpenKey,
  onPatch,
  onDelete,
  onNudge,
  onMoveCategory,
  onCommitOrder,
}) {
  const [dragging, setDragging] = useState(null);

  // The server is authoritative between drags; only the in-flight drag is local.
  const list = dragging ?? questions;

  return (
    <Reorder.Group
      axis="y"
      values={list}
      onReorder={setDragging}
      className="divide-y divide-ink/[0.07]"
    >
      {list.map((question, index) => {
        // Ids can collide across categories after a regeneration, because the server
        // mints them per category. Scope the key.
        const key = `${category}:${question.id}`;
        return (
          <QuestionRow
            key={key}
            question={question}
            index={index}
            count={list.length}
            open={openKey === key}
            onToggle={() => setOpenKey(openKey === key ? null : key)}
            onPatch={onPatch}
            onDelete={onDelete}
            onMove={onNudge}
            onMoveCategory={onMoveCategory}
            onDragEnd={async () => {
              const ordered = dragging;
              setDragging(null);
              if (ordered) await onCommitOrder(ordered);
            }}
          />
        );
      })}
    </Reorder.Group>
  );
}

function AddQuestion({ kit, category, mutate }) {
  const [prompt, setPrompt] = useState("");
  const [open, setOpen] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!prompt.trim()) return;
    await mutate(() => api.addQuestion(kit._id, { category, prompt: prompt.trim() }));
    setPrompt("");
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
        + Add a {CATEGORY_LABELS[category].toLowerCase()} question
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="border-t border-ink/[0.07] p-4 sm:p-6">
      <label htmlFor={`add-${category}`} className="mb-2 block text-sm font-medium text-ink/60">
        New {CATEGORY_LABELS[category].toLowerCase()} question
      </label>
      <textarea
        id={`add-${category}`}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={3}
        autoFocus
        placeholder="What would you want to be asked?"
        className="w-full resize-y rounded-xl border border-ink/[0.07] bg-paper px-3.5 py-2.5
                   text-base text-ink placeholder:text-ink/35 focus:border-accent/40 sm:text-[15px]
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      />
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!prompt.trim()}>
          Add question
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setPrompt(""); }}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
