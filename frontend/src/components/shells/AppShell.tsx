import OfflineBanner from '@/components/common/OfflineBanner';
import DirectoryWarmup from '@/components/providers/DirectoryWarmup';
import ShellProvider from '@/components/shells/ShellProvider';
import SideNav from '@/components/shells/SideNav';
import { SIDEBAR_STATE_CSS, SIDEBAR_STATE_SCRIPT } from '@/components/shells/sidebarState';
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
    <>
      {/* Saved sidebar state before first paint: no post-hydration collapse or shift. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant string, no user input; React would escape quotes in a text child */}
      <script dangerouslySetInnerHTML={{ __html: SIDEBAR_STATE_SCRIPT }} />
      <style>{SIDEBAR_STATE_CSS}</style>
      <ShellProvider>
        <DirectoryWarmup />
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
    </>
  );
}
