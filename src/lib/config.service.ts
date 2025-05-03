
'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, getFirestore, collection, addDoc, getDocs, deleteDoc } from 'firebase/firestore'; // Added collection, addDoc, getDocs, deleteDoc
import { app } from '@/lib/firebase'; // Import app
import type { PlatformConfig, MusicPlaylistItem } from '@/types'; // Import types

const CONFIG_DOC_ID = '--platform-config--'; // Special ID for the config document
const SETTINGS_COLLECTION = 'settings'; // Collection name
const MUSIC_PLAYLIST_COLLECTION = 'musicPlaylist'; // Separate subcollection for music

/**
 * Fetches the platform configuration settings from Firestore, including the music playlist.
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
  const playlistRef = collection(dbInstance, SETTINGS_COLLECTION, CONFIG_DOC_ID, MUSIC_PLAYLIST_COLLECTION);

  let configData: PlatformConfig = { // Default config
        allowEmoji: true,
        allowFileUploads: true,
        musicPlaylist: [],
      };

  try {
    // Fetch main config doc
    const docSnap = await getDoc(configRef);
    if (docSnap.exists()) {
      console.log("Firestore: Fetched platform config:", docSnap.data());
      // Merge fetched data with defaults, ensuring musicPlaylist is initialized
      configData = { ...configData, ...(docSnap.data() as Omit<PlatformConfig, 'musicPlaylist'>) };
    } else {
      console.log("Firestore: Platform config document not found, using defaults.");
    }

    // Fetch music playlist subcollection
    const playlistSnap = await getDocs(playlistRef);
    const playlist: MusicPlaylistItem[] = playlistSnap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<MusicPlaylistItem, 'id'>)
    }));
    configData.musicPlaylist = playlist.sort((a, b) => a.title.localeCompare(b.title)); // Sort playlist alphabetically

    console.log("Firestore: Fetched music playlist:", configData.musicPlaylist);
    return configData;

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
       dbInstance = getFirestore(app);
   } catch (initError: any) {
       const dbErrorMsg = `DB init error in updatePlatformCoreConfig: ${initError.message}`;
       console.error("🔴 Config Update Error:", dbErrorMsg, initError);
       throw new Error(dbErrorMsg);
   }
   if (!dbInstance) throw new Error("Database service not available.");
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

     // Filter out any undefined values before saving
     const filteredConfig = Object.entries(newConfig).reduce((acc, [key, value]) => {
         if (value !== undefined && key !== 'musicPlaylist') { // Ensure playlist is not updated here
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

/**
 * Adds a new track to the music playlist subcollection.
 * Requires admin privileges.
 *
 * @param track - Object containing the track title and URL.
 * @param adminUserId - The UID of the admin performing the action.
 * @returns Promise<string> - The ID of the newly added music track document.
 * @throws Error if admin check fails, db not initialized, track data invalid, or add fails.
 */
export const addMusicTrack = async (track: Omit<MusicPlaylistItem, 'id'>, adminUserId: string): Promise<string> => {
    let dbInstance;
    try {
        dbInstance = getFirestore(app);
    } catch (initError: any) {
        const dbErrorMsg = `DB init error in addMusicTrack: ${initError.message}`;
        console.error("🔴 Music Add Error:", dbErrorMsg, initError);
        throw new Error(dbErrorMsg);
    }
    if (!dbInstance) throw new Error("Database service not available.");
    if (!adminUserId) throw new Error("Admin User ID is required.");
    if (!track || !track.title?.trim() || !track.url?.trim()) {
        throw new Error("Invalid track data: Title and URL are required.");
    }
    // Basic URL validation (can be enhanced)
    try {
        new URL(track.url);
    } catch (_) {
        throw new Error("Invalid track URL format.");
    }

    const playlistRef = collection(dbInstance, SETTINGS_COLLECTION, CONFIG_DOC_ID, MUSIC_PLAYLIST_COLLECTION);
    const adminRef = doc(dbInstance, 'users', adminUserId);

    try {
        // Basic Admin Check
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
            console.warn(`Unauthorized attempt to add music by user ${adminUserId}.`);
            throw new Error("Unauthorized: Only administrators can add music.");
        }

        const docRef = await addDoc(playlistRef, {
            title: track.title.trim(),
            url: track.url.trim(),
        });
        console.log(`Firestore: Music track added by admin ${adminUserId}: ${track.title}, Doc ID: ${docRef.id}`);
        return docRef.id;

    } catch (error: any) {
        const detailedErrorMessage = `Failed to add music track. Error: ${error.message || 'Unknown Firestore error'}`;
        console.error("🔴 Music Add Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};

/**
 * Removes a track from the music playlist subcollection.
 * Requires admin privileges.
 *
 * @param trackId - The ID of the music track document to remove.
 * @param adminUserId - The UID of the admin performing the action.
 * @returns Promise<void>
 * @throws Error if admin check fails, db not initialized, or delete fails.
 */
export const removeMusicTrack = async (trackId: string, adminUserId: string): Promise<void> => {
    let dbInstance;
    try {
        dbInstance = getFirestore(app);
    } catch (initError: any) {
        const dbErrorMsg = `DB init error in removeMusicTrack: ${initError.message}`;
        console.error("🔴 Music Remove Error:", dbErrorMsg, initError);
        throw new Error(dbErrorMsg);
    }
    if (!dbInstance) throw new Error("Database service not available.");
    if (!adminUserId) throw new Error("Admin User ID is required.");
    if (!trackId) throw new Error("Track ID is required.");

    const trackRef = doc(dbInstance, SETTINGS_COLLECTION, CONFIG_DOC_ID, MUSIC_PLAYLIST_COLLECTION, trackId);
    const adminRef = doc(dbInstance, 'users', adminUserId);

    try {
        // Basic Admin Check
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
            console.warn(`Unauthorized attempt to remove music track ${trackId} by user ${adminUserId}.`);
            throw new Error("Unauthorized: Only administrators can remove music.");
        }

        // Check if track exists before attempting delete
        const trackSnap = await getDoc(trackRef);
        if (!trackSnap.exists()) {
             console.warn(`Firestore: Attempted to remove non-existent music track ${trackId}.`);
             return; // Or throw an error if preferred
             // throw new Error("Music track not found.");
        }


        await deleteDoc(trackRef);
        console.log(`Firestore: Music track ${trackId} removed by admin ${adminUserId}.`);

    } catch (error: any) {
        const detailedErrorMessage = `Failed to remove music track ${trackId}. Error: ${error.message || 'Unknown Firestore error'}`;
        console.error("🔴 Music Remove Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};
```