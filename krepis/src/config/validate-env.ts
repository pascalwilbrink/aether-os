import type { z } from 'zod';

/**
 * A `validate` function for `ConfigModule.forRoot` (docs/engineering.md):
 * parses the environment with the service's Zod schema at startup, so a
 * missing or invalid value stops the service with a clear message instead of
 * failing on first use. Values are never echoed, as some are secrets.
 */
export function validateEnv<S extends z.ZodType>(
  schema: S,
): (env: Record<string, unknown>) => z.infer<S> {
  return (env) => {
    const result = schema.safeParse(env);
    if (!result.success) {
      const problems = result.error.issues
        .map(
          (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
        )
        .join('\n');
      throw new Error(`Invalid configuration:\n${problems}`);
    }
    return result.data;
  };
}
