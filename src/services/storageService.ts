import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../config/firebase";

/**
 * Deletes a file from Firebase Storage given its download URL
 */
export const deleteProductImage = async (url: string): Promise<void> => {
    if (!url || !url.includes('firebase')) return;
    try {
        const decodedUrl = decodeURIComponent(url);
        const startIndex = decodedUrl.indexOf('/o/') + 3;
        const endIndex = decodedUrl.indexOf('?alt=media');
        if (startIndex > 2 && endIndex > -1) {
            const filePath = decodedUrl.substring(startIndex, endIndex);
            const fileRef = ref(storage, filePath);
            await deleteObject(fileRef);
            console.log('Imagen eliminada de Firebase:', filePath);
        }
    } catch (error) {
        console.error("Error eliminando imagen de Firebase:", error);
    }
};

/**
 * Uploads a blob/file to Firebase Storage and returns the download URL
 */
export const uploadProductImage = async (businessId: string, blob: Blob | Uint8Array, fileName: string): Promise<string> => {
    try {
        const fileRef = ref(storage, `businesses/${businessId}/products/${fileName}`);
        const snapshot = await uploadBytes(fileRef, blob);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        return downloadUrl;
    } catch (error) {
        console.error("Error uploading image to Firebase Storage:", error);
        throw error;
    }
};

/**
 * Helper to convert URI to Blob (React Native / Web compat)
 */
export const uriToBlob = async (uri: string): Promise<Blob> => {
    const response = await fetch(uri);
    return await response.blob();
};

/**
 * Helper to get cropped image from canvas as Blob
 */
export const getCroppedImg = async (imageSrc: string, pixelCrop: { x: number, y: number, width: number, height: number }): Promise<Blob | null> => {
    return new Promise((resolve) => {
        const image = new Image();
        if (imageSrc.startsWith('http')) {
            image.crossOrigin = "anonymous";
        }
        image.src = imageSrc;
        
        image.onload = () => {
            if (!image.complete || image.naturalWidth === 0) return resolve(null);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);

            // Standardize output to 1024x1024 to ensure < 800kb @ 0.8 quality
            canvas.width = 1024;
            canvas.height = 1024;

            // Fill background with white to avoid black background on transparent images
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(
                image,
                pixelCrop.x,
                pixelCrop.y,
                pixelCrop.width,
                pixelCrop.height,
                0,
                0,
                1024,
                1024
            );

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else resolve(null);
            }, 'image/jpeg', 0.8);
        };

        image.onerror = (err) => {
            console.error("Error loading image for crop", err);
            resolve(null);
        };
    });
};
