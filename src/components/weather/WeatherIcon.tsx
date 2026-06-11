import {
  Cloud,
  CloudRain,
  CloudSnow,
  Cloud as CloudSun,
  Sun,
  Zap,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

type IconProps = LucideProps;

// WMO weather code → icon. Subset covers the codes used in the seed data.
export function WeatherIcon({ code, ...rest }: { code: number } & IconProps) {
  if (code === 0 || code === 1) return <Sun {...rest} className={`text-yellow-500 ${rest.className ?? ''}`} />;
  if (code === 2 || code === 3) return <Cloud {...rest} className={`text-slate-400 ${rest.className ?? ''}`} />;
  if (code >= 45 && code <= 48) return <Cloud {...rest} className={`text-slate-500 ${rest.className ?? ''}`} />;
  if (code >= 51 && code <= 67) return <CloudRain {...rest} className={`text-blue-400 ${rest.className ?? ''}`} />;
  if (code >= 71 && code <= 77) return <CloudSnow {...rest} className={`text-blue-200 ${rest.className ?? ''}`} />;
  if (code >= 80 && code <= 82) return <CloudRain {...rest} className={`text-blue-500 ${rest.className ?? ''}`} />;
  if (code >= 95) return <Zap {...rest} className={`text-yellow-400 ${rest.className ?? ''}`} />;
  return <CloudSun {...rest} className={`text-slate-400 ${rest.className ?? ''}`} />;
}
