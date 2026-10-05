import { ACTION_BAR_SLOT } from '@/components/common/ActionBar';
import { SidebarInset } from '@/components/ui/sidebar';
import { SIDEBAR_STATE_CSS, SIDEBAR_STATE_SCRIPT } from '@/lib/sidebarState';
import AdminSidebar from './_components/AdminSidebar';
import DirectoryWarmup from './_components/DirectoryWarmup';
import OfflineBanner from './_components/OfflineBanner';
import SidebarProvider from './_components/SidebarProvider';

// The frame of every signed-in screen (BR-REC-177, 178): a fixed sidebar (icon-collapsed from 768 px,
// an off-canvas drawer below), the offline banner on top, and the content, the only part that scrolls.
// No auth gating here (layouts do not re-render on navigation); proxy.ts and the API are the guards.
// `data-slot="app-main"` is how the report card's print rules find the content (ReportCardView).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Saved sidebar state before first paint: no post-hydration collapse or shift. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant string, no user input; React would escape quotes in a text child */}
      <script dangerouslySetInnerHTML={{ __html: SIDEBAR_STATE_SCRIPT }} />
      <style>{SIDEBAR_STATE_CSS}</style>
      <SidebarProvider>
        <DirectoryWarmup />
        <AdminSidebar />
        <SidebarInset
          id="main"
          data-slot="app-main"
          className="min-w-0 max-md:has-[[data-slot=action-bar]]:pb-actionbar"
        >
          <OfflineBanner />
          {children}
          {/* Where a form's phone Save bar is drawn: after the content, so it is last in tab order. */}
          <div id={ACTION_BAR_SLOT} />
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
