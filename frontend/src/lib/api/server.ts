import 'server-only';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/envServer';
import { createApi } from './client';

// Server Components / Route Handlers only. Forwards the incoming Cookie header; never cached.
// Call inside a <Suspense> boundary / under loading.tsx (cookies() is runtime data).
export const serverApi = createApi(
  getServerEnv().API_URL,
  async (): Promise<Record<string, string>> => {
    const cookieHeader = (await cookies()).toString();
    return cookieHeader ? { Cookie: cookieHeader } : {};
  },
);
