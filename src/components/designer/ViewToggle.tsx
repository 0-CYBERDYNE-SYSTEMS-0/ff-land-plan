import { Box, Layers } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ViewMode = 'blueprint' | 'world';

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-background p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange('blueprint')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
          mode === 'blueprint'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        aria-pressed={mode === 'blueprint'}
      >
        <Layers className="w-4 h-4" />
        Blueprint
      </button>
      <button
        type="button"
        onClick={() => onChange('world')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
          mode === 'world'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        aria-pressed={mode === 'world'}
      >
        <Box className="w-4 h-4" />
        World
      </button>
    </div>
  );
}
