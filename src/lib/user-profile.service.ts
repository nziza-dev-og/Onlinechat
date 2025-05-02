
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
        const dbErrorMsg = "Database service (db) is not initialized in createOrUpdateUserProfile. Check Firebase initialization in src/lib/firebase.ts and ensure environment variables/hardcoded config are correct.";
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

        // --- Firebase Auth Profile Update (Still requires handling on client/server differently if needed) ---
        // NOTE: Updating Firebase Auth profile (displayName/photoURL) *directly* from a server-only function
        // like this is generally NOT the standard pattern. Auth updates usually happen client-side after auth actions,
        // or via Admin SDK on a backend.
        // For simplicity in this structure, we'll attempt it, but be aware of potential limitations/errors
        // if Auth instance isn't properly available/scoped here. A more robust solution might involve
        // separating Firestore updates (server-side safe) from Auth updates (client-side triggered).

        // Attempt to get the *current* auth user on the server (might not work reliably without Admin SDK)
        // This part is complex in Next.js App Router server actions. Firebase Client SDK isn't designed for this.
        // A pragmatic approach for now might be to ONLY update Firestore here and handle Auth profile updates client-side.
        // Let's proceed with the Firestore update logic for now.

        // --- Firestore Document Update ---
        // Prepare data for Firestore document
        const firestoreData: Partial<UserProfile> = {
            uid: uid,
            email: email,
            displayName: displayName, // Use the displayName passed in userData
            photoURL: photoURL,   // Use the photoURL passed in userData
            lastSeen: serverTimestamp(), // Always update lastSeen on login/signup/update
        };

        // Add createdAt only for new users
        if (isNewUser) {
            firestoreData.createdAt = serverTimestamp();
        }

        // Create or update Firestore document using setDoc with merge: true
        await setDoc(userRef, firestoreData, { merge: true });
        console.log("Firestore user profile updated/created for user:", uid, firestoreData);

    } catch (error: any) {
        console.error(`Error in createOrUpdateUserProfile for user ${uid}:`, error);
        // Provide more context about the error if possible
        const errorMessage = error.message || 'Unknown error in createOrUpdateUserProfile';
        const errorCode = error.code;
        console.error(`Error Code: ${errorCode}, Message: ${errorMessage}`);
        // Re-throw the error to be handled by the caller (e.g., show a toast)
        // Include the original error message for better debugging
        throw new Error(`Failed to update user profile: ${errorMessage} (Code: ${errorCode})`);
    }
};


/**
 * Updates specific fields in a user's profile document in Firestore.
 * Does NOT update Firebase Auth profile. Accepts Date object for time fields.
 *
 * @param uid - The user's unique ID.
 * @param data - An object containing the fields to update (e.g., { displayName: 'New Name', lastSeen: new Date() }). Keys with undefined values are ignored.
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
            acc[key as keyof Partial<UserProfile>] = value;
        }
        return acc;
     }, {} as Partial<UserProfile>);


    if (Object.keys(updateData).length === 0) {
        console.warn(`updateUserProfileDocument called for user ${uid} with no valid data to update after filtering undefined.`);
        return; // No changes to make
    }

    const userRef = doc(db, 'users', uid);

    // Use updateDoc for targeted field updates. This requires the document to exist.
    // If you need `setDoc` with `merge: true` (upsert behavior), you'd use that instead.
    // Since this is typically called *after* profile creation or for presence updates,
    // updateDoc is usually appropriate.
    try {
         await updateDoc(userRef, updateData);
         console.log(`Firestore document for user ${uid} updated (using updateDoc) with:`, updateData);

    } catch (error: any) {
        console.error(`Error updating Firestore document for user ${uid}:`, error);
        // Provide more context about the error if possible
        const errorMessage = error.message || 'Unknown Firestore error';
        const errorCode = error.code; // Firestore error code (e.g., 'permission-denied')
        console.error(`Firestore Error Code: ${errorCode}, Message: ${errorMessage}`);
        // Include data being sent for debugging
        console.error(`Data attempted to write: ${JSON.stringify(updateData)}`);
        // Re-throw a more specific error that includes the original Firestore message and code
        throw new Error(`Failed to update profile document: ${errorMessage} (Code: ${errorCode})`);
    }
};
