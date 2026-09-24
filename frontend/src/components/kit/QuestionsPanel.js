"use client";

import { useState } from "react";
import { Reorder } from "motion/react";
import Button from "@/components/Button";
import QuestionRow from "@/components/kit/QuestionRow";
import RegenerateButton from "@/components/kit/RegenerateButton";
import ResourceList from "@/components/kit/ResourceList";
import {
  CATEGORY_LABELS,
  resourcesByCategory,
  QUESTION_CATEGORIES,
  categoryEmptyReason,
  questionsByCategory,
} from "@/lib/kitDerive";
import * as api from "@/lib/api";

export default function QuestionsPanel({ kit, mutate, refetch, onNeedsSchedule }) {
  const groups = questionsByCategory(kit);
  const resources = resourcesByCategory(kit);

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

  // In the "All" view an empty category does not need a heading, a card, a Regenerate
  // button and an Add button to tell you it is empty — that was four of each stacked over
  // eight questions. It collapses to one line, and selecting its chip still opens the full
  // section with the reason and the add form.
  const shown =
    filter === "all"
      ? QUESTION_CATEGORIES.filter((c) => groups[c].length > 0)
      : QUESTION_CATEGORIES.filter((c) => c === filter);

  const collapsed =
    filter === "all" ? QUESTION_CATEGORIES.filter((c) => groups[c].length === 0) : [];

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
                <p className="px-5 py-8 text-center text-[15px] leading-[1.6] text-ink/50">
                  {/* The real reason, read off the kit — the requirements carry the
                      categories they can support, so "none were written" and "none were
                      called for" are different facts and we hold both. */}
                  {categoryEmptyReason(kit, category) ??
                    `No ${CATEGORY_LABELS[category].toLowerCase()} questions yet.`}
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

              <AddQuestion
                kit={kit}
                category={category}
                mutate={mutate}
                onNeedsSchedule={onNeedsSchedule}
              />

              {/* Only when there are some. A category with nothing found says nothing —
                  the one honest note about a missing search provider already lives on
                  the Company tab, and repeating it four times here would be a lecture. */}
              {resources[category].length > 0 && (
                <div className="border-t border-ink/[0.07] px-3 pb-3 pt-4 sm:px-4">
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
                    Watch and read
                  </p>
                  <ResourceList resources={resources[category]} />
                </div>
              )}
            </div>
          </section>
        ))}

        {collapsed.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-ink/10 pt-5 text-[15px] leading-[1.6] text-ink/50">
            <span>No questions in</span>
            {collapsed.map((category, index) => (
              <span key={category}>
                <button
                  type="button"
                  onClick={() => setFilter(category)}
                  className="cursor-pointer font-semibold text-ink/70 underline underline-offset-4
                             transition-colors duration-200 hover:text-ink focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {CATEGORY_LABELS[category].toLowerCase()}
                </button>
                {index < collapsed.length - 1 && ","}
              </span>
            ))}
            <span>&mdash; open one to see why, or to add your own.</span>
          </div>
        )}
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

/**
 * Adding a question by hand used to be a single textarea. It produced a stub: the API
 * fills `requirement_ids` with [], `answer_outline` with "" and difficulty with a silent
 * 2, none of which are visible anywhere — so the question sat in the list covering no
 * requirement, ranked by a difficulty nobody chose, and absent from the plan until the
 * user happened to visit the Schedule tab and read the orphan banner.
 *
 * So ask for what the question actually needs rather than defaulting it silently. The
 * fields are the explanation — the four paragraphs that used to caption them were the
 * form apologising for itself.
 */
function AddQuestion({ kit, category, mutate, onNeedsSchedule }) {
  const blank = { prompt: "", answer_outline: "", difficulty: 2, requirement_ids: [] };
  const [draft, setDraft] = useState(blank);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const requirements = kit?.role?.requirements ?? [];
  const set = (field) => (value) => setDraft((current) => ({ ...current, [field]: value }));

  const toggleRequirement = (id) =>
    setDraft((current) => ({
      ...current,
      requirement_ids: current.requirement_ids.includes(id)
        ? current.requirement_ids.filter((entry) => entry !== id)
        : [...current.requirement_ids, id],
    }));

  function close() {
    setOpen(false);
    setDraft(blank);
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.prompt.trim() || saving) return;

    setSaving(true);
    try {
      await mutate(() =>
        api.addQuestion(kit._id, {
          category,
          prompt: draft.prompt.trim(),
          answer_outline: draft.answer_outline.trim(),
          difficulty: draft.difficulty,
          requirement_ids: draft.requirement_ids,
        }),
      );
      // A new question is in no day until the plan is rebuilt. Say so here, where the
      // user just made the change, not on a tab they may never open.
      onNeedsSchedule?.();
      close();
    } finally {
      setSaving(false);
    }
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
      <label htmlFor={`add-${category}`} className="mb-1 block text-sm font-medium text-ink/60">
        New {CATEGORY_LABELS[category].toLowerCase()} question
      </label>
      <textarea
        id={`add-${category}`}
        value={draft.prompt}
        onChange={(event) => set("prompt")(event.target.value)}
        rows={3}
        autoFocus
        placeholder="What would you want to be asked?"
        className="w-full resize-y rounded-xl border border-ink/[0.07] bg-paper px-3.5 py-2.5
                   text-base text-ink placeholder:text-ink/35 focus:border-accent/40 sm:text-[15px]
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      />

      <label htmlFor={`outline-${category}`} className="mb-2 mt-5 block text-sm font-medium text-ink/60">
        How to answer it
      </label>
      <textarea
        id={`outline-${category}`}
        value={draft.answer_outline}
        onChange={(event) => set("answer_outline")(event.target.value)}
        rows={2}
        placeholder="The points you want to hit."
        className="w-full resize-y rounded-xl border border-ink/[0.07] bg-paper px-3.5 py-2.5
                   text-base text-ink placeholder:text-ink/35 focus:border-accent/40 sm:text-[15px]
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      />

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium text-ink/60">
          How hard is it?
        </legend>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTY_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              onClick={() => set("difficulty")(choice.value)}
              aria-pressed={draft.difficulty === choice.value}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors
                          duration-200 focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-accent focus-visible:ring-offset-2 ${
                            draft.difficulty === choice.value
                              ? "bg-sky text-ink/70"
                              : "bg-ink/[0.04] text-ink/60 hover:bg-ink/[0.08]"
                          }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      {requirements.length > 0 && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-ink/60">
            What does it test?
          </legend>
          <div className="flex flex-wrap gap-2">
            {requirements.map((requirement) => {
              const picked = draft.requirement_ids.includes(requirement.id);
              return (
                <button
                  key={requirement.id}
                  type="button"
                  onClick={() => toggleRequirement(requirement.id)}
                  aria-pressed={picked}
                  title={requirement.text}
                  className={`max-w-full cursor-pointer rounded-full px-3 py-1 text-left text-xs
                              font-semibold leading-[1.5] transition-colors duration-200 focus-visible:outline-none
                              focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                                picked
                                  ? "bg-mint text-ink/70"
                                  : "bg-ink/[0.04] text-ink/60 hover:bg-ink/[0.08]"
                              }`}
                >
                  {requirement.priority === "must" && <span aria-hidden="true">&#9679; </span>}
                  {requirement.text}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!draft.prompt.trim() || saving}>
          {saving ? "Adding\u2026" : "Add question"}
        </Button>
        <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const DIFFICULTY_CHOICES = [
  { value: 1, label: "Warm-up" },
  { value: 2, label: "Standard" },
  { value: 3, label: "Hard" },
];
