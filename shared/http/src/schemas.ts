import { z } from 'zod';

/**
 * Standard error response schema.
 * Use in route `response:` blocks for error status codes.
 */
export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

/**
 * Wraps a data schema in a standard success envelope.
 *
 * @example
 * ```ts
 * response: {
 *   200: OkResponseSchema(z.object({ jobs: z.array(JobSchema) }))
 * }
 * ```
 */
export const OkResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    ok: z.literal(true),
    data,
  });

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
