import { z } from "zod";

const databaseName = (url: string): string | null => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
};

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    APP_ORIGIN: z.url(),
    /** Extra allowed CORS origins, comma separated. */
    APP_ORIGINS_EXTRA: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z.string().min(1),
    // Required for local dev/test runs; production deployments do not set it.
    DATABASE_URL_TEST: z.string().min(1).optional(),
    ACCESS_TOKEN_SECRET: z.string().min(32),
    REFRESH_TOKEN_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().positive().default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().positive().default(604800),
    /** Server-side limit of a sign-in without "Keep me signed in" (12 h, BR-REC-31). */
    SESSION_SHORT_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(43200),
    /**
     * How many proxies in front of the API append to `X-Forwarded-For` (BR-REC-38).
     * 0 = ignore the header and key the rate limit on the connecting address.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    // "test" is included because `bun test` sets NODE_ENV=test by default.
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  })
  .refine((v) => v.ACCESS_TOKEN_SECRET !== v.REFRESH_TOKEN_SECRET, {
    message:
      "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must not be identical",
    path: ["REFRESH_TOKEN_SECRET"],
  })
  .refine(
    (v) =>
      !/replace/i.test(v.ACCESS_TOKEN_SECRET) &&
      !/replace/i.test(v.REFRESH_TOKEN_SECRET),
    {
      message:
        "Token secrets look like placeholder values — replace them before running",
      path: ["ACCESS_TOKEN_SECRET"],
    },
  )
  .refine(
    (v) =>
      v.DATABASE_URL_TEST === undefined ||
      databaseName(v.DATABASE_URL_TEST)?.endsWith("_test") === true,
    {
      message:
        "DATABASE_URL_TEST must point at a database whose name ends in _test",
      path: ["DATABASE_URL_TEST"],
    },
  )
  .refine((v) => v.DATABASE_URL_TEST !== v.DATABASE_URL, {
    message: "DATABASE_URL_TEST must differ from DATABASE_URL",
    path: ["DATABASE_URL_TEST"],
  });

export const env = envSchema.parse(process.env);
