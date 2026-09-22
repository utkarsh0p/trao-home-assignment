/**
 * Terminal error middleware. Every error reaching the client is shaped as
 * { error: { code, message } } so the frontend and the batch output share one
 * error vocabulary. Unexpected errors are logged in full but reported opaquely.
 */
export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  if (status >= 500) console.error(err);

  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'Something went wrong.' : err.message,
    },
  });
}

export function notFound(_req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
}

/** Throwable application error carrying a stable code the frontend can branch on. */
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
