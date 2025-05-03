'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore';
import { app } from '@/lib/firebase'; // Import app

const CONFIG_DOC_ID = '--platform-config--'; // Special ID for the config document
const SETTINGS_COLLECTION = 'settings'; // Collection name

export interface PlatformConfig {
  allowEmoji?: boolean;
  allowFileUploads?: boolean;
  // Add other config fields here (e.g., theme, logoUrl)
}

/**
 * Fetches the platform configuration settings from Firestore.
 *
 * @returns Promise<PlatformConfig> - The current platform configuration. Defaults if not found.
 * @throws Error if db is not initialized or fetch fails.
 */
export const getPlatformConfig = async (): Promise<PlatformConfig> => {
  let dbInstance;
  try {
      dbInstance = getFirestore(app);
  } catch (initError: any) {
      const dbErrorMsg = `DB init error in getPlatformConfig: ${initError.message}`;
      console.error("🔴 Config Fetch Error:", dbErrorMsg, initError);
      throw new Error(dbErrorMsg);
  }
  if (!dbInstance) throw new Error("Database service not available.");

  const configRef = doc(dbInstance, SETTINGS_COLLECTION, CONFIG_DOC_ID);

  try {
    const docSnap = await getDoc(configRef);
    if (docSnap.exists()) {
      console.log("Firestore: Fetched platform config:", docSnap.data());
      return docSnap.data() as PlatformConfig;
    } else {
      console.log("Firestore: Platform config document not found, returning defaults.");
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
 * Updates the platform configuration settings in Firestore.
 * Requires admin privileges (basic check added - placeholder for robust verification).
 *
 * @param newConfig - Partial<PlatformConfig> object containing the settings to update.
 * @param adminUserId - The UID of the admin performing the action (for verification).
 * @returns Promise<void>
 * @throws Error if admin check fails, db not initialized, or update fails.
 */
export const updatePlatformConfig = async (newConfig: Partial<PlatformConfig>, adminUserId: string): Promise<void> => {
   let dbInstance;
   try {
       dbInstance = getFirestore(app);
   } catch (initError: any) {
       const dbErrorMsg = `DB init error in updatePlatformConfig: ${initError.message}`;
       console.error("🔴 Config Update Error:", dbErrorMsg, initError);
       throw new Error(dbErrorMsg);
   }
   if (!dbInstance) throw new Error("Database service not available.");
   if (!adminUserId) throw new Error("Admin User ID is required to update config.");

   const configRef = doc(dbInstance, SETTINGS_COLLECTION, CONFIG_DOC_ID);
   const adminRef = doc(dbInstance, 'users', adminUserId);

   try {
     // Basic Admin Check (replace with more robust verification if needed)
     const adminSnap = await getDoc(adminRef);
     if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
         console.warn(`Unauthorized attempt to update config by user ${adminUserId}.`);
         throw new Error("Unauthorized: Only administrators can update platform settings.");
     }

     // Filter out any undefined values before saving
     const filteredConfig = Object.entries(newConfig).reduce((acc, [key, value]) => {
         if (value !== undefined) {
             acc[key as keyof PlatformConfig] = value;
         }
         return acc;
     }, {} as Partial<PlatformConfig>);

     if (Object.keys(filteredConfig).length === 0) {
          console.log("No valid settings provided to update.");
          return;
     }

     await setDoc(configRef, filteredConfig, { merge: true }); // Use merge to update only specified fields
     console.log("Firestore: Platform configuration updated by admin", adminUserId, filteredConfig);
   } catch (error: any) {
     const detailedErrorMessage = `Failed to update platform config. Error: ${error.message || 'Unknown Firestore error'}`;
     console.error("🔴 Config Update Error:", detailedErrorMessage, error);
     throw new Error(detailedErrorMessage);
   }
};