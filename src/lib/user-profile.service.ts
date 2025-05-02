
'use server'; // Indicate this runs on the server or can be called from server components/actions

import { doc, setDoc, serverTimestamp, Timestamp, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Import db which might be undefined if init failed
import type { UserProfile } from '@/types';
import type { UserCredential, User as FirebaseUser } from 'firebase/auth';
import { updateProfile as updateAuthProfile, getAuth } from 'firebase/auth'; // Import getAuth

/**
 * Input type for createOrUpdateUserProfile, containing only serializable data.
 */
export interface UserProfileInput {
    uid: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
}


/**
 * Creates or updates a user's profile document in Firestore and optionally updates Firebase Auth profile.
 * Accepts primitive user data to avoid passing non-serializable objects across server/client boundaries.
 * Handles both new user creation and updates for existing users (e.g., updating lastSeen).
 *
 * @param userData - An object containing the user's uid, email, and optionally displayName and photoURL.
 * @returns Promise<void>
 * @throws Error if user data is invalid, db is not initialized, or update fails.
 */
export const createOrUpdateUserProfile = async (
    userData: UserProfileInput
): Promise<void> => {
    // Validate essential userData
    if (!userData || !userData.uid) {
        console.error("Invalid user data provided to createOrUpdateUserProfile:", userData);
        throw new Error("Invalid user data: UID is required.");
    }

    const { uid, email, displayName, photoURL } = userData;

    // Check if db is initialized BEFORE using it
    if (!db) {
        const dbErrorMsg = "Database service (db) is not initialized in createOrUpdateUserProfile. Check Firebase initialization in src/lib/firebase.ts and ensure configuration is correct.";
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
            console.log(`Creating new profile for user ${uid}`);
        } else {
            console.log(`Updating profile for existing user ${uid}`);
        }

        // --- Firestore Document Update ---
        // Prepare data for Firestore document
        const firestoreData: Partial<UserProfile> = {
            uid: uid, // Ensure uid is always set/updated
            email: email,
            // Only update displayName/photoURL if they are provided and different from existing or null
            // This prevents overwriting existing values with null unnecessarily on simple logins
            ...(displayName !== undefined && { displayName: displayName }),
            ...(photoURL !== undefined && { photoURL: photoURL }),
            lastSeen: serverTimestamp(), // Always update lastSeen on any interaction
        };

        // Add createdAt only for new users
        if (isNewUser) {
            firestoreData.createdAt = serverTimestamp();
        }

        // Use setDoc with merge: true to create or update the document.
        // This handles both new user creation and updating existing fields like lastSeen.
        await setDoc(userRef, firestoreData, { merge: true });
        console.log(`Firestore user profile ${isNewUser ? 'created' : 'updated'} for user:`, uid, firestoreData);

        // NOTE: Firebase Auth profile updates (displayName/photoURL) are typically handled client-side
        // immediately after the auth action (signUp/signInWithPopup/updateProfile).
        // This service focuses on the Firestore document.

    } catch (error: any) {
        console.error(`Error in createOrUpdateUserProfile for user ${uid}:`, error);
        const errorMessage = error.message || 'Unknown error in createOrUpdateUserProfile';
        const errorCode = error.code;
        console.error(`Error Code: ${errorCode}, Message: ${errorMessage}`);
        // Re-throw the error to be handled by the caller
        throw new Error(`Failed to update user profile in Firestore: ${errorMessage} (Code: ${errorCode})`);
    }
};


/**
 * Updates specific fields in a user's profile document in Firestore.
 * Does NOT update Firebase Auth profile. Accepts Date object for time fields.
 * Primarily used for updating `lastSeen` or other non-Auth related profile data.
 *
 * @param uid - The user's unique ID.
 * @param data - An object containing the fields to update (e.g., { lastSeen: new Date() }). Keys with undefined values are ignored.
 * @returns Promise<void>
 * @throws Error if UID is missing, db is not initialized, or update fails.
 */
export const updateUserProfileDocument = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
     if (!uid) {
        console.error("No UID provided to updateUserProfileDocument.");
        throw new Error("User ID is required for updating profile document.");
    }
     // Check if db is initialized BEFORE using it
     if (!db) {
        const dbErrorMsg = "Database service (db) is not initialized in updateUserProfileDocument. Check Firebase initialization in src/lib/firebase.ts.";
        console.error("🔴 updateUserProfileDocument Error:", dbErrorMsg);
        // Throw a specific error if db is not available
        throw new Error(dbErrorMsg);
     }

     // Filter out undefined values, as Firestore updateDoc throws if you provide them.
     const updateData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            // Ensure Date objects are converted to Timestamps if necessary, though serverTimestamp() handles this for lastSeen
            acc[key as keyof Partial<UserProfile>] = value instanceof Date ? Timestamp.fromDate(value) : value;
        }
        return acc;
     }, {} as Partial<UserProfile>);


    if (Object.keys(updateData).length === 0) {
        console.warn(`updateUserProfileDocument called for user ${uid} with no valid data to update after filtering undefined.`);
        return; // No changes to make
    }

    const userRef = doc(db, 'users', uid);

    try {
         // Use updateDoc for targeted field updates. Assumes the document exists.
         await updateDoc(userRef, updateData);
         // console.log(`Firestore document for user ${uid} updated (using updateDoc) with:`, updateData); // Reduce log noise

    } catch (error: any) {
        console.error(`Error updating Firestore document for user ${uid}:`, error);
        const errorMessage = error.message || 'Unknown Firestore error';
        const errorCode = error.code;
        console.error(`Firestore Error Code: ${errorCode}, Message: ${errorMessage}`);
        console.error(`Data attempted to write: ${JSON.stringify(updateData)}`);
        // Re-throw a more specific error that includes the original Firestore message and code
        throw new Error(`Failed to update profile document: ${errorMessage} (Code: ${errorCode})`);
    }
};
