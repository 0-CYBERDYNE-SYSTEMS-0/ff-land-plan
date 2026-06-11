import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateFarm, useFarm, useUpdateFarm } from '@/hooks/useFarms';
import { useNavigation } from '@/hooks/useNavigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, MapPin, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { SoilType } from '@/types';

const soilTypes: SoilType[] = ['loam', 'clay', 'sandy', 'silt', 'peat', 'chalky'];

const schema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional().nullable(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  areHa: z.coerce.number().positive(),
  soilType: z.enum(soilTypes as [SoilType, ...SoilType[]]).optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

export function FarmForm({ farmId }: { farmId?: number }) {
  const navigate = useNavigation();
  const isEdit = !!farmId;
  const { data: farm, isLoading } = useFarm(farmId);
  const createFarm = useCreateFarm();
  const updateFarm = useUpdateFarm();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      lat: 45.5231,
      lng: -122.6765,
      areHa: 1,
      soilType: 'loam',
    },
  });

  useEffect(() => {
    if (farm) {
      form.reset({
        name: farm.name,
        description: farm.description ?? '',
        lat: farm.lat,
        lng: farm.lng,
        areHa: farm.areHa,
        soilType: farm.soilType ?? 'loam',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm?.id]);

  const submit = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      description: values.description || null,
      lat: values.lat,
      lng: values.lng,
      areHa: values.areHa,
      soilType: values.soilType ?? null,
    };
    try {
      if (isEdit && farmId) {
        await updateFarm.mutateAsync({ id: farmId, patch: payload });
        toast.success('Farm updated');
      } else {
        await createFarm.mutateAsync(payload);
        toast.success('Farm created');
      }
      navigate('/');
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  if (isEdit && isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{isEdit ? 'Edit Farm' : 'Add a Farm'}</h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? 'Update farm metadata' : 'Set the GPS anchor — the voxel terrain is generated from this point.'}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs">
                Farm name
              </Label>
              <Input
                id="name"
                className="h-8 text-sm"
                data-testid="input-farm-name"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs">
                Description
              </Label>
              <Textarea
                id="description"
                className="text-sm min-h-[60px]"
                placeholder="Optional — what makes this farm unique?"
                {...form.register('description')}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Location & area
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lat" className="text-xs">
                  Latitude
                </Label>
                <Input
                  id="lat"
                  type="number"
                  step="0.0001"
                  className="h-8 text-sm"
                  data-testid="input-lat"
                  {...form.register('lat')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lng" className="text-xs">
                  Longitude
                </Label>
                <Input
                  id="lng"
                  type="number"
                  step="0.0001"
                  className="h-8 text-sm"
                  data-testid="input-lng"
                  {...form.register('lng')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="areHa" className="text-xs">
                  Area (ha)
                </Label>
                <Input
                  id="areHa"
                  type="number"
                  step="0.1"
                  className="h-8 text-sm"
                  data-testid="input-area"
                  {...form.register('areHa')}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Soil type</Label>
                <Select
                  value={form.watch('soilType') ?? 'loam'}
                  onValueChange={(v) => form.setValue('soilType', v as SoilType)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {soilTypes.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            type="submit"
            className="gap-1.5"
            disabled={form.formState.isSubmitting}
            data-testid="btn-save-farm"
          >
            <Save className="w-4 h-4" />
            {form.formState.isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create farm'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
