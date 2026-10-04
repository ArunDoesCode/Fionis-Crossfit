import AddMemberView from '@/components/views/members/AddMemberView';

// S6. Its own route, so `/admin/members/new` is not read as a member id.
export default function AddMemberPage() {
  return <AddMemberView />;
}
