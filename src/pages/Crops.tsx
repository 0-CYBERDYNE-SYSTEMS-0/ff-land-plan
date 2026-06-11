import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Apple,
  ChevronRight,
  Clock,
  Droplets,
  Flower2,
  Leaf,
  Plus,
  Search,
  Sprout,
  Sun,
  Thermometer,
  TrendingUp,
  Wheat,
  X,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CropIcon } from '@/components/crops/CropIcon';
import { EmptyState } from '@/components/shared/EmptyState';
import type { Crop, CropCategory } from '@/types';

const CATEGORIES: { value: CropCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Crops' },
  { value: 'vegetable', label: 'Vegetables' },
  { value: 'grain', label: 'Grains' },
  { value: 'fruit', label: 'Fruits' },
  { value: 'herb', label: 'Herbs' },
  { value: 'cover_crop', label: 'Cover Crops' },
];

const NITROGEN_TONE: Record<string, string> = {
  low: 'text-green-600',
  medium: 'text-yellow-600',
  high: 'text-red-500',
};
const SUN_TONE: Record<string, string> = {
  full: 'text-yellow-500',
  partial: 'text-orange-400',
  shade: 'text-slate-500',
};

function CropCard({ crop }: { crop: Crop }) {
  const [open, setOpen] = useState(false);
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setOpen((o) => !o)}
      data-testid={`card-crop-${crop.id}`}
    >
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: (crop.colorHex || '#4CAF50') + '22' }}
          >
            <CropIcon category={crop.category} className="w-4 h-4" style={{ color: crop.colorHex || '#4CAF50' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <div>
                <h3 className="font-semibold text-sm">{crop.name}</h3>
                {crop.scientificName && <p className="text-xs text-muted-foreground italic">{crop.scientificName}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Badge variant="secondary" className="text-xs capitalize">
                  {crop.category.replace('_', ' ')}
                </Badge>
                {crop.isCustom && (
                  <Badge variant="outline" className="text-xs">
                    Custom
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" /> {crop.growthDays}d
          </div>
          <div className={`flex items-center gap-1 ${NITROGEN_TONE[crop.nitrogenNeed] ?? ''}`}>
            <Leaf className="w-3 h-3" /> {crop.nitrogenNeed}N
          </div>
          <div className={`flex items-center gap-1 ${SUN_TONE[crop.sunRequirement ?? 'full'] ?? ''}`}>
            <Sun className="w-3 h-3" /> {crop.sunRequirement}
          </div>
        </div>
        {open && (
          <div className="border-t border-border pt-3 space-y-3">
            {crop.description && <p className="text-xs text-muted-foreground">{crop.description}</p>}
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Droplets, label: 'Water need', val: `${crop.waterNeedMmDay} mm/day`, color: 'text-blue-500' },
                { icon: TrendingUp, label: 'Yield', val: `${crop.yieldTonHa} t/ha`, color: 'text-green-600' },
                { icon: Thermometer, label: 'Temp range', val: `${crop.minTempC}–${crop.maxTempC}°C`, color: 'text-orange-500' },
                { icon: Sun, label: 'Sunlight', val: crop.sunRequirement ?? 'full', color: 'text-yellow-500' },
              ].map((s) => (
                <div key={s.label} className="bg-muted rounded-md px-2 py-1.5">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                    <s.icon className={`w-3 h-3 ${s.color}`} /> {s.label}
                  </div>
                  <div className="text-xs font-medium">{s.val}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SCHEMA = z.object({
  name: z.string().min(1),
  category: z.enum(['vegetable', 'grain', 'fruit', 'herb', 'cover_crop']),
  growthDays: z.coerce.number().min(1),
  waterNeedMmDay: z.coerce.number().min(0),
  yieldTonHa: z.coerce.number().min(0),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
type FormValues = z.infer<typeof SCHEMA>;

export function Crops() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CropCategory | 'all'>('all');
  const { data: crops = [], isLoading } = useQuery<Crop[]>({
    queryKey: ['crops'],
    queryFn: () => apiFetch.listCrops(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(SCHEMA),
    defaultValues: {
      name: '',
      category: 'vegetable',
      growthDays: 60,
      waterNeedMmDay: 5,
      yieldTonHa: 10,
      colorHex: '#4CAF50',
    },
  });

  const create = useMutation({
    mutationFn: (v: FormValues) =>
      apiFetch.createCrop({
        ...v,
        scientificName: null,
        nitrogenNeed: 'medium',
        sunRequirement: 'full',
        minTempC: 10,
        maxTempC: 30,
        description: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crops'] });
      toast.success('Crop added to library');
      setOpen(false);
      form.reset();
    },
  });

  const filtered = crops.filter((c) => {
    const matchesText = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.scientificName ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filter === 'all' || c.category === filter;
    return matchesText && matchesCategory;
  });

  const counts = crops.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Crop Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {crops.length} crops with growth models, water needs, and yield data
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen((v) => !v)} className="gap-1.5" data-testid="btn-add-crop">
          <Plus className="w-4 h-4" /> Add Custom Crop
        </Button>
      </div>

      {open && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">New Custom Crop</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={form.handleSubmit((v) => create.mutate(v))}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input {...form.register('name')} className="h-8 text-sm" data-testid="input-crop-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={form.watch('category')} onValueChange={(v) => form.setValue('category', v as CropCategory)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Growth days</Label>
                  <Input type="number" {...form.register('growthDays', { valueAsNumber: true })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Yield (t/ha)</Label>
                  <Input type="number" step="0.1" {...form.register('yieldTonHa', { valueAsNumber: true })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Water (mm/day)</Label>
                  <Input type="number" step="0.5" {...form.register('waterNeedMmDay', { valueAsNumber: true })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <input type="color" {...form.register('colorHex')} className="h-8 w-full rounded-md border border-input cursor-pointer" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={create.isPending} data-testid="btn-save-crop">
                  Save Crop
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search crops..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
            data-testid="input-crop-search"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilter(c.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === c.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {c.label}
              {c.value !== 'all' && counts[c.value] ? <span className="ml-1 opacity-70">{counts[c.value]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} crop{filtered.length !== 1 ? 's' : ''} {search || filter !== 'all' ? 'matching' : 'available'}
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CropCard key={c.id} crop={c} />
          ))}
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <EmptyState
          icon={<Leaf className="w-8 h-8 text-muted-foreground" />}
          title="No crops found"
          description="Try a different search or add a custom crop."
        />
      )}
    </div>
  );
}
