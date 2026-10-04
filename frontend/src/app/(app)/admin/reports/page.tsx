import GymProgressView from '@/components/views/progress/GymProgressView';

// S13. The measurement and the filters are in the URL (`?metric=`, `?joinedFrom=` …), read by the client leaf
// under the route's loading.tsx.
export default function ReportsPage() {
  return <GymProgressView />;
}
