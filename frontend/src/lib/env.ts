// Client-visible env. Each NEXT_PUBLIC_* var must be read as a literal `process.env.X`
// so Next can inline it into the browser bundle. No zod here: this file is in every page's client bundle.
// Same origin (D-018): a path such as `/api`. A full URL is still accepted (e.g. a separate API host).
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!rawApiUrl || !(/^\/(?!\/)/.test(rawApiUrl) || URL.canParse(rawApiUrl))) {
  throw new Error('NEXT_PUBLIC_API_URL must be a path like /api or a valid URL');
}

export const clientEnv = {
  NEXT_PUBLIC_API_URL: rawApiUrl.replace(/\/+$/, ''),
};
