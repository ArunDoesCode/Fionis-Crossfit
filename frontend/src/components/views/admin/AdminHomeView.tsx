'use client';

import ThemeToggle from '@/components/common/ThemeToggle';
import AdminWelcome from '@/components/pages/admin/AdminWelcome';

export default function AdminHomeView() {
  return (
    <main className="relative p-6">
      <ThemeToggle className="absolute top-4 right-4" />
      <AdminWelcome />
    </main>
  );
}
