"use client";

import { useState } from "react";
import { Reorder } from "motion/react";
import Button from "@/components/Button";
import QuestionCard from "@/components/kit/QuestionCard";
import RegenerateButton from "@/components/kit/RegenerateButton";
import {
  CATEGORY_LABELS,
  QUESTION_CATEGORIES,
  questionsByCategory,
} from "@/lib/kitDerive";
import * as api from "@/lib/api";

export default function QuestionsPanel({ kit, mutate, refetch, onNeedsSchedule }) {
  const groups = questionsByCategory(kit);
  const requirements = kit.role?.requirements ?? [];

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
    return commitOrder(target, { [question.id]: { category } });
  };

  return (
    <div className="flex flex-col gap-10">
      <p className="max-w-[680px] text-[15px] leading-[1.6] text-ink/70">
        Every question names the requirements it covers, which is what makes coverage
        checkable rather than a matter of opinion. Edit anything in place; drag or use the
        arrows to reorder.
      </p>

      {QUESTION_CATEGORIES.map((category) => (
        <section key={category}>
          <div className="flex flex-wrap items-center justify-between gap-4">
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
              onRegenerated={onNeedsSchedule}
            />
          </div>

          {groups[category].length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-ink/15 p-6 text-center">
              <p className="text-[15px] leading-[1.6] text-ink/60">
                No {CATEGORY_LABELS[category].toLowerCase()} questions. The generator only
                writes what the posting and the research justify &mdash; regenerate this
                category, or add one by hand.
              </p>
            </div>
          ) : (
            <CategoryList
              category={category}
              questions={groups[category]}
              requirements={requirements}
              onPatch={patch}
              onDelete={remove}
              onNudge={nudge(category)}
              onMoveCategory={moveCategory}
              onCommitOrder={commitOrder}
            />
          )}

          <AddQuestion kit={kit} category={category} mutate={mutate} />
        </section>
      ))}
    </div>
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
  requirements,
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
      className="mt-4 flex flex-col gap-3"
    >
      {list.map((question, index) => (
        <QuestionCard
          // Ids can collide across categories after a regeneration, because the server
          // mints them per category. Scope the key.
          key={`${category}:${question.id}`}
          question={question}
          requirements={requirements}
          index={index}
          count={list.length}
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
      ))}
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
        className="mt-3 w-full cursor-pointer rounded-xl border border-dashed border-ink/20 px-4 py-3
                   text-sm font-semibold text-ink/50 transition-colors duration-200
                   hover:border-ink/40 hover:text-ink focus-visible:outline-none
                   focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        + Add a {CATEGORY_LABELS[category].toLowerCase()} question
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-2xl border border-ink/10 bg-surface p-4">
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
