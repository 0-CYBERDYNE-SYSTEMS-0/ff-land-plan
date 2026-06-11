import { Apple, Flower, Flower2, Leaf, Sprout, Wheat } from 'lucide-react';
import type { CropCategory } from '@/types';

interface CropIconProps {
  category: CropCategory;
  className?: string;
  style?: React.CSSProperties;
}

const iconMap = {
  vegetable: Leaf,
  grain: Wheat,
  fruit: Apple,
  herb: Flower2,
  cover_crop: Sprout,
  flower: Flower,
} satisfies Record<CropCategory, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>;

export function CropIcon({ category, className, style }: CropIconProps) {
  const Icon = iconMap[category] ?? Leaf;
  return <Icon className={className} style={style} />;
}
