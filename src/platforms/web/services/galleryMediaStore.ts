const DB_NAME = 're-portfolio-gallery-media';
const DB_VERSION = 1;
const STORE_NAME = 'media';
const MEDIA_REF_PREFIX = 'gallery-media:';

type StoredGalleryMedia = {
  ref: string;
  blob: Blob;
  createdAt: string;
  fileName?: string;
  mimeType: string;
};

const objectUrlCache = new Map<string, string>();
const inlineBase64ImagePattern = /^data:image\/[a-z0-9.+-]+;base64,/i;
const inlineBase64CharsPattern = /^[A-Za-z0-9+/=\s]+$/;

const getDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Unable to open gallery media store.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'ref' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

const wrapRequest = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    request.onsuccess = () => resolve(request.result);
  });

export const isGalleryMediaRef = (value: string): boolean =>
  typeof value === 'string' && value.startsWith(MEDIA_REF_PREFIX);

export const isLegacyInlineGalleryPayload = (value: string): boolean => {
  if (!value || isGalleryMediaRef(value)) {
    return false;
  }

  if (inlineBase64ImagePattern.test(value)) {
    return true;
  }

  return value.length > 1000 && inlineBase64CharsPattern.test(value.replace(/\s+/g, ''));
};

const blobFromLegacyPayload = async (payload: string): Promise<{ blob: Blob; mimeType: string }> => {
  if (payload.startsWith('data:')) {
    const response = await fetch(payload);
    const blob = await response.blob();
    return { blob, mimeType: blob.type || 'image/*' };
  }

  const binary = window.atob(payload.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { blob: new Blob([bytes]), mimeType: 'image/*' };
};

export const createGalleryMediaRef = async (blob: Blob, fileName?: string): Promise<string> => {
  const ref = `${MEDIA_REF_PREFIX}${crypto.randomUUID()}`;
  const db = await getDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      ref,
      blob,
      createdAt: new Date().toISOString(),
      fileName,
      mimeType: blob.type || 'application/octet-stream',
    } satisfies StoredGalleryMedia);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to persist gallery media.'));
      tx.onabort = () => reject(tx.error ?? new Error('Gallery media transaction aborted.'));
    });
    return ref;
  } finally {
    db.close();
  }
};

export const migrateLegacyGalleryPayload = async (
  payload: string,
  fileName?: string
): Promise<string> => {
  if (!isLegacyInlineGalleryPayload(payload)) {
    return payload;
  }

  const { blob } = await blobFromLegacyPayload(payload);
  return createGalleryMediaRef(blob, fileName);
};

export const migrateLegacyGalleryUrls = async (
  urls: string[],
  fileName?: string
): Promise<{ urls: string[]; migratedCount: number; failedCount: number }> => {
  let migratedCount = 0;
  let failedCount = 0;

  const nextUrls = await Promise.all(
    urls.map(async (url) => {
      if (!isLegacyInlineGalleryPayload(url)) {
        return url;
      }

      try {
        const ref = await migrateLegacyGalleryPayload(url, fileName);
        if (ref !== url) {
          migratedCount += 1;
        }
        return ref;
      } catch {
        failedCount += 1;
        return url;
      }
    })
  );

  if (migratedCount > 0 || failedCount > 0) {
    console.debug('[gallery-media-migration]', { migratedCount, failedCount, total: urls.length });
  }

  return { urls: nextUrls, migratedCount, failedCount };
};

export const resolveGalleryMediaUrl = async (refOrUrl: string): Promise<string> => {
  if (!isGalleryMediaRef(refOrUrl)) {
    return refOrUrl;
  }

  const cached = objectUrlCache.get(refOrUrl);
  if (cached) {
    return cached;
  }

  const db = await getDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const record = (await wrapRequest(tx.objectStore(STORE_NAME).get(refOrUrl))) as StoredGalleryMedia | undefined;
    if (!record) {
      return '';
    }

    const objectUrl = window.URL.createObjectURL(record.blob);
    objectUrlCache.set(refOrUrl, objectUrl);
    return objectUrl;
  } finally {
    db.close();
  }
};

export const deleteGalleryMedia = async (refOrUrl: string): Promise<void> => {
  if (!isGalleryMediaRef(refOrUrl)) {
    return;
  }

  const cached = objectUrlCache.get(refOrUrl);
  if (cached) {
    window.URL.revokeObjectURL(cached);
    objectUrlCache.delete(refOrUrl);
  }

  const db = await getDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(refOrUrl);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to delete gallery media.'));
    });
  } finally {
    db.close();
  }
};
