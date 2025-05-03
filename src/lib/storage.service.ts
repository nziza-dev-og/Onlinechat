
'use server';
import { ref, uploadBytesResumable, getDownloadURL, type UploadTaskSnapshot } from 'firebase/storage'; // Import uploadBytesResumable
import { storage } from '@/lib/firebase'; // Ensure storage is initialized and exported

/**
 * Uploads a file (Blob) to Firebase Storage at the specified path with progress tracking.
 *
 * @param file - The Blob data to upload (e.g., an audio recording).
 * @param path - The desired path in Firebase Storage (e.g., 'audio/userId/chatId/timestamp.webm').
 * @param onProgress - Optional callback function to report upload progress (percentage).
 * @returns Promise<string> - The publicly accessible download URL of the uploaded file.
 * @throws Error if Firebase Storage is not initialized, no file is provided, or upload fails.
 */
export const uploadAudio = async (
  file: Blob,
  path: string,
  onProgress?: (progress: number) => void // Optional progress callback
): Promise<string> => {
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
  const metadata = { contentType: file.type || 'audio/webm' };

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    uploadTask.on('state_changed',
      (snapshot: UploadTaskSnapshot) => {
        // Observe state change events such as progress, pause, and resume
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`Firestore Storage: Upload to ${path} is ${progress}% done`);
        onProgress?.(progress); // Call the progress callback if provided

        switch (snapshot.state) {
          case 'paused':
            console.log(`Firestore Storage: Upload to ${path} paused`);
            break;
          case 'running':
            // console.log(`Firestore Storage: Upload to ${path} running`); // Can be noisy
            break;
        }
      },
      (error: any) => {
        // Handle unsuccessful uploads
        const detailedErrorMessage = `Failed to upload audio to ${path}. Error: ${error.message || 'Unknown Storage error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firebase Storage Upload Error:", detailedErrorMessage, error);
        reject(new Error(detailedErrorMessage)); // Reject the promise with the detailed error
      },
      async () => {
        // Handle successful uploads on complete
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log(`Firestore Storage: Audio uploaded successfully to ${path}. URL:`, downloadURL);
          onProgress?.(100); // Ensure progress reaches 100
          resolve(downloadURL); // Resolve the promise with the download URL
        } catch (getUrlError: any) {
           const detailedErrorMessage = `Failed to get download URL for ${path} after upload. Error: ${getUrlError.message || 'Unknown error'}${getUrlError.code ? ` (Code: ${getUrlError.code})` : ''}`;
           console.error("🔴 Detailed Firebase Storage Get URL Error:", detailedErrorMessage, getUrlError);
           reject(new Error(detailedErrorMessage)); // Reject if getting URL fails
        }
      }
    );
  });
};
