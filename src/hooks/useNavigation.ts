import { useLocation } from 'wouter';

// Wouter 3.x exposes navigation via `useLocation()[1]`. Centralise the
// `navigate` shim so pages read like classic React Router.
export function useNavigation() {
  const [, setLocation] = useLocation();
  return (to: string) => setLocation(to);
}
