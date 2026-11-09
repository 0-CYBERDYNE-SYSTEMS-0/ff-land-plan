import type { Environment, EnvironmentLayout, SiteEdge } from '@/types';

const isHorizontal = (edge: SiteEdge) => edge === 'north' || edge === 'south';

function edgeLength(environment: Environment, edge: SiteEdge): number {
  return isHorizontal(edge) ? environment.widthM : environment.heightM;
}

/** Move the first profile opening and its edge-bound reservations together. */
export function layoutWithAccessOnEdge(environment: Environment, edge: SiteEdge): EnvironmentLayout | undefined {
  const layout = environment.layout;
  const first = layout?.access[0];
  if (!layout || !first || first.edge === edge) return layout;

  const oldLength = edgeLength(environment, first.edge);
  const newLength = edgeLength(environment, edge);
  const scale = oldLength > 0 ? newLength / oldLength : 1;
  const access = layout.access.map((opening) => {
    if (opening.edge !== first.edge) return opening;
    const widthM = Math.min(opening.widthM, newLength);
    const offsetM = Math.min(opening.offsetM * scale, newLength - widthM);
    return { ...opening, edge, offsetM, widthM };
  });
  const reservations = layout.reservations.map((reservation) => {
    if (reservation.edge !== first.edge) return reservation;
    const oldAlong = isHorizontal(first.edge) ? reservation.widthM : reservation.depthM;
    const inward = isHorizontal(first.edge) ? reservation.depthM : reservation.widthM;
    const along = Math.min(oldAlong, newLength);
    const offsetM = Math.min(Math.max(0, (reservation.offsetM ?? first.offsetM) * scale), newLength - along);
    return {
      ...reservation,
      edge,
      offsetM,
      x: isHorizontal(edge) ? offsetM : edge === 'east' ? environment.widthM - inward : 0,
      y: isHorizontal(edge) ? edge === 'south' ? environment.heightM - inward : 0 : offsetM,
      widthM: isHorizontal(edge) ? along : inward,
      depthM: isHorizontal(edge) ? inward : along,
    };
  });
  return { ...layout, access, reservations };
}

export function layoutWithinBounds(layout: EnvironmentLayout | undefined, widthM: number, heightM: number): EnvironmentLayout | undefined {
  if (!layout) return undefined;
  return {
    ...layout,
    access: layout.access.flatMap((access) => {
      const edgeLength = edgeLengthFor(widthM, heightM, access.edge);
      const width = Math.min(access.widthM, edgeLength);
      if (width <= 0) return [];
      return [{ ...access, offsetM: Math.min(Math.max(0, access.offsetM), edgeLength - width), widthM: width }];
    }),
    reservations: layout.reservations.flatMap((reservation) => {
      const edge = reservation.edge;
      if (edge) {
        const alongHorizontal = isHorizontal(edge);
        const edgeLength = edgeLengthFor(widthM, heightM, edge);
        const along = Math.min(alongHorizontal ? reservation.widthM : reservation.depthM, edgeLength);
        const inward = Math.min(alongHorizontal ? reservation.depthM : reservation.widthM, alongHorizontal ? heightM : widthM);
        if (along <= 0 || inward <= 0) return [];
        const offsetM = Math.min(Math.max(0, reservation.offsetM ?? (alongHorizontal ? reservation.x : reservation.y)), edgeLength - along);
        return [{
          ...reservation,
          offsetM,
          x: alongHorizontal ? offsetM : edge === 'east' ? widthM - inward : 0,
          y: alongHorizontal ? edge === 'south' ? heightM - inward : 0 : offsetM,
          widthM: alongHorizontal ? along : inward,
          depthM: alongHorizontal ? inward : along,
        }];
      }
      const x = Math.min(Math.max(0, reservation.x), widthM);
      const y = Math.min(Math.max(0, reservation.y), heightM);
      const width = Math.min(reservation.widthM, widthM - x);
      const depth = Math.min(reservation.depthM, heightM - y);
      if (width <= 0 || depth <= 0) return [];
      return [{ ...reservation, x, y, widthM: width, depthM: depth }];
    }),
    growingSpaces: layout.growingSpaces.filter((space) =>
      space.x >= 0 && space.y >= 0 && space.x + space.widthM <= widthM && space.y + space.depthM <= heightM,
    ),
  };
}

function edgeLengthFor(widthM: number, heightM: number, edge: SiteEdge): number {
  return isHorizontal(edge) ? widthM : heightM;
}
