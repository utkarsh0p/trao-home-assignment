import { AppError } from './errorHandler.js';

/**
 * Runs a Zod schema over part of the request and replaces it with the parsed result,
 * so controllers receive validated, coerced data and stay free of checking logic.
 */
function validate(schema, property) {
  return (req, _res, next) => {
    const result = schema.safeParse(req[property]);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.') || property}: ${issue.message}`)
        .join('; ');
      return next(new AppError('VALIDATION_FAILED', detail, 400));
    }
    req[property] = result.data;
    return next();
  };
}

export const validateBody = (schema) => validate(schema, 'body');
export const validateQuery = (schema) => validate(schema, 'query');
