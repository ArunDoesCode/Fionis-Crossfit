import DueListView from '@/components/views/due/DueListView';

// S3. The tab and the assessment filter are in the URL (`?tab=overdue|soon&type=`), read by the client leaf
// under the route's loading.tsx.
export default function DueListPage() {
  return <DueListView />;
}
