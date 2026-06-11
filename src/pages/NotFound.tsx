import { Link } from 'wouter';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFound({ location }: { location: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
      <div className="text-6xl font-bold text-muted-foreground/30">404</div>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This field hasn't been planted yet.</p>
      <p className="text-xs text-muted-foreground/70 font-mono">{location}</p>
      <Link href="/">
        <Button className="gap-2">
          <Home className="w-4 h-4" /> Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
