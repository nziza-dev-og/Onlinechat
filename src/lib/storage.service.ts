
'use server';
import { ref, uploadBytesResumable, getDownloadURL, type UploadTaskSnapshot, type StorageError, type StorageReference } from 'firebase/storage'; // Import uploadBytesResumable
import { storage } from '@/lib/firebase'; // Ensure storage is initialized and exported
import { isFirebaseError } from '@/lib/firebase-errors';

/**
 * Helper to extract file extension.
 * @param filename - The original filename.
 * @returns The file extension (lowercase) or 'bin' if none found.
 */
const getFileExtension = (filename: string): string => {
    const parts = filename.split('.');
    if (parts.length > 1) {
        return parts.pop()?.toLowerCase() ?? 'bin';
    }
    return 'bin'; // Default extension if none found
};

/**
 * Uploads a file (Blob or File) to Firebase Storage at the specified path with progress tracking.
 *
 * @param file - The Blob or File data to upload.
 * @param path - The desired path in Firebase Storage (e.g., 'chats/chatId/files/userId_timestamp.pdf').
 * @param metadata - Optional metadata to attach to the file (like original filename).
 * @param onProgress - Optional callback function to report upload progress (percentage).
 * @returns Promise<string> - The publicly accessible download URL of the uploaded file.
 * @throws Error if Firebase Storage is not initialized, no file is provided, path is invalid, or upload fails.
 */
const uploadFile = async (
  file: Blob | File,
  path: string,
  metadata?: Record<string, string>, // Allow custom metadata
  onProgress?: (progress: number) => void
): Promise<string> => {
  if (!storage) {
     console.error("🔴 uploadFile Error: Firebase Storage service is not available.");
     throw new Error("Firebase Storage not initialized.");
  }
  if (!file) {
     console.error("🔴 uploadFile Error: No file provided for upload.");
     throw new Error("No file provided for upload.");
   }
   if (!path || typeof path !== 'string' || path.startsWith('/') || path.endsWith('/')) {
        console.error("🔴 uploadFile Error: Invalid storage path provided:", path);
        throw new Error("Invalid storage path provided.");
   }

  const storageRef: StorageReference = ref(storage, path);
  // Use provided metadata or just set contentType
  const uploadMetadata = {
      contentType: file.type || 'application/octet-stream', // Default MIME type
      ...(metadata && { customMetadata: metadata }) // Include custom metadata if provided
  };

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, uploadMetadata);

    uploadTask.on('state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        // console.log(`Firestore Storage: Upload to ${path} is ${progress}% done`);
        onProgress?.(progress);
      },
      (error: StorageError) => {
        const detailedErrorMessage = `Failed to upload file to ${path}. Error: ${error.message || 'Unknown Storage error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firebase Storage Upload Error:", detailedErrorMessage, error);
        reject(new Error(detailedErrorMessage));
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log(`Firestore Storage: File uploaded successfully to ${path}. URL:`, downloadURL);
          onProgress?.(100);
          resolve(downloadURL);
        } catch (getUrlError: any) {
           const detailedErrorMessage = `Failed to get download URL for ${path} after upload. Error: ${getUrlError.message || 'Unknown error'}${getUrlError.code ? ` (Code: ${getUrlError.code})` : ''}`;
           console.error("🔴 Detailed Firebase Storage Get URL Error:", detailedErrorMessage, getUrlError);
           reject(new Error(detailedErrorMessage));
        }
      }
    );
  });
};

/**
 * Specifically uploads an audio file (Blob) to Firebase Storage.
 * Wrapper around the generic uploadFile.
 *
 * @param file - The audio Blob data to upload.
 * @param path - The desired path in Firebase Storage.
 * @param onProgress - Optional progress callback.
 * @returns Promise<string> - The download URL.
 */
export const uploadAudio = async (
  file: Blob,
  path: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
    // No specific metadata needed beyond contentType inferred from Blob
    return uploadFile(file, path, undefined, onProgress);
};

/**
 * Uploads a generic file to Firebase Storage, storing the original filename in metadata.
 *
 * @param file - The File object to upload.
 * @param path - The desired storage path (consider making it unique, e.g., using timestamp).
 * @param onProgress - Optional progress callback.
 * @returns Promise<string> - The download URL.
 */
export const uploadGenericFile = async (
    file: File,
    path: string,
    onProgress?: (progress: number) => void
): Promise<string> => {
    // Store original filename in custom metadata
    const metadata = { originalFilename: file.name };
    return uploadFile(file, path, metadata, onProgress);
};
