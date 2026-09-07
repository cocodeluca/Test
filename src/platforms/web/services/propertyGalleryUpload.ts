import { PROPERTY_PHOTO_MAX_BATCH_COUNT, PropertyPhotoError, processPropertyPhoto, type ProcessedPropertyPhoto } from '../../../common/utils/propertyImagePipeline';
import { createGalleryMediaPair, deleteGalleryMedia, discardPendingGalleryMediaRefs, verifyGalleryMediaRefs } from './galleryMediaStore';

export type UploadedPropertyGalleryPhoto = {
  fullRef: string;
  thumbnailRef: string;
  metrics: ProcessedPropertyPhoto;
};

/** Stages all blobs first; a failed batch is compensated before it reaches portfolio state. */
export const uploadPropertyGalleryPhotos = async (files: File[]): Promise<UploadedPropertyGalleryPhoto[]> => {
  if (files.length > PROPERTY_PHOTO_MAX_BATCH_COUNT) throw new PropertyPhotoError('too-many-files');
  const uploaded: UploadedPropertyGalleryPhoto[] = [];
  try {
    for (const file of files) {
      const metrics = await processPropertyPhoto(file);
      const refs = await createGalleryMediaPair({
        full: metrics.full,
        thumbnail: metrics.thumbnail,
        fileName: file.name,
        fullWidth: metrics.fullOutput.width,
        fullHeight: metrics.fullOutput.height,
        thumbnailWidth: metrics.thumbnailOutput.width,
        thumbnailHeight: metrics.thumbnailOutput.height,
      });
      if (!(await verifyGalleryMediaRefs([refs.fullRef, refs.thumbnailRef]))) {
        await Promise.all([deleteGalleryMedia(refs.fullRef), deleteGalleryMedia(refs.thumbnailRef)]);
        throw new Error('Gallery media verification failed.');
      }
      uploaded.push({ ...refs, metrics });
    }
    return uploaded;
  } catch (error) {
    await discardPendingGalleryMediaRefs(uploaded.flatMap((item) => [item.fullRef, item.thumbnailRef]));
    throw error;
  }
};
