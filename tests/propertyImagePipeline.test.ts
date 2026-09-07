import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideFullPhotoOptimization,
  PropertyPhotoError,
  scaledDimensions,
  validatePropertyPhotoFile,
} from '../src/common/utils/propertyImagePipeline';

const file = (bytes: number[], type: string, name: string) =>
  Object.assign(new Blob([new Uint8Array(bytes)], { type }), { name }) as File;

test('accepts JPEG, PNG, and WebP after checking their byte signatures', async () => {
  await assert.doesNotReject(() => validatePropertyPhotoFile(file([0xff, 0xd8, 0xff, 0xe0], 'image/jpeg', 'house.jpg')));
  await assert.doesNotReject(() => validatePropertyPhotoFile(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png', 'house.png')));
  await assert.doesNotReject(() => validatePropertyPhotoFile(file([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'image/webp', 'house.webp')));
});

test('rejects unsupported, empty, HEIC, SVG, and corrupt property photos clearly', async () => {
  await assert.rejects(() => validatePropertyPhotoFile(file([], 'image/jpeg', 'empty.jpg')), (error: Error) => error instanceof PropertyPhotoError && error.code === 'empty');
  await assert.rejects(() => validatePropertyPhotoFile(file([0, 1], 'image/heic', 'house.heic')), (error: Error) => error instanceof PropertyPhotoError && error.code === 'heic-not-supported');
  await assert.rejects(() => validatePropertyPhotoFile(file([60, 115, 118, 103], 'image/svg+xml', 'house.svg')), (error: Error) => error instanceof PropertyPhotoError && error.code === 'svg-not-supported');
  await assert.rejects(() => validatePropertyPhotoFile(file([0, 1, 2], 'image/jpeg', 'broken.jpg')), (error: Error) => error instanceof PropertyPhotoError && error.code === 'corrupt-file');
});

test('documents the 25 MB input ceiling while allowing a normal 20 MB photo', async () => {
  const normal = {
    name: 'normal.jpg', type: 'image/jpeg', size: 20 * 1024 * 1024,
    slice: () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])]),
  } as unknown as File;
  await assert.doesNotReject(() => validatePropertyPhotoFile(normal));
  const oversized = { ...normal, size: 26 * 1024 * 1024 } as File;
  await assert.rejects(() => validatePropertyPhotoFile(oversized), (error: Error) => error instanceof PropertyPhotoError && error.code === 'file-too-large');
});

test('preserves aspect ratio and only scales dimensions above the intended limit', () => {
  assert.deepEqual(scaledDimensions(1920, 1080, 4800), { width: 1920, height: 1080 });
  assert.deepEqual(scaledDimensions(6000, 4000, 4800), { width: 4800, height: 3200 });
  assert.deepEqual(scaledDimensions(4000, 6000, 480), { width: 320, height: 480 });
});

test('keeps a reasonably sized 4000 by 3000 original full image', () => {
  assert.equal(decideFullPhotoOptimization(4000, 3000, 5 * 1024 * 1024), 'keep-original');
});

test('recompresses an excessively heavy 4000 by 3000 image without reducing resolution', () => {
  assert.equal(decideFullPhotoOptimization(4000, 3000, 10 * 1024 * 1024), 'recompress');
});

test('resizes and recompresses a 6000 by 4000 image', () => {
  assert.equal(decideFullPhotoOptimization(6000, 4000, 5 * 1024 * 1024), 'resize-and-recompress');
});
