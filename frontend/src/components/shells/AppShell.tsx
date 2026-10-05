import OfflineBanner from '@/components/common/OfflineBanner';
import ShellProvider from '@/components/shells/ShellProvider';
import SideNav from '@/components/shells/SideNav';
import { SidebarInset } from '@/components/ui/sidebar';

interface AppShellProps {
  children: React.ReactNode;
}

// The frame of every signed-in screen (BR-REC-177, 178): a fixed sidebar (icon-collapsed from 768 px,
// an off-canvas drawer below), the offline banner on top, and the content, the only part that scrolls.
// No auth gating here (layouts do not re-render on navigation); proxy.ts and the API are the guards.
// `data-slot="app-main"` is how the report card's print rules find the content (ReportPrintStyles).
export default function AppShell({ children }: AppShellProps) {
  return (
    <ShellProvider>
      <SideNav />
      <SidebarInset
        id="main"
        data-slot="app-main"
        className="min-w-0 max-md:has-[[data-slot=action-bar]]:pb-[calc(var(--actionbar-h)+env(safe-area-inset-bottom))]"
      >
        <OfflineBanner />
        {children}
      </SidebarInset>
    </ShellProvider>
  );
}
