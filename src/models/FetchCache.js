import mongoose from 'mongoose';

/**
 * Cleaned page text and search results keyed by URL, with a TTL index.
 *
 * Chosen over a LangGraph checkpointer (.claude/decisions.md): a crashed run is marked
 * failed on boot and retried from scratch, but skips the network, which is where the
 * ~90s goes. It also handles the duplicate-submission edge case for free, and avoids
 * pulling in a second mongodb driver version.
 */

const CACHE_TTL_SECONDS = 60 * 60 * 24;

const fetchCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ['page', 'search'], required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: CACHE_TTL_SECONDS },
  },
  { minimize: false },
);

export const FetchCache = mongoose.model('FetchCache', fetchCacheSchema);

/** Cache reads and writes never fail a run — a cache miss is always survivable. */
export async function readCache(key) {
  try {
    const hit = await FetchCache.findOne({ key }).lean();
    return hit ? hit.payload : null;
  } catch {
    return null;
  }
}

export async function writeCache(key, kind, payload) {
  try {
    await FetchCache.updateOne(
      { key },
      { key, kind, payload, createdAt: new Date() },
      { upsert: true },
    );
  } catch {
    /* ignore — caching is an optimisation, not a requirement */
  }
}

export default FetchCache;
