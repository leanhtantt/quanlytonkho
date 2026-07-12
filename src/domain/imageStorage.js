import { api } from '../lib/api';

export function isRemoteImage(imageId) {
  return typeof imageId === 'string' && /^https?:\/\//i.test(imageId);
}

export function isFirebaseStorageImage(imageId) {
  return isRemoteImage(imageId) && imageId.includes('firebasestorage.googleapis.com');
}

export async function uploadProductImage(productId, dataUrl) {
  const result = await api.uploadProductImage(productId, dataUrl);
  return result.imageUrl;
}

export async function deleteProductImage(imageId) {
  if (!isFirebaseStorageImage(imageId)) return;
  try {
    await api.deleteProductImage(imageId);
  } catch (error) {
    if (!String(error?.message || '').includes('not found')) throw error;
  }
}
