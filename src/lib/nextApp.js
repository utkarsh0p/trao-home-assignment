import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Mounting the built Next app inside this Express process is what makes the deploy a
 * single Render service (.claude/decisions.md). Next is deliberately NOT a dependency
 * of the root package.json — it is resolved out of frontend/node_modules so there is
 * exactly one version of it, the one the frontend was built with.
 */
const frontendDir = path.resolve(import.meta.dirname, '../../frontend');

/** True once `npm run build` has produced a production build in frontend/.next. */
export function hasFrontendBuild() {
  return existsSync(path.join(frontendDir, '.next', 'BUILD_ID'));
}

/** Prepares the Next server and returns its request handler. */
export async function createNextHandler() {
  const requireFromFrontend = createRequire(path.join(frontendDir, 'package.json'));
  const entry = pathToFileURL(requireFromFrontend.resolve('next')).href;

  // next's entry is CJS; the default export lands one or two levels deep depending on
  // how the package was transpiled.
  const mod = await import(entry);
  const createNextServer = mod.default?.default ?? mod.default ?? mod;

  const app = createNextServer({ dev: false, dir: frontendDir });
  await app.prepare();
  return app.getRequestHandler();
}
