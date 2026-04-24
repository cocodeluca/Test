import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveGalleryMediaUrl } from '../services/galleryMediaStore';
import { GALLERY_SAFE_MODE } from '../utils/gallerySafeMode';

const areUrlListsEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const logGallery = (message: string, details?: Record<string, unknown>) => {
  if (typeof console === 'undefined') {
    return;
  }

  console.debug(`[property-gallery] ${message}`, details ?? {});
};

const normalizeGalleryUrlValue = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    const candidate = value as { url?: unknown; src?: unknown; imageUrl?: unknown };
    return (
      normalizeGalleryUrlValue(candidate.url) ??
      normalizeGalleryUrlValue(candidate.src) ??
      normalizeGalleryUrlValue(candidate.imageUrl)
    );
  }

  return null;
};

export const normalizeGalleryUrls = (urls: unknown[]): string[] => {
  const nextUrls: string[] = [];

  urls.forEach((url, index) => {
    const normalized = normalizeGalleryUrlValue(url);
    if (!normalized) {
      logGallery('invalid image entry skipped', { index });
      return;
    }

    nextUrls.push(normalized);
  });

  if (nextUrls.length === 0 && urls.length > 0) {
    logGallery('malformed gallery data normalized', { inputCount: urls.length });
  }

  return nextUrls;
};

export const useResolvedGalleryUrls = (urls: string[]) => {
  const urlsKey = urls.join('\u0001');
  const normalizedUrls = useMemo(() => normalizeGalleryUrls(urls), [urlsKey]);
  const [resolvedUrls, setResolvedUrls] = useState<string[]>(GALLERY_SAFE_MODE ? [] : normalizedUrls);
  const resolvedUrlsRef = useRef(resolvedUrls);

  useEffect(() => {
    resolvedUrlsRef.current = resolvedUrls;
  }, [resolvedUrls]);

  useEffect(() => {
    if (GALLERY_SAFE_MODE) {
      if (!areUrlListsEqual(resolvedUrlsRef.current, [])) {
        setResolvedUrls([]);
      }
      return;
    }

    let cancelled = false;

    const run = async () => {
      const nextUrls = await Promise.all(
        normalizedUrls.map(async (url) => {
          try {
            return await resolveGalleryMediaUrl(url);
          } catch {
            return '';
          }
        })
      );

      if (!cancelled) {
        const normalizedNextUrls = nextUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

        if (!areUrlListsEqual(resolvedUrlsRef.current, normalizedNextUrls)) {
          if (typeof console !== 'undefined') {
            console.debug('[gallery-refs] resolved', {
              requested: normalizedUrls.length,
              resolved: normalizedNextUrls.length,
            });
          }

          setResolvedUrls(normalizedNextUrls);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [normalizedUrls]);

  return resolvedUrls;
};
