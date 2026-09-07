export const supportedPropertyPhotoMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type SupportedPropertyPhotoMimeType = (typeof supportedPropertyPhotoMimeTypes)[number];

export const PROPERTY_PHOTO_MAX_FULL_SIDE_PX = 4800;
export const PROPERTY_PHOTO_THUMBNAIL_SIDE_PX = 480;
export const PROPERTY_PHOTO_FULL_QUALITY = 0.88;
export const PROPERTY_PHOTO_THUMBNAIL_QUALITY = 0.82;
export const PROPERTY_PHOTO_MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const PROPERTY_PHOTO_MAX_BATCH_COUNT = 10;
// A high-quality 12 MP real-estate JPG normally fits below this; above it, retain pixels but re-encode.
export const PROPERTY_PHOTO_MAX_ORIGINAL_FULL_BYTES = 8 * 1024 * 1024;

export type PropertyPhotoValidationError =
  | 'empty'
  | 'file-too-large'
  | 'too-many-files'
  | 'unsupported-format'
  | 'heic-not-supported'
  | 'svg-not-supported'
  | 'corrupt-file';

export class PropertyPhotoError extends Error {
  constructor(public readonly code: PropertyPhotoValidationError) {
    super(code);
  }
}

const extensionOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';

const mimeFromHeader = (bytes: Uint8Array): SupportedPropertyPhotoMimeType | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
};

const isHeic = (file: File): boolean =>
  file.type.toLowerCase().includes('heic') || file.type.toLowerCase().includes('heif') || ['heic', 'heif'].includes(extensionOf(file.name));

const isSvg = (file: File): boolean => file.type.toLowerCase() === 'image/svg+xml' || extensionOf(file.name) === 'svg';

export const validatePropertyPhotoFile = async (file: File): Promise<SupportedPropertyPhotoMimeType> => {
  if (file.size <= 0) throw new PropertyPhotoError('empty');
  if (file.size > PROPERTY_PHOTO_MAX_INPUT_BYTES) throw new PropertyPhotoError('file-too-large');
  if (isHeic(file)) throw new PropertyPhotoError('heic-not-supported');
  if (isSvg(file)) throw new PropertyPhotoError('svg-not-supported');

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const actualMimeType = mimeFromHeader(header);
  if (!actualMimeType) throw new PropertyPhotoError('corrupt-file');

  const declaredMimeType = file.type.toLowerCase();
  if (declaredMimeType && declaredMimeType !== actualMimeType) {
    throw new PropertyPhotoError('unsupported-format');
  }

  return actualMimeType;
};

export const scaledDimensions = (width: number, height: number, maxSide: number) => {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxSide) return { width, height };
  const scale = maxSide / longestSide;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

export type FullPhotoOptimization = 'keep-original' | 'recompress' | 'resize-and-recompress';

export const decideFullPhotoOptimization = (
  width: number,
  height: number,
  bytes: number
): FullPhotoOptimization => {
  if (Math.max(width, height) > PROPERTY_PHOTO_MAX_FULL_SIDE_PX) return 'resize-and-recompress';
  return bytes > PROPERTY_PHOTO_MAX_ORIGINAL_FULL_BYTES ? 'recompress' : 'keep-original';
};

export type ProcessedPropertyPhoto = {
  full: Blob;
  thumbnail: Blob;
  original: { bytes: number; width: number; height: number; mimeType: SupportedPropertyPhotoMimeType };
  fullOutput: { bytes: number; width: number; height: number; mimeType: string; resized: boolean; recompressed: boolean };
  thumbnailOutput: { bytes: number; width: number; height: number; mimeType: string };
};

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PropertyPhotoError('corrupt-file'))), type, quality);
  });

const decodeImage = async (file: File): Promise<ImageBitmap> => {
  if (typeof createImageBitmap !== 'function') throw new PropertyPhotoError('corrupt-file');
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PropertyPhotoError('corrupt-file');
  }
};

const renderBlob = async (image: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new PropertyPhotoError('corrupt-file');
  context.drawImage(image, 0, 0, width, height);
  try {
    return await canvasBlob(canvas, 'image/webp', quality);
  } catch {
    return canvasBlob(canvas, 'image/jpeg', quality);
  }
};

export const processPropertyPhoto = async (file: File): Promise<ProcessedPropertyPhoto> => {
  const mimeType = await validatePropertyPhotoFile(file);
  const image = await decodeImage(file);
  try {
    const original = { bytes: file.size, width: image.width, height: image.height, mimeType };
    const fullSize = scaledDimensions(image.width, image.height, PROPERTY_PHOTO_MAX_FULL_SIDE_PX);
    const thumbnailSize = scaledDimensions(image.width, image.height, PROPERTY_PHOTO_THUMBNAIL_SIDE_PX);
    const optimization = decideFullPhotoOptimization(image.width, image.height, file.size);
    const resized = optimization === 'resize-and-recompress';
    const recompressed = optimization !== 'keep-original';
    const full = recompressed ? await renderBlob(image, fullSize.width, fullSize.height, PROPERTY_PHOTO_FULL_QUALITY) : file;
    const thumbnail = await renderBlob(image, thumbnailSize.width, thumbnailSize.height, PROPERTY_PHOTO_THUMBNAIL_QUALITY);
    return {
      full,
      thumbnail,
      original,
      fullOutput: { bytes: full.size, width: fullSize.width, height: fullSize.height, mimeType: full.type || mimeType, resized, recompressed },
      thumbnailOutput: { bytes: thumbnail.size, width: thumbnailSize.width, height: thumbnailSize.height, mimeType: thumbnail.type || 'image/webp' },
    };
  } finally {
    image.close();
  }
};
