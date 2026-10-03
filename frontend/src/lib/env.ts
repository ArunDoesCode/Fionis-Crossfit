import { z } from 'zod';

// Client-visible env. Each NEXT_PUBLIC_* var must be read as a literal `process.env.X`
// so Next can inline it into the browser bundle.
// Same origin (D-018): a path such as `/api`. A full URL is still accepted (e.g. a separate API host).
const apiBaseUrl = z
  .union([z.url(), z.string().regex(/^\/(?!\/)/)], {
    error: 'NEXT_PUBLIC_API_URL must be a path like /api or a valid URL',
  })
  .transform((value) => value.replace(/\/+$/, ''));

const clientSchema = z.object({
  NEXT_PUBLIC_API_URL: apiBaseUrl,
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

const serverSchema = z.object({
  API_URL: z.url({ error: 'API_URL must be a valid URL' }),
});

// Server-only vars: read lazily so importing this module in client code never touches them.
// Validated at startup from `instrumentation.ts`.
export function getServerEnv() {
  return serverSchema.parse({ API_URL: process.env.API_URL });
}
