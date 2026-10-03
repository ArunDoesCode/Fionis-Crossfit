'use client';

import { Toaster } from '@/components/ui/sonner';

// Sonner toasts (BR-REC-128, 137). The container is a polite live region, so a toast is announced
// when it appears. At the top of the screen so it never covers the action bar or the tabs, and 4 s
// so it can be read. Call `toast.success(...)` / `toast.error(...)` from mutation hooks; one plain sentence.
export default function Toasts() {
  return <Toaster position="top-center" duration={4000} visibleToasts={2} />;
}
