import { z } from 'zod';

const serverSchema = z.object({
  API_URL: z.url({ error: 'API_URL must be a valid URL' }),
});

// Server-only vars, kept apart from `lib/env.ts` so zod stays out of the browser bundle.
// Validated at startup from `instrumentation.ts`.
export function getServerEnv() {
  return serverSchema.parse({ API_URL: process.env.API_URL });
}
