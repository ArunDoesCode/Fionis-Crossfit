import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import DueSections from '@/components/pages/home/DueSections';
import HomeSearch from '@/components/pages/home/HomeSearch';
import MembershipSections from '@/components/pages/home/MembershipSections';

// FRAME of Home (S2, `/admin`), owned by Stream 0. Order on a phone is BR-REC-101: Overdue, Due soon,
// Memberships ending, Recently ended, under the search field. From 1024 px: due sections left, membership
// sections right, 1080 px. The search and each side are slots (see the imports); the frame has no data calls.
export default function HomeView() {
  return (
    <Page width="wide">
      <PageHeader />
      <HomeSearch />
      <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:items-start">
        <div className="section-gap flex flex-col">
          <DueSections />
        </div>
        <div className="section-gap flex flex-col">
          <MembershipSections />
        </div>
      </div>
    </Page>
  );
}
