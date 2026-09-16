import { useEffect, useRef, useState } from 'react';
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
import { ArrowLeft, Loader2, MapPin, Save, Search, Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import { estimateFrostDates, isValidMonthDay } from '@/lib/frost';
import { searchPlaces, type GeocodeResult } from '@/lib/geocode';
import type { SoilType } from '@/types';

const soilTypes: SoilType[] = ['loam', 'clay', 'sandy', 'silt', 'peat', 'chalky'];

const schema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional().nullable(),
  lat: z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  lng: z.coerce.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  elevationM: z.coerce.number().optional().nullable(),
  areHa: z.coerce.number().positive('Area must be greater than 0'),
  soilType: z.enum(soilTypes as [SoilType, ...SoilType[]]).optional().nullable(),
  lastFrost: z
    .string()
    .refine((v) => v === '' || isValidMonthDay(v), 'Use MM-DD, e.g. 04-15')
    .optional()
    .nullable(),
  firstFrost: z
    .string()
    .refine((v) => v === '' || isValidMonthDay(v), 'Use MM-DD, e.g. 10-15')
    .optional()
    .nullable(),
});

type FormValues = z.infer<typeof schema>;

export function FarmForm({ farmId }: { farmId?: number }) {
  const navigate = useNavigation();
  const isEdit = !!farmId;
  const { data: farm, isLoading } = useFarm(farmId);
  const createFarm = useCreateFarm();
  const updateFarm = useUpdateFarm();
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<GeocodeResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);

  const defaultFrost = estimateFrostDates(45.5231, 0);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      lat: 45.5231,
      lng: -122.6765,
      elevationM: 0,
      areHa: 1,
      soilType: 'loam',
      lastFrost: defaultFrost.lastFrost ?? '',
      firstFrost: defaultFrost.firstFrost ?? '',
    },
  });

  // CRIT-001 guards: a rapid re-Enter during the sub-second window after a
  // valid submit (React's onSubmit already detached mid-unmount, the <form>
  // still connected) fires a NATIVE submission that unloads the document
  // mid-save — the proven trigger of the localStorage wipe. The capture-phase
  // listener below lives exactly as long as the <form> element itself, so no
  // implicit submission can ever navigate the tab; the ref guard stops the
  // logical double-create while the handler is still armed.
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const preventNativeSubmit = (e: SubmitEvent) => e.preventDefault();
    el.addEventListener('submit', preventNativeSubmit, true);
    return () => el.removeEventListener('submit', preventNativeSubmit, true);
  }, []);

  useEffect(() => {
    if (farm) {
      const fallbackFrost = estimateFrostDates(farm.lat, farm.elevationM ?? 0);
      form.reset({
        name: farm.name,
        description: farm.description ?? '',
        // Round for display: legacy stores hold Float32 artifacts like
        // 45.523101806640625 (audit X-008).
        lat: +farm.lat.toFixed(6),
        lng: +farm.lng.toFixed(6),
        elevationM: farm.elevationM ?? 0,
        areHa: +farm.areHa.toFixed(4),
        soilType: farm.soilType ?? 'loam',
        lastFrost: farm.lastFrost !== undefined ? farm.lastFrost ?? '' : fallbackFrost.lastFrost ?? '',
        firstFrost: farm.firstFrost !== undefined ? farm.firstFrost ?? '' : fallbackFrost.firstFrost ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm?.id]);

  const applyFrostEstimate = (lat = form.getValues('lat'), elevationM = form.getValues('elevationM') ?? 0) => {
    const frost = estimateFrostDates(lat, elevationM ?? 0);
    form.setValue('lastFrost', frost.lastFrost ?? '');
    form.setValue('firstFrost', frost.firstFrost ?? '');
    if (!frost.lastFrost || !frost.firstFrost) {
      toast.info('This latitude is treated as frost-free for calendar planning');
    }
  };

  const runPlaceSearch = async () => {
    if (placeQuery.trim().length < 2) return;
    try {
      setPlaceLoading(true);
      const results = await searchPlaces(placeQuery);
      setPlaceResults(results);
      if (results.length === 0) toast.info('No matching places found');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPlaceLoading(false);
    }
  };

  const applyPlace = (place: GeocodeResult) => {
    form.setValue('lat', Number(place.latitude.toFixed(4)));
    form.setValue('lng', Number(place.longitude.toFixed(4)));
    form.setValue('elevationM', place.elevation ?? 0);
    if (!form.getValues('name')) form.setValue('name', place.name);
    applyFrostEstimate(place.latitude, place.elevation ?? 0);
    setPlaceQuery(`${place.name}${place.admin1 ? `, ${place.admin1}` : ''}${place.country ? `, ${place.country}` : ''}`);
    setPlaceResults([]);
  };

  const submit = form.handleSubmit(async (values) => {
    if (submittedRef.current) return; // rapid re-Enter double-submit guard
    submittedRef.current = true;
    const payload = {
      name: values.name,
      description: values.description || null,
      lat: values.lat,
      lng: values.lng,
      elevationM: values.elevationM ?? null,
      areHa: values.areHa,
      soilType: values.soilType ?? null,
      lastFrost: values.lastFrost || null,
      firstFrost: values.firstFrost || null,
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
      submittedRef.current = false; // failed save: let the user retry
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
            {isEdit ? 'Update farm metadata' : 'Search a real place or enter coordinates manually.'}
          </p>
        </div>
      </div>

      <form ref={formRef} onSubmit={submit} className="space-y-4" noValidate>
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
            <div className="space-y-2">
              <Label className="text-xs">Place search</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        runPlaceSearch();
                      }
                    }}
                    placeholder="Town, city, or region"
                    className="h-8 pl-7 text-sm"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={runPlaceSearch} disabled={placeLoading}>
                  {placeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Search
                </Button>
              </div>
              {placeResults.length > 0 && (
                <div className="rounded-md border border-border bg-background p-1">
                  {placeResults.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => applyPlace(place)}
                      className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{place.name}</span>
                      <span className="text-muted-foreground">
                        {place.admin1 ? `, ${place.admin1}` : ''}{place.country ? `, ${place.country}` : ''}
                        {place.elevation !== null ? ` · ${Math.round(place.elevation)} m` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                  aria-invalid={form.formState.errors.lat ? true : undefined}
                  data-testid="input-lat"
                  {...form.register('lat')}
                />
                {form.formState.errors.lat && (
                  <p className="text-xs text-destructive">{form.formState.errors.lat.message}</p>
                )}
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
                  aria-invalid={form.formState.errors.lng ? true : undefined}
                  data-testid="input-lng"
                  {...form.register('lng')}
                />
                {form.formState.errors.lng && (
                  <p className="text-xs text-destructive">{form.formState.errors.lng.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="elevationM" className="text-xs">
                  Elevation (m)
                </Label>
                <Input
                  id="elevationM"
                  type="number"
                  step="1"
                  className="h-8 text-sm"
                  {...form.register('elevationM')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="areHa" className="text-xs">
                  Area (ha)
                </Label>
                <Input
                  id="areHa"
                  type="number"
                  step="0.1"
                  className="h-8 text-sm"
                  aria-invalid={form.formState.errors.areHa ? true : undefined}
                  data-testid="input-area"
                  {...form.register('areHa')}
                />
                {form.formState.errors.areHa && (
                  <p className="text-xs text-destructive">{form.formState.errors.areHa.message}</p>
                )}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Snowflake className="w-4 h-4 text-primary" />
              Frost dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lastFrost" className="text-xs">
                  Last spring frost
                </Label>
                <Input id="lastFrost" placeholder="MM-DD" className="h-8 text-sm" {...form.register('lastFrost')} />
                {form.formState.errors.lastFrost && (
                  <p className="text-xs text-destructive">{form.formState.errors.lastFrost.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firstFrost" className="text-xs">
                  First fall frost
                </Label>
                <Input id="firstFrost" placeholder="MM-DD" className="h-8 text-sm" {...form.register('firstFrost')} />
                {form.formState.errors.firstFrost && (
                  <p className="text-xs text-destructive">{form.formState.errors.firstFrost.message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Leave blank for frost-free climates; the planting calendar uses these dates.
              </p>
              <Button type="button" variant="outline" size="sm" className="h-8 whitespace-nowrap" onClick={() => applyFrostEstimate()}>
                Estimate from latitude
              </Button>
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
