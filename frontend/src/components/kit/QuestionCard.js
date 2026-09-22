"use client";

import { Reorder, useDragControls } from "motion/react";
import InlineEdit from "@/components/kit/InlineEdit";
import OriginBadge, { replaceabilityHint } from "@/components/kit/OriginBadge";
import PinButton from "@/components/kit/PinButton";
import RequirementPicker from "@/components/kit/RequirementPicker";
import { CATEGORY_LABELS, QUESTION_CATEGORIES } from "@/lib/kitDerive";

const DIFFICULTY_LABELS = { 1: "Warm-up", 2: "Standard", 3: "Hard" };

export default function QuestionCard({
  question,
  requirements,
  index,
  count,
  onPatch,
  onDelete,
  onMove,
  onMoveCategory,
  onDragEnd,
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={question}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="rounded-2xl border border-ink/10 bg-surface p-4 shadow-lifted sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            onPointerDown={(event) => controls.start(event)}
            aria-hidden="true"
            title="Drag to reorder"
            className="cursor-grab touch-none text-ink/25 transition-colors duration-200 hover:text-ink/50 active:cursor-grabbing"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
              <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
            </svg>
          </span>
          <span className="font-mono text-[11px] font-semibold text-ink/35">{question.id}</span>
          <OriginBadge item={question} />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* The keyboard path. Not a fallback for drag — the only path without a mouse. */}
          <IconButton
            label={`Move question up`}
            disabled={index === 0}
            onClick={() => onMove(question, -1)}
            path="M12 19V5M6 11l6-6 6 6"
          />
          <IconButton
            label={`Move question down`}
            disabled={index === count - 1}
            onClick={() => onMove(question, 1)}
            path="M12 5v14M6 13l6 6 6-6"
          />
          <PinButton
            pinned={question.pinned}
            label={`question ${question.id}`}
            onToggle={(pinned) => onPatch(question, { pinned })}
          />
          <IconButton
            label={`Delete question ${question.id}`}
            onClick={() => onDelete(question)}
            destructive
            path="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"
          />
        </div>
      </div>

      <InlineEdit
        label={`prompt for question ${question.id}`}
        value={question.prompt}
        onCommit={(prompt) => onPatch(question, { prompt })}
        className="mt-3"
        textClassName="text-[17px] font-semibold leading-[1.4] tracking-[-0.02em] text-ink"
      />

      <div className="mt-2">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
          Answer outline
        </p>
        <InlineEdit
          label={`answer outline for question ${question.id}`}
          value={question.answer_outline}
          placeholder="No outline yet — click to write one."
          onCommit={(answer_outline) => onPatch(question, { answer_outline })}
          textClassName="text-[15px] leading-[1.6] text-ink/70"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-ink/10 pt-4">
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/50">
          Difficulty
          <select
            value={question.difficulty ?? 2}
            onChange={(event) => onPatch(question, { difficulty: Number(event.target.value) })}
            aria-label={`Difficulty for question ${question.id}`}
            className="cursor-pointer rounded-lg border border-ink/[0.07] bg-paper px-2 py-1 text-xs
                       font-semibold normal-case tracking-normal text-ink/70 focus:border-accent/40
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            {[1, 2, 3].map((level) => (
              <option key={level} value={level}>
                {level} · {DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/50">
          Category
          <select
            value={question.category}
            onChange={(event) => onMoveCategory(question, event.target.value)}
            aria-label={`Category for question ${question.id}`}
            className="cursor-pointer rounded-lg border border-ink/[0.07] bg-paper px-2 py-1 text-xs
                       font-semibold normal-case tracking-normal text-ink/70 focus:border-accent/40
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            {QUESTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/50">
            Covers
          </span>
          <RequirementPicker
            label={`Requirements covered by ${question.id}`}
            requirements={requirements}
            selected={question.requirement_ids}
            onChange={(requirement_ids) => onPatch(question, { requirement_ids })}
          />
        </div>
      </div>

      <p className="mt-3 px-2 text-xs font-medium text-ink/35">
        {replaceabilityHint(question)}
      </p>
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
                  disabled:pointer-events-none disabled:opacity-25 ${
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
