
'use server'; // Indicate this runs on the server or can be called from server components/actions

import { doc, setDoc, serverTimestamp, Timestamp, getDoc, updateDoc, type FirestoreError } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Import db which might be undefined if init failed
import type { UserProfile } from '@/types';
import { isFirebaseError } from '@/lib/firebase-errors';

/**
 * Input type for createOrUpdateUserProfile, containing only serializable data.
 */
export interface UserProfileInput {
    uid: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    status?: string | null; // Added status
}


/**
 * Creates or updates a user's profile document in Firestore.
 * Accepts primitive user data to avoid passing non-serializable objects across server/client boundaries.
 * Handles both new user creation and updates for existing users (e.g., updating lastSeen).
 *
 * @param userData - An object containing the user's uid, email, and optionally displayName, photoURL, and status.
 * @returns Promise<void>
 * @throws Error if user data is invalid, db is not initialized, or update fails.
 */
export const createOrUpdateUserProfile = async (
    userData: UserProfileInput
): Promise<void> => {
    // Validate essential userData
    if (!userData || !userData.uid) {
        console.error("🔴 createOrUpdateUserProfile Error: Invalid user data provided (UID is missing).", userData);
        throw new Error("Invalid user data: UID is required.");
    }

    const { uid, email, displayName, photoURL, status } = userData;

    // Check if db is initialized BEFORE using it
    if (!db) {
        const dbErrorMsg = "Database service (db) is not initialized in createOrUpdateUserProfile. Check Firebase initialization (src/lib/firebase.ts) and ensure configuration is correct and services are enabled.";
        console.error("🔴 createOrUpdateUserProfile Error:", dbErrorMsg);
        throw new Error(dbErrorMsg);
    }

    const userRef = doc(db, 'users', uid);
    let isNewUser = false;

    try {
        // Check if the user document exists to determine if it's a new registration vs. login update
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
            isNewUser = true;
            console.log(`Firestore: Creating new profile for user ${uid}`);
        } else {
            console.log(`Firestore: Updating profile for existing user ${uid}`);
        }

        // --- Firestore Document Update ---
        // Prepare data for Firestore document
        // Use a type assertion to allow serverTimestamp()
        const firestoreData: Partial<UserProfile> & { lastSeen: any, createdAt?: any } = {
            uid: uid, // Ensure uid is always set/updated
            email: email?.toLowerCase() ?? null, // Store email lowercase or null
            // Only set displayName/photoURL/status if they are explicitly provided in userData.
            // Use null if the provided value is null or an empty string for displayName/status.
            ...(displayName !== undefined && { displayName: displayName || null }),
            ...(photoURL !== undefined && { photoURL: photoURL ?? null }),
            ...(status !== undefined && { status: status || null }), // Handle status, store null if empty
            lastSeen: serverTimestamp(), // Always update lastSeen on any interaction using the *real* serverTimestamp here
        };

        // Add createdAt only for new users
        if (isNewUser) {
            firestoreData.createdAt = serverTimestamp(); // Use the *real* serverTimestamp here
             // Initialize status to null for new users if not provided explicitly
            if (status === undefined) {
                 firestoreData.status = null;
            }
        }

        // Use setDoc with merge: true to create or update the document.
        // This handles both new user creation and updating existing fields like lastSeen.
        console.log(`Attempting Firestore ${isNewUser ? 'set' : 'set with merge'} for user ${uid} with data:`, JSON.stringify(firestoreData, null, 2));
        await setDoc(userRef, firestoreData, { merge: !isNewUser }); // Merge only if it's NOT a new user
        console.log(`Firestore: User profile ${isNewUser ? 'created' : 'updated'} for user: ${uid}`);

        // NOTE: Firebase Auth profile updates (displayName/photoURL) are typically handled client-side
        // immediately after the auth action (signUp/signInWithPopup/updateProfile).
        // This service focuses on the Firestore document.

    } catch (error: any) {
        console.error(`🔴 Firestore Error in createOrUpdateUserProfile for user ${uid}:`, error);
        // Provide a more informative error message
        const detailedErrorMessage = `Failed to ${isNewUser ? 'create' : 'update'} user profile in Firestore for UID ${uid}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error(detailedErrorMessage); // Log the detailed error
        // Re-throw with the detailed message
        throw new Error(detailedErrorMessage);
    }
};


/**
 * Type definition for data passed to updateUserProfileDocument.
 * Allows specific fields to be marked as 'SERVER_TIMESTAMP'.
 */
type UserProfileUpdateData = {
    [K in keyof Omit<UserProfile, 'uid' | 'email' | 'createdAt'>]?: UserProfile[K] | 'SERVER_TIMESTAMP' | null; // Allow null explicitly
} & {
    // Ensure uid, email, createdAt are not accidentally updated here
    uid?: never;
    email?: never;
    createdAt?: never;
};


/**
 * Updates specific fields in a user's profile document in Firestore.
 * Does NOT update Firebase Auth profile.
 * Accepts a special string 'SERVER_TIMESTAMP' for timestamp fields to be set by the server.
 * Primarily used for updating `lastSeen`, `status` or other non-Auth related profile data.
 *
 * @param uid - The user's unique ID.
 * @param data - An object containing the fields to update (e.g., { lastSeen: 'SERVER_TIMESTAMP', displayName: 'New Name', status: 'Online' }).
 * @returns Promise<void>
 * @throws Error if UID is missing, db is not initialized, or update fails.
 */
export const updateUserProfileDocument = async (uid: string, data: UserProfileUpdateData): Promise<void> => {
     if (!uid) {
        console.error("🔴 updateUserProfileDocument Error: No UID provided.");
        throw new Error("User ID is required for updating profile document.");
    }
     // Check if db is initialized BEFORE using it
     if (!db) {
        const dbErrorMsg = "Database service (db) is not initialized in updateUserProfileDocument. Check Firebase initialization (src/lib/firebase.ts). Firestore operations cannot proceed.";
        console.error("🔴 updateUserProfileDocument Error:", dbErrorMsg);
        // Throw a specific error if db is not available
        throw new Error(dbErrorMsg);
     }

     // Prepare update data, converting 'SERVER_TIMESTAMP' to the actual serverTimestamp() call
     // and Date objects to Firestore Timestamps. Filter out undefined values.
     const updateData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value === 'SERVER_TIMESTAMP') {
            acc[key] = serverTimestamp(); // Use the actual serverTimestamp() here
        } else if (value instanceof Date) {
            acc[key] = Timestamp.fromDate(value);
        } else if (value !== undefined) {
             // Handle empty strings for displayName or status as null
             if ((key === 'displayName' || key === 'status') && value === '') {
                 acc[key] = null;
             } else {
                 // Keep null values if explicitly provided
                 acc[key] = value;
             }
        }
        // Ignore undefined values
        return acc;
     }, {} as Record<string, any>); // Use Record<string, any> to allow serverTimestamp()


    if (Object.keys(updateData).length === 0) {
        console.warn(`Firestore: updateUserProfileDocument called for user ${uid} with no valid data to update (all values were undefined or empty strings for display/status).`);
        return; // No changes to make
    }

    const userRef = doc(db, 'users', uid);

    try {
         // Check if the document exists before trying to update it.
         // If it doesn't exist, consider creating it or logging a warning.
         const docSnap = await getDoc(userRef);
         if (!docSnap.exists()) {
             console.warn(`Firestore: updateUserProfileDocument - Document for user ${uid} does not exist. Cannot update. Attempted data:`, updateData);
             // For now, just throw an error or return if update is impossible.
             // Consider creating the document if it's missing and this function is called
             // await createOrUpdateUserProfile({ uid, email: null, ...data }); // Need email though...
             throw new Error(`User profile document for UID ${uid} does not exist. Update failed.`);
         }

         console.log(`Attempting Firestore update for user ${uid} with data:`, JSON.stringify(updateData, (key, value) => value === undefined ? null : value, 2)); // Log safely
         // Use updateDoc for targeted field updates.
         await updateDoc(userRef, updateData);
         console.log(`Firestore: Document for user ${uid} updated successfully.`);

    } catch (error: any) {
        // Log detailed Firestore error
        console.error(`🔴 Firestore Error updating document for user ${uid}:`, error);

        // Provide a more detailed error message including the attempted data and error code
        const detailedErrorMessage = `Failed to update Firestore document for UID ${uid}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}. Data attempted: ${JSON.stringify(updateData, (key, value) => value === undefined ? null : value)}`;
        console.error(detailedErrorMessage); // Log the detailed error

        // Re-throw with the detailed message for the client to potentially handle
        throw new Error(detailedErrorMessage);
    }
};
