import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminWelcome() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Admin</CardTitle>
        <CardDescription>Features appear here as modules are built.</CardDescription>
      </CardHeader>
    </Card>
  );
}
