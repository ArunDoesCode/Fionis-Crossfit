import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPlaceholder() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>The sign-in form arrives with the auth module.</CardDescription>
      </CardHeader>
    </Card>
  );
}
