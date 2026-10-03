import ThemeToggle from '@/components/common/ThemeToggle';
import LoginForm from '@/components/pages/auth/LoginForm';
import { Card, CardContent } from '@/components/ui/card';
import { DEFAULT_GYM_NAME } from '@/lib/messages/words';

interface LoginViewProps {
  next?: string;
  expired?: boolean;
}

// S1 Login (`/login`, the only screen without a sign-in). The same layout on every width: a card, centred,
// 400 px wide on desktop and edge to edge (16 px page padding) on a phone. The gym name is the default one:
// the real name comes from settings, which need a sign-in.
export default function LoginView({ next, expired }: LoginViewProps) {
  return (
    <main className="relative flex min-h-svh items-center justify-center p-4">
      <ThemeToggle className="absolute top-4 right-4 size-11" />
      <Card className="w-full max-w-[400px]">
        <CardContent className="flex flex-col gap-6">
          <header className="flex flex-col gap-1 text-center">
            <h1 className="font-heading text-2xl font-semibold">{DEFAULT_GYM_NAME}</h1>
            <p className="text-base text-muted-foreground">Sign in to continue</p>
          </header>
          <LoginForm next={next} expired={expired} />
        </CardContent>
      </Card>
    </main>
  );
}
