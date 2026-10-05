export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getServerEnv } = await import('@/lib/envServer');
    getServerEnv(); // fail fast on missing/invalid server env
  }
}
