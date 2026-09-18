export const CANONICAL_DEVELOPMENT_ORIGIN = 'http://localhost:5173';

export interface CanonicalDevelopmentLocation {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
  replace: (url: string) => void;
}

export interface CanonicalDevelopmentBootstrapOptions {
  isDevelopment: boolean;
  location: CanonicalDevelopmentLocation;
  start: () => void;
}

export type CanonicalDevelopmentBootstrapResult =
  | { action: 'started' }
  | { action: 'redirected'; redirectUrl: string };

export const buildCanonicalDevelopmentUrl = (
  location: Pick<CanonicalDevelopmentLocation, 'pathname' | 'search' | 'hash'>
): string => {
  const target = new URL(CANONICAL_DEVELOPMENT_ORIGIN);
  target.pathname = location.pathname || '/';
  target.search = location.search;
  target.hash = location.hash;
  return target.toString();
};

export const bootstrapOnCanonicalDevelopmentOrigin = ({
  isDevelopment,
  location,
  start,
}: CanonicalDevelopmentBootstrapOptions): CanonicalDevelopmentBootstrapResult => {
  if (isDevelopment && location.origin !== CANONICAL_DEVELOPMENT_ORIGIN) {
    const redirectUrl = buildCanonicalDevelopmentUrl(location);
    location.replace(redirectUrl);
    return { action: 'redirected', redirectUrl };
  }

  start();
  return { action: 'started' };
};
