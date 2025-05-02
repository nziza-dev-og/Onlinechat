
'use server'; // Indicate this runs on the server or can be called from server components/actions

import { doc, setDoc, serverTimestamp, Timestamp, getDoc, updateDoc, type FirestoreError } from 'firebase/firestore';
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
        console.error("🔴 createOrUpdateUserProfile Error: Invalid user data provided (UID is missing).", userData);
        throw new Error("Invalid user data: UID is required.");
    }

    const { uid, email, displayName, photoURL } = userData;

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
        const firestoreData: Partial<UserProfile> = {
            uid: uid, // Ensure uid is always set/updated
            email: email,
            // Only set displayName/photoURL if they have a value (not undefined or null).
            // Use null explicitly if you want to clear the field in Firestore.
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
        console.log(`Firestore: User profile ${isNewUser ? 'created' : 'updated'} for user: ${uid}`); // Simplified log

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

     // Filter out undefined values, as Firestore updateDoc throws if you provide them.
     const updateData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            // Convert Date objects to Firestore Timestamps before writing
            acc[key as keyof Partial<UserProfile>] = value instanceof Date ? Timestamp.fromDate(value) : value;
        }
        return acc;
     }, {} as Partial<UserProfile>);


    if (Object.keys(updateData).length === 0) {
        console.warn(`Firestore: updateUserProfileDocument called for user ${uid} with no valid data to update (all values were undefined).`);
        return; // No changes to make
    }

    const userRef = doc(db, 'users', uid);

    try {
         // Use updateDoc for targeted field updates. Assumes the document exists.
         // If the doc might not exist, use setDoc with merge:true instead, or check existence first.
         await updateDoc(userRef, updateData);
         // console.log(`Firestore: Document for user ${uid} updated with:`, updateData); // Keep log noise low for frequent updates like lastSeen

    } catch (error: any) {
        // Log detailed Firestore error
        console.error(`🔴 Firestore Error updating document for user ${uid}:`, error);
        const detailedErrorMessage = `Failed to update Firestore document for UID ${uid}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}. Data attempted: ${JSON.stringify(updateData)}`;
        console.error(detailedErrorMessage);
        // Re-throw with the detailed message
        throw new Error(detailedErrorMessage);
    }
};
