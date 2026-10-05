'use client';

import { useMemberDirectory } from '@/lib/api/members/queries';

// BR-REC-203: the shell opens with the member directory already on its way, so the first search is instant.
// Screens read the same query (same key), so this adds no second request.
export default function DirectoryWarmup() {
  useMemberDirectory();
  return null;
}
