
'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore'; // Removed collection, addDoc, getDocs, deleteDoc
import { app } from '@/lib/firebase'; // Import app
import type { PlatformConfig, MusicPlaylistItem } from '@/types'; // Import types

const CONFIG_DOC_ID = '--platform-config--'; // Special ID for the config document
const SETTINGS_COLLECTION = 'settings';

// Predefined list of audio tracks (using placeholders - replace with actual URLs)
// Using placeholder image URLs for now, as we can't embed actual audio.
// In a real app, these would be URLs to MP3/WAV files hosted somewhere.
const PREDEFINED_PLAYLIST: MusicPlaylistItem[] = [
    { id: 'track1', title: "Upbeat Funk", url: "https://picsum.photos/id/1015/300/300.jpg?audio=funk", duration: 180 }, // Placeholder URL, add real duration
    { id: 'track2', title: "Chill Lo-fi", url: "https://picsum.photos/id/1025/300/300.jpg?audio=lofi", duration: 150 },
    { id: 'track3', title: "Driving Rock", url: "https://picsum.photos/id/103/300/300.jpg?audio=rock", duration: 210 },
    { id: 'track4', title: "Peaceful Piano", url: "https://picsum.photos/id/1048/300/300.jpg?audio=piano", duration: 120 },
    { id: 'track5', title: "Synthwave Drive", url: "https://picsum.photos/id/219/300/300.jpg?audio=synthwave", duration: 240 },
];


/**
 * Fetches the platform configuration settings from Firestore and merges with the predefined music playlist.
 *
 * @returns Promise<PlatformConfig> - The current platform configuration including the predefined playlist. Defaults if not found.
 * @throws Error if db is not initialized or fetch fails.
 */
export const getPlatformConfig = async (): Promise<PlatformConfig> => {
  let dbInstance;
  try {
      if (!db) throw new Error("Firestore (db) not initialized.");
      dbInstance = db;
  } catch (initError: any) {
      const dbErrorMsg = `DB init error in getPlatformConfig: ${initError.message}`;
      console.error("🔴 Config Fetch Error:", dbErrorMsg, initError);
      throw new Error(dbErrorMsg);
  }

  const configRef = doc(dbInstance, SETTINGS_COLLECTION, CONFIG_DOC_ID);

  let configData: Omit<PlatformConfig, 'musicPlaylist'> = { // Default core config
        allowEmoji: true,
        allowFileUploads: true,
        // musicPlaylist is handled separately now
      };

  try {
    // Fetch main config doc (without playlist)
    const docSnap = await getDoc(configRef);
    if (docSnap.exists()) {
      console.log("Firestore: Fetched platform core config:", docSnap.data());
      // Merge fetched data with defaults, ignoring any potentially stored musicPlaylist field
      const fetchedData = docSnap.data();
      configData = {
         ...configData,
         ...(fetchedData?.allowEmoji !== undefined && { allowEmoji: fetchedData.allowEmoji }),
         ...(fetchedData?.allowFileUploads !== undefined && { allowFileUploads: fetchedData.allowFileUploads }),
      };
    } else {
      console.log("Firestore: Platform config document not found, using defaults.");
    }

    // Always return the predefined playlist
    const finalConfig: PlatformConfig = {
        ...configData,
        musicPlaylist: PREDEFINED_PLAYLIST.sort((a, b) => a.title.localeCompare(b.title)), // Sort predefined list
    };

    console.log("Returning platform config with predefined playlist:", finalConfig.musicPlaylist);
    return finalConfig;

  } catch (error: any) {
    const detailedErrorMessage = `Failed to fetch platform config. Error: ${error.message || 'Unknown Firestore error'}`;
    console.error("🔴 Config Fetch Error:", detailedErrorMessage, error);
    throw new Error(detailedErrorMessage);
  }
};

/**
 * Updates the core platform configuration settings (excluding playlist) in Firestore.
 * Requires admin privileges.
 *
 * @param newConfig - Partial<PlatformConfig> object containing the settings to update (like allowEmoji, allowFileUploads).
 * @param adminUserId - The UID of the admin performing the action.
 * @returns Promise<void>
 * @throws Error if admin check fails, db not initialized, or update fails.
 */
export const updatePlatformCoreConfig = async (newConfig: Partial<Omit<PlatformConfig, 'musicPlaylist'>>, adminUserId: string): Promise<void> => {
   let dbInstance;
   try {
       if (!db) throw new Error("Firestore (db) not initialized.");
       dbInstance = db;
   } catch (initError: any) {
       const dbErrorMsg = `DB init error in updatePlatformCoreConfig: ${initError.message}`;
       console.error("🔴 Config Update Error:", dbErrorMsg, initError);
       throw new Error(dbErrorMsg);
   }
   if (!adminUserId) throw new Error("Admin User ID is required to update config.");

   const configRef = doc(dbInstance, SETTINGS_COLLECTION, CONFIG_DOC_ID);
   const adminRef = doc(dbInstance, 'users', adminUserId);

   try {
     // Basic Admin Check
     const adminSnap = await getDoc(adminRef);
     if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
         console.warn(`Unauthorized attempt to update config by user ${adminUserId}.`);
         throw new Error("Unauthorized: Only administrators can update platform settings.");
     }

     // Filter out any undefined values AND musicPlaylist before saving
     const filteredConfig = Object.entries(newConfig).reduce((acc, [key, value]) => {
         if (value !== undefined && key !== 'musicPlaylist') {
             acc[key as keyof Omit<PlatformConfig, 'musicPlaylist'>] = value;
         }
         return acc;
     }, {} as Partial<Omit<PlatformConfig, 'musicPlaylist'>>);

     if (Object.keys(filteredConfig).length === 0) {
          console.log("No valid core settings provided to update.");
          return;
     }

     await setDoc(configRef, filteredConfig, { merge: true });
     console.log("Firestore: Platform core configuration updated by admin", adminUserId, filteredConfig);
   } catch (error: any) {
     const detailedErrorMessage = `Failed to update platform core config. Error: ${error.message || 'Unknown Firestore error'}`;
     console.error("🔴 Config Update Error:", detailedErrorMessage, error);
     throw new Error(detailedErrorMessage);
   }
};

// Remove addMusicTrack and removeMusicTrack functions as they are no longer needed
/*
export const addMusicTrack = async (...) => { ... }
export const removeMusicTrack = async (...) => { ... }
*/
