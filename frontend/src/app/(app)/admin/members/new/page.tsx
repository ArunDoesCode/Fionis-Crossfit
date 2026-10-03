import PlaceholderScreen from '@/components/common/PlaceholderScreen';
import { UI_TEXT } from '@/lib/messages/words';

// Placeholder until the members stream (B) builds S6. It also keeps `/admin/members/new` from
// matching the `[memberId]` route.
export default function AddMemberPage() {
  return (
    <PlaceholderScreen title={UI_TEXT.screens.addMember} width="narrow" backHref="/admin/members" />
  );
}
