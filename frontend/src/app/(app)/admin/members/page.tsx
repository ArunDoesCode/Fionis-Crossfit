import MembersView from '@/components/views/members/MembersView';

// S5. The search text and the chip are in the URL (`?q=`, `?status=`), read by the client leaf under the
// route's loading.tsx.
export default function MembersPage() {
  return <MembersView />;
}
