"use client";

import { Reorder, useDragControls } from "motion/react";
import InlineEdit from "@/components/kit/InlineEdit";
import PinButton from "@/components/kit/PinButton";
import { CATEGORY_LABELS, QUESTION_CATEGORIES } from "@/lib/kitDerive";

/**
 * One question, as a row in a shared card rather than a card of its own.
 *
 * The controls are exactly §6's list and no more: edit the question, edit the answer
 * outline, reorder, move it to another category, delete it, pin it. Difficulty and the
 * requirement links stay in the kit — they rank the schedule and make coverage checkable
 * — but neither is something the brief asks a candidate to sit and adjust.
 *
 * Reordering stays on the closed row because it is a list-level action you repeat across
 * rows; pin and delete are item-level and live inside. Nothing is revealed by hover —
 * there is no hover on a phone, and §12 asks for one.
 */
export default function QuestionRow({
  question,
  index,
  count,
  open,
  onToggle,
  onPatch,
  onDelete,
  onMove,
  onMoveCategory,
  onDragEnd,
}) {
  const controls = useDragControls();
  const bodyId = `question-body-${question.category}-${question.id}`;

  return (
    <Reorder.Item
      value={question}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="bg-surface first:rounded-t-2xl last:rounded-b-2xl"
    >
      <div className="flex items-start gap-1 px-2 py-1 sm:px-3">
        <span
          onPointerDown={(event) => controls.start(event)}
          aria-hidden="true"
          title="Drag to reorder"
          className="mt-3 shrink-0 cursor-grab touch-none p-1 text-ink/20 transition-colors
                     duration-200 hover:text-ink/50 active:cursor-grabbing"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
            <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
          </svg>
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg py-3 pr-2
                     text-left transition-colors duration-200 hover:bg-ink/[0.02]
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg
            viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`mt-1 size-3.5 shrink-0 text-ink/35 transition-transform duration-200
                        ${open ? "rotate-90" : ""}`}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>

          <span
            className={`min-w-0 flex-1 text-[15px] font-semibold leading-[1.45] text-ink
                        sm:text-base ${open ? "" : "line-clamp-1"}`}
          >
            {question.prompt}
          </span>
        </button>

        {/* The keyboard path, and the only reorder path without a pointer. */}
        <div className="mt-2 flex shrink-0 items-center">
          <IconButton
            label="Move question up"
            disabled={index === 0}
            onClick={() => onMove(question, -1)}
            path="M12 19V5M6 11l6-6 6 6"
          />
          <IconButton
            label="Move question down"
            disabled={index === count - 1}
            onClick={() => onMove(question, 1)}
            path="M12 5v14M6 13l6 6 6-6"
          />
        </div>
      </div>

      {open && (
        <div id={bodyId} className="border-t border-ink/[0.07] px-4 pb-5 pt-4 sm:px-6">
          <InlineEdit
            label={`question ${index + 1}`}
            value={question.prompt}
            onCommit={(prompt) => onPatch(question, { prompt })}
            textClassName="text-[15px] font-semibold leading-[1.45] text-ink sm:text-base"
          />

          <p className="mt-4 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
            How to answer
          </p>
          <InlineEdit
            label={`answer outline for question ${index + 1}`}
            value={question.answer_outline}
            placeholder="No outline yet — click to write one."
            onCommit={(answer_outline) => onPatch(question, { answer_outline })}
            textClassName="text-[15px] leading-[1.6] text-ink/70"
          />

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/50">
              Move to
              <select
                value={question.category}
                onChange={(event) => onMoveCategory(question, event.target.value)}
                aria-label={`Category for question ${index + 1}`}
                className="cursor-pointer rounded-lg border border-ink/[0.07] bg-paper px-2 py-1
                           text-base font-semibold text-ink/70 focus:border-accent/40
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30
                           sm:text-xs"
              >
                {QUESTION_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <PinButton
                pinned={question.pinned}
                label="this question"
                onToggle={(pinned) => onPatch(question, { pinned })}
              />
              <IconButton
                label="Delete this question"
                onClick={() => onDelete(question)}
                destructive
                path="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"
              />
            </div>
          </div>
        </div>
      )}
    </Reorder.Item>
  );
}

function IconButton({ label, onClick, path, disabled, destructive }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-lg
                  transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-accent focus-visible:ring-offset-1
                  disabled:pointer-events-none disabled:opacity-20 ${
                    destructive
                      ? "text-ink/35 hover:bg-[#DC2626]/10 hover:text-[#DC2626]"
                      : "text-ink/35 hover:bg-ink/5 hover:text-ink"
                  }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none"
           stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
  );
}
