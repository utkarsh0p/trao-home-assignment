import mongoose from 'mongoose';

/**
 * Cleaned page text, search results and curated resources, with a TTL index. Pages are
 * keyed by URL, searches by company, resources by role — so two kits for the same role
 * at different companies share every resource lookup.
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
    kind: { type: String, enum: ['page', 'search', 'resources'], required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: CACHE_TTL_SECONDS },
  },
  { minimize: false },
);

export const FetchCache = mongoose.model('FetchCache', fetchCacheSchema);

/**
 * True only when a query can actually reach the server.
 *
 * Without this, a cache call made with no live connection does not fail — mongoose
 * *buffers* it and rejects 10 seconds later. Measured: 10,010ms, every call. Across a
 * five-case batch that is minutes of pure waiting against a fifteen-minute budget, and
 * `npm run evaluate` is expected to run with no MONGODB_URI at all. Checking readyState
 * also covers the case a global `bufferCommands` flag cannot: a connection that opened
 * and then dropped mid-run.
 */
function isConnected() {
  return mongoose.connection.readyState === 1;
}

/** Cache reads and writes never fail a run — a cache miss is always survivable. */
export async function readCache(key) {
  if (!isConnected()) return null;

  try {
    const hit = await FetchCache.findOne({ key }).lean();
    return hit ? hit.payload : null;
  } catch {
    return null;
  }
}

export async function writeCache(key, kind, payload) {
  if (!isConnected()) return;

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
