
'use server';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase'; // Ensure storage is initialized and exported

/**
 * Uploads a file (Blob) to Firebase Storage at the specified path.
 *
 * @param file - The Blob data to upload (e.g., an audio recording).
 * @param path - The desired path in Firebase Storage (e.g., 'audio/userId/chatId/timestamp.webm').
 * @returns Promise<string> - The publicly accessible download URL of the uploaded file.
 * @throws Error if Firebase Storage is not initialized, no file is provided, or upload fails.
 */
export const uploadAudio = async (file: Blob, path: string): Promise<string> => {
  if (!storage) {
     console.error("🔴 uploadAudio Error: Firebase Storage service is not available.");
     throw new Error("Firebase Storage not initialized.");
  }
  if (!file) {
     console.error("🔴 uploadAudio Error: No audio file (Blob) provided for upload.");
     throw new Error("No audio file provided for upload.");
   }

  // Validate path format slightly
   if (!path || typeof path !== 'string' || path.startsWith('/') || path.endsWith('/')) {
        console.error("🔴 uploadAudio Error: Invalid storage path provided:", path);
        throw new Error("Invalid storage path provided.");
   }

  const storageRef = ref(storage, path);
  try {
    console.log(`Firestore Storage: Uploading audio to path: ${path} (Type: ${file.type}, Size: ${file.size} bytes)`);
    const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || 'audio/webm' // Pass the MIME type, default to webm if unknown
    });
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log("Firestore Storage: Audio uploaded successfully. URL:", downloadURL);
    return downloadURL;
  } catch (error: any) {
    const detailedErrorMessage = `Failed to upload audio to ${path}. Error: ${error.message || 'Unknown Storage error'}${error.code ? ` (Code: ${error.code})` : ''}`;
    console.error("🔴 Detailed Firebase Storage Upload Error:", detailedErrorMessage, error);
    throw new Error(detailedErrorMessage); // Re-throw the detailed error
  }
};
