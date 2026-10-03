'use client';

import ThemeToggle from '@/components/common/ThemeToggle';
import LoginPlaceholder from '@/components/pages/login/LoginPlaceholder';

export default function LoginView() {
  return (
    <main className="relative flex min-h-svh items-center justify-center p-6">
      <ThemeToggle className="absolute top-4 right-4" />
      <LoginPlaceholder />
    </main>
  );
}
