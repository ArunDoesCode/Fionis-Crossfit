import Image from 'next/image';
import ThemeToggle from '@/components/common/ThemeToggle';
import LoginForm from '@/components/pages/auth/LoginForm';
import { Card, CardContent } from '@/components/ui/card';
import { DEFAULT_GYM_NAME } from '@/lib/messages/words';

interface LoginViewProps {
  next?: string;
  expired?: boolean;
}

// The logo image (fionis-black-logo.jpg, 400 x 400). The h1 below carries the gym name for screen readers.
function Wordmark({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <Image
        src="/fionis-black-logo.jpg"
        alt=""
        width={100}
        height={100}
        unoptimized
        priority
        className="rounded-md"
      />
    </div>
  );
}

// S1 Login (`/login`, the only screen without a sign-in). From 1024 px it is split: the logo (shown whole, at its own size) is centred on black at the left,
// the form is at the right with "Coach desk" at its top. Below that, the single card:
// centred, 400 px wide on desktop and edge to edge (16 px page padding) on a phone, with the same wordmark
// above the form. The gym name is the default one: the real name comes from settings, which need a sign-in.
export default function LoginView({ next, expired }: LoginViewProps) {
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-2">
      <section
        aria-hidden="true"
        className="hidden items-center justify-center bg-black p-12 lg:flex"
      >
        <Image
          src="/fionis-black-logo.jpg"
          alt=""
          width={400}
          height={400}
          unoptimized
          priority
          className="h-auto w-full max-w-100"
        />
      </section>
      <div className="relative flex flex-col gap-4 items-center justify-center p-4 lg:bg-card">
        <ThemeToggle className="absolute top-4 right-4 size-[var(--control-height)]" />
        {/* <div className='gap-4'> */}
           <p className="font-heading text-4xl font-semibold text-primary lg:flex">
          Coach desk
        </p>
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

        {/* </div> */}
       
      </div>
    </main>
  );
}
