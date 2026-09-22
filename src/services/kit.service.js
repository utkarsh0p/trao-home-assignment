import mongoose from 'mongoose';

import { Kit } from '../models/Kit.js';
import { AppError } from '../middleware/errorHandler.js';
import { validateKit } from '../lib/kitSchema.js';

/**
 * Kit persistence and mutation.
 *
 * Every exported function takes userId first and scopes its query by it, so "users
 * read and modify only their own kits" (prd §3.1) is enforced in this one layer
 * rather than remembered in each controller.
 *
 * The edit-state model (.claude/decisions.md): each question, flashcard, the brief and
 * the schedule carry origin ('generated' | 'edited' | 'manual') and pinned. A
 * regeneration replaces only items that are still origin 'generated' and unpinned,
 * which is what makes "regenerate one section without discarding edits elsewhere"
 * (prd §3.6) fall out rather than require a diff.
 */

export const QUESTION_SECTIONS = ['technical', 'behavioural', 'system-design', 'company-fit'];

/** An item a regeneration is allowed to throw away. */
const isReplaceable = (item) => item.origin === 'generated' && !item.pinned;

/** Mints ids that cannot collide with anything already in the kit. */
export function mintIds(prefix, existing, count) {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const item of existing) {
    const match = pattern.exec(item.id ?? '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${max + 1 + i}`);
}

const nextOrder = (items) => items.reduce((max, item) => Math.max(max, item.order ?? 0), 0) + 1;

async function loadKit(userId, kitId) {
  // An unparseable id is a miss, not a 500 from Mongoose's cast.
  if (!mongoose.isValidObjectId(kitId)) {
    throw new AppError('KIT_NOT_FOUND', 'Kit not found.', 404);
  }

  const kit = await Kit.findOne({ _id: kitId, userId });
  // Someone else's kit is reported as missing rather than forbidden, so the endpoint
  // cannot be used to confirm that a given kit id exists.
  if (!kit) throw new AppError('KIT_NOT_FOUND', 'Kit not found.', 404);
  return kit;
}

function findItem(collection, id, label) {
  const item = collection.find((entry) => entry.id === id);
  if (!item) throw new AppError('ITEM_NOT_FOUND', `${label} "${id}" not found in this kit.`, 404);
  return item;
}

/** Hand-editing a generated item promotes it; a hand-made item stays hand-made. */
function markEdited(item) {
  if (item.origin === 'generated') item.origin = 'edited';
}

/* ------------------------------------------------------------------ kit lifecycle */

export async function listKits(userId) {
  return Kit.find({ userId })
    .sort({ createdAt: -1 })
    .select('title source.company source.role schedule.days_available coverage createdAt updatedAt')
    .lean();
}

export async function getKit(userId, kitId) {
  return loadKit(userId, kitId);
}

export async function deleteKit(userId, kitId) {
  const kit = await loadKit(userId, kitId);
  await kit.deleteOne();
  return { id: kitId };
}

/** The Appendix A projection, for export and for validation before persist. */
export async function exportKit(userId, kitId) {
  const kit = await loadKit(userId, kitId);
  return kit.toAppendixA();
}

/**
 * Writes a freshly generated kit. The kit is validated against the Appendix A schema
 * before anything is persisted (CLAUDE.md: validated before saved), so a malformed
 * model output never reaches the database.
 */
export async function persistKit(userId, { kit, notes = [], researchErrors = [], title = '', dedupeHash = '' }) {
  const { ok, issues } = validateKit(kit);
  if (!ok) {
    throw new AppError(
      'KIT_INVALID',
      `Generated kit failed structure validation: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
      422,
    );
  }

  return Kit.create({
    userId,
    title: title || `${kit.source.role || 'Role'} at ${kit.source.company || 'Company'}`,
    dedupeHash,
    source: kit.source,
    company_brief: { ...kit.company_brief, origin: 'generated', pinned: false },
    role: kit.role,
    questions: kit.questions.map((question, index) => ({
      ...question,
      order: index + 1,
      origin: 'generated',
      pinned: false,
    })),
    flashcards: kit.flashcards.map((flashcard, index) => ({
      ...flashcard,
      order: index + 1,
      origin: 'generated',
      pinned: false,
    })),
    schedule: { ...kit.schedule, origin: 'generated', pinned: false },
    coverage: kit.coverage,
    notes,
    researchErrors,
  });
}

/* --------------------------------------------------------------------- questions */

export async function addQuestion(userId, kitId, data) {
  const kit = await loadKit(userId, kitId);
  const [id] = mintIds('q', kit.questions, 1);

  kit.questions.push({
    id,
    requirement_ids: data.requirement_ids ?? [],
    category: data.category,
    prompt: data.prompt,
    answer_outline: data.answer_outline ?? '',
    difficulty: data.difficulty ?? 2,
    order: nextOrder(kit.questions),
    origin: 'manual',
    pinned: false,
  });

  await kit.save();
  return kit;
}

export async function updateQuestion(userId, kitId, questionId, patch) {
  const kit = await loadKit(userId, kitId);
  const question = findItem(kit.questions, questionId, 'Question');

  for (const field of ['prompt', 'answer_outline', 'category', 'difficulty', 'requirement_ids']) {
    if (patch[field] !== undefined) {
      question[field] = patch[field];
      markEdited(question);
    }
  }

  // Pinning is a statement about regeneration, not an edit to the content, so it
  // does not promote origin.
  if (patch.pinned !== undefined) question.pinned = patch.pinned;

  await kit.save();
  return kit;
}

export async function deleteQuestion(userId, kitId, questionId) {
  const kit = await loadKit(userId, kitId);
  findItem(kit.questions, questionId, 'Question');

  kit.questions = kit.questions.filter((question) => question.id !== questionId);
  // A deleted question must not linger in the plan, or the kit fails its own schema.
  kit.schedule.days.forEach((day) => {
    day.question_ids = day.question_ids.filter((id) => id !== questionId);
  });

  await kit.save();
  return kit;
}

/**
 * One call handles both reordering within a category and moving between categories,
 * because in the UI they are the same drag (prd §3.6). Only the questions named in
 * `moves` are touched.
 */
export async function reorderQuestions(userId, kitId, moves) {
  const kit = await loadKit(userId, kitId);

  for (const move of moves) {
    const question = findItem(kit.questions, move.id, 'Question');
    if (move.order !== undefined) question.order = move.order;
    // Moving a question to another category is a reclassification by hand, so it
    // counts as an edit and survives that category's next regeneration.
    if (move.category !== undefined && move.category !== question.category) {
      question.category = move.category;
      markEdited(question);
    }
  }

  await kit.save();
  return kit;
}

/* -------------------------------------------------------------------- flashcards */

export async function addFlashcard(userId, kitId, data) {
  const kit = await loadKit(userId, kitId);
  const [id] = mintIds('f', kit.flashcards, 1);

  kit.flashcards.push({
    id,
    front: data.front,
    back: data.back ?? '',
    requirement_ids: data.requirement_ids ?? [],
    order: nextOrder(kit.flashcards),
    origin: 'manual',
    pinned: false,
  });

  await kit.save();
  return kit;
}

export async function updateFlashcard(userId, kitId, flashcardId, patch) {
  const kit = await loadKit(userId, kitId);
  const flashcard = findItem(kit.flashcards, flashcardId, 'Flashcard');

  for (const field of ['front', 'back', 'requirement_ids']) {
    if (patch[field] !== undefined) {
      flashcard[field] = patch[field];
      markEdited(flashcard);
    }
  }
  if (patch.pinned !== undefined) flashcard.pinned = patch.pinned;

  await kit.save();
  return kit;
}

export async function deleteFlashcard(userId, kitId, flashcardId) {
  const kit = await loadKit(userId, kitId);
  findItem(kit.flashcards, flashcardId, 'Flashcard');

  kit.flashcards = kit.flashcards.filter((flashcard) => flashcard.id !== flashcardId);
  await kit.save();
  return kit;
}

/* ------------------------------------------------------------------------- brief */

export async function updateBrief(userId, kitId, patch) {
  const kit = await loadKit(userId, kitId);

  for (const field of ['summary', 'what_they_do', 'sources']) {
    if (patch[field] !== undefined) {
      kit.company_brief[field] = patch[field];
      markEdited(kit.company_brief);
    }
  }
  if (patch.pinned !== undefined) kit.company_brief.pinned = patch.pinned;

  await kit.save();
  return kit;
}

/* ---------------------------------------------------------------- practice mode */

/**
 * Confidence-weighted ordering (.claude/decisions.md): never-seen cards first, then
 * least confident. Deterministic and testable; SM-2 is overkill for an N-day horizon.
 */
export function orderForPractice(flashcards) {
  return [...flashcards].sort((a, b) => {
    const aSeen = a.confidence != null;
    const bSeen = b.confidence != null;
    if (aSeen !== bSeen) return aSeen ? 1 : -1;
    if (aSeen && a.confidence !== b.confidence) return a.confidence - b.confidence;
    const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

export async function recordConfidence(userId, kitId, flashcardId, confidence) {
  const kit = await loadKit(userId, kitId);
  const flashcard = findItem(kit.flashcards, flashcardId, 'Flashcard');

  flashcard.confidence = confidence;
  flashcard.timesSeen = (flashcard.timesSeen ?? 0) + 1;
  flashcard.lastSeenAt = new Date();

  await kit.save();
  return kit;
}

/** The next session's cards, plus the covered / not-covered picture prd §3.7 asks for. */
export async function practiceSession(userId, kitId) {
  const kit = await loadKit(userId, kitId);
  const cards = orderForPractice(kit.flashcards.map((f) => f.toObject()));

  const seen = cards.filter((card) => card.confidence != null);
  const requirementIds = new Set(kit.role.requirements.map((r) => r.id));
  const practisedRequirements = new Set(
    seen.flatMap((card) => card.requirement_ids).filter((id) => requirementIds.has(id)),
  );

  return {
    cards,
    stats: {
      total: cards.length,
      seen: seen.length,
      unseen: cards.length - seen.length,
      requirementsPractised: [...practisedRequirements],
      requirementsNotPractised: [...requirementIds].filter((id) => !practisedRequirements.has(id)),
    },
  };
}

/* ------------------------------------------------------- non-destructive regeneration */

/**
 * The rule the whole builder rests on: within the targeted section, replace only what
 * is still machine-generated and unpinned. Everything the user touched, pinned, or
 * wrote by hand survives, and no other section is read or written at all.
 *
 * Pure, and exported separately from the persistence wrapper so it can be tested
 * without a database.
 *
 * @returns {{ items, kept, replacedCount, skipped }}
 */
export function mergeRegenerated(existingItems, generatedItems, { prefix }) {
  const kept = existingItems.filter((item) => !isReplaceable(item));
  const replacedCount = existingItems.length - kept.length;

  const ids = mintIds(prefix, existingItems, generatedItems.length);
  let order = nextOrder(kept);

  const fresh = generatedItems.map((item, index) => ({
    ...item,
    id: ids[index],
    order: order++,
    origin: 'generated',
    pinned: false,
  }));

  return { items: [...kept, ...fresh], kept, replacedCount, skipped: false };
}

/**
 * Applies a regenerated section to a kit document.
 *
 * @param {string} section  a question category, 'flashcards', 'company_brief' or 'schedule'
 * @param {object|object[]} generated  the freshly generated payload for that section
 */
export async function applyRegeneratedSection(userId, kitId, section, generated) {
  const kit = await loadKit(userId, kitId);

  if (section === 'company_brief' || section === 'schedule') {
    const target = kit[section];
    // A brief the user rewrote, or pinned, is not overwritten — we report that we
    // left it alone rather than silently discarding their work.
    if (!isReplaceable(target)) {
      return { kit, skipped: true, replacedCount: 0 };
    }
    Object.assign(target, generated, { origin: 'generated', pinned: false });
    await kit.save();
    return { kit, skipped: false, replacedCount: 1 };
  }

  if (section === 'flashcards') {
    const merged = mergeRegenerated(
      kit.flashcards.map((f) => f.toObject()),
      generated,
      { prefix: 'f' },
    );
    kit.flashcards = merged.items;
    await kit.save();
    return { kit, skipped: false, replacedCount: merged.replacedCount };
  }

  if (!QUESTION_SECTIONS.includes(section)) {
    throw new AppError('UNKNOWN_SECTION', `Cannot regenerate unknown section "${section}".`, 400);
  }

  // Only this category is considered; questions in every other category are not
  // even read, let alone rewritten.
  const all = kit.questions.map((q) => q.toObject());
  const inCategory = all.filter((q) => q.category === section);
  const untouched = all.filter((q) => q.category !== section);

  const merged = mergeRegenerated(
    inCategory,
    generated.map((q) => ({ ...q, category: section })),
    { prefix: 'q' },
  );

  kit.questions = [...untouched, ...merged.items];

  // Questions that no longer exist must not remain in the plan.
  const liveIds = new Set(kit.questions.map((q) => q.id));
  kit.schedule.days.forEach((day) => {
    day.question_ids = day.question_ids.filter((id) => liveIds.has(id));
  });

  await kit.save();
  return { kit, skipped: false, replacedCount: merged.replacedCount };
}
