import OfflineBanner from '@/components/common/OfflineBanner';
import BottomTabBar from '@/components/shells/BottomTabBar';
import SideNav from '@/components/shells/SideNav';

interface AppShellProps {
  children: React.ReactNode;
}

// The frame of every signed-in screen (ux.md "App shell"): side bar from 1024 px, bottom tab bar
// below it, offline banner on top, content in the middle. No auth gating here (layouts do not re-render
// on navigation); proxy.ts and the API are the guards.
export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-svh bg-background lg:flex">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <main
          id="main"
          data-slot="app-main"
          className="flex-1 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] lg:pb-8 max-lg:has-[[data-slot=action-bar]]:pb-[calc(var(--tabbar-h)+var(--actionbar-h)+env(safe-area-inset-bottom))]"
        >
          {children}
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}
