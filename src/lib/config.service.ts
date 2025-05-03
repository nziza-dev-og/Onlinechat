
'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const CONFIG_DOC_ID = '--platform-config--'; // Special ID for the config document

export interface PlatformConfig {
  allowEmoji?: boolean;
  allowFileUploads?: boolean;
  // Add other config fields here
}

/**
 * Fetches the platform configuration settings.
 *
 * @returns Promise<PlatformConfig> - The current platform configuration.
 */
export const getPlatformConfig = async (): Promise<PlatformConfig> => {
  if (!db) {
    console.error("🔴 getPlatformConfig Error: Firestore (db) not available.");
    throw new Error("Database service not available.");
  }
  const configRef = doc(db, 'settings', CONFIG_DOC_ID); // Assuming a 'settings' collection

  try {
    const docSnap = await getDoc(configRef);
    if (docSnap.exists()) {
      return docSnap.data() as PlatformConfig;
    } else {
      // Return default config if document doesn't exist
      return {
        allowEmoji: true,
        allowFileUploads: true,
      };
    }
  } catch (error: any) {
    const detailedErrorMessage = `Failed to fetch platform config. Error: ${error.message || 'Unknown Firestore error'}`;
    console.error("🔴 Config Fetch Error:", detailedErrorMessage, error);
    throw new Error(detailedErrorMessage);
  }
};

/**
 * Updates the platform configuration settings.
 * Requires admin privileges (verification should be added).
 *
 * @param newConfig - Partial<PlatformConfig> object containing the settings to update.
 * @returns Promise<void>
 */
export const updatePlatformConfig = async (newConfig: Partial<PlatformConfig>): Promise<void> => {
   if (!db) {
     console.error("🔴 updatePlatformConfig Error: Firestore (db) not available.");
     throw new Error("Database service not available.");
   }
   // TODO: Add admin verification check here before allowing updates

   const configRef = doc(db, 'settings', CONFIG_DOC_ID);

   try {
     await setDoc(configRef, newConfig, { merge: true }); // Use merge to update only specified fields
     console.log("Firestore: Platform configuration updated.", newConfig);
   } catch (error: any) {
     const detailedErrorMessage = `Failed to update platform config. Error: ${error.message || 'Unknown Firestore error'}`;
     console.error("🔴 Config Update Error:", detailedErrorMessage, error);
     throw new Error(detailedErrorMessage);
   }
};
