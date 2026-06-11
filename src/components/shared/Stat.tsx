import { type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface StatProps {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  progress?: number;
  sub?: string;
}

export function Stat({ label, value, icon, progress, sub }: StatProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {progress !== undefined && <Progress value={progress} className="h-1 mt-2" />}
      </CardContent>
    </Card>
  );
}
