import ThemeToggle from '@/components/common/ThemeToggle';
import LoginForm from '@/components/pages/auth/LoginForm';
import { Card, CardContent } from '@/components/ui/card';
import { DEFAULT_GYM_NAME } from '@/lib/messages/words';

interface LoginViewProps {
  next?: string;
  expired?: boolean;
}

// The text wordmark: the orange "F" square, then the gym name in the heading font (BR-REC-235, no image).
function Wordmark({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary font-heading text-xl font-semibold text-primary-foreground"
      >
        F
      </span>
      <span className="font-heading text-2xl font-semibold">{DEFAULT_GYM_NAME}</span>
    </div>
  );
}

// S1 Login (`/login`, the only screen without a sign-in). From 1024 px it is split: a navy panel at the left
// with the wordmark and "Coach desk", the form on white at the right. Below that, the single card:
// centred, 400 px wide on desktop and edge to edge (16 px page padding) on a phone, with the same wordmark
// above the form. The gym name is the default one: the real name comes from settings, which need a sign-in.
export default function LoginView({ next, expired }: LoginViewProps) {
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-2">
      <section
        aria-hidden="true"
        className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex"
      >
        <Wordmark className="text-sidebar-foreground" />
        <p className="font-heading text-3xl font-semibold text-sidebar-accent-foreground">
          Coach desk
        </p>
      </section>
      <div className="relative flex items-center justify-center p-4 lg:bg-card">
        <ThemeToggle className="absolute top-4 right-4 size-[var(--control-height)]" />
        <Card className="w-full max-w-100 lg:bg-transparent lg:shadow-none!">
          <CardContent className="flex flex-col gap-6">
            <header className="flex flex-col items-center gap-3 text-center">
              <h1 className="sr-only">{DEFAULT_GYM_NAME}</h1>
              <Wordmark className="lg:hidden" />
              <p className="text-base text-muted-foreground">Sign in to continue</p>
            </header>
            <LoginForm next={next} expired={expired} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
