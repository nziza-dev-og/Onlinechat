
'use server'; // Indicate this runs on the server or can be called from server components/actions

// Import types and FirebaseError check utility
import type { UserProfile } from '@/types';
import { isFirebaseError } from '@/lib/firebase-errors';
import type { FirestoreError } from 'firebase/firestore';

// Import Firebase functions dynamically within the action if needed, or rely on top-level imports
// If top-level imports continue to cause issues, uncomment the dynamic imports below.
import { doc, setDoc, serverTimestamp as firestoreServerTimestamp, Timestamp, getDoc, updateDoc, getFirestore } from 'firebase/firestore';
import { app } from '@/lib/firebase'; // Import the initialized app instance

/**
 * Input type for createOrUpdateUserProfile, containing only serializable data.
 */
export interface UserProfileInput {
    uid: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    status?: string | null;
    // Timestamps need to be handled as strings or numbers if passed from client, or use 'SERVER_TIMESTAMP' sentinel
    createdAt?: 'SERVER_TIMESTAMP';
    lastSeen?: 'SERVER_TIMESTAMP';
}


/**
 * Creates or updates a user's profile document in Firestore.
 * Accepts primitive user data to avoid passing non-serializable objects across server/client boundaries.
 * Handles both new user creation and updates for existing users (e.g., updating lastSeen).
 * Uses 'SERVER_TIMESTAMP' sentinel string for timestamp fields.
 *
 * @param userData - An object containing the user's uid, email, and optionally displayName, photoURL, status, and timestamp sentinels.
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

    // Get Firestore instance within the server action context
    const db = getFirestore(app);
    if (!db) {
        const dbErrorMsg = "Database service (db) could not be initialized in createOrUpdateUserProfile. Check Firebase app initialization.";
        console.error("🔴 createOrUpdateUserProfile Error:", dbErrorMsg);
        throw new Error(dbErrorMsg);
    }

    const userRef = doc(db, 'users', uid);
    let isNewUser = false;

    try {
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
            isNewUser = true;
            console.log(`Firestore: Creating new profile for user ${uid}`);
        } else {
            console.log(`Firestore: Updating profile for existing user ${uid}`);
        }

        const firestoreData: Record<string, any> = {
            uid: uid,
            email: email?.toLowerCase() ?? null,
            ...(displayName !== undefined && { displayName: displayName || null }),
            ...(photoURL !== undefined && { photoURL: photoURL ?? null }),
            ...(status !== undefined && { status: status || null }),
            lastSeen: firestoreServerTimestamp(), // Always update lastSeen
        };

        if (isNewUser) {
            firestoreData.createdAt = firestoreServerTimestamp();
            if (status === undefined) {
                 firestoreData.status = null;
            }
        }

        console.log(`Attempting Firestore ${isNewUser ? 'set' : 'set with merge'} for user ${uid}`);
        await setDoc(userRef, firestoreData, { merge: !isNewUser });
        console.log(`Firestore: User profile ${isNewUser ? 'created' : 'updated'} for user: ${uid}`);

    } catch (error: any) {
        const detailedErrorMessage = `Failed to ${isNewUser ? 'create' : 'update'} user profile in Firestore for UID ${uid}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};


/**
 * Type definition for data passed to updateUserProfileDocument.
 * Allows specific fields to be marked as 'SERVER_TIMESTAMP'.
 */
type UserProfileUpdateData = {
    displayName?: string | null;
    photoURL?: string | null;
    status?: string | null;
    lastSeen?: 'SERVER_TIMESTAMP';
} & {
    uid?: never;
    email?: never;
    createdAt?: never;
};


/**
 * Updates specific fields in a user's profile document in Firestore.
 * Ensures Firestore client and functions are obtained within the server action context.
 *
 * @param uid - The user's unique ID.
 * @param data - An object containing the fields to update (e.g., { lastSeen: 'SERVER_TIMESTAMP', status: 'Online' }).
 * @returns Promise<void>
 * @throws Error if UID is missing, db cannot be initialized, or update fails.
 */
export const updateUserProfileDocument = async (uid: string, data: UserProfileUpdateData): Promise<void> => {
     if (!uid) {
        console.error("🔴 updateUserProfileDocument Error: No UID provided.");
        throw new Error("User ID is required for updating profile document.");
    }

    // Get Firestore instance and functions within the server action context
    const db = getFirestore(app);
    if (!db) {
        const dbErrorMsg = "Database service (db) could not be initialized in updateUserProfileDocument. Check Firebase app initialization.";
        console.error("🔴 updateUserProfileDocument Error:", dbErrorMsg);
        throw new Error(dbErrorMsg);
    }
    // Explicitly get serverTimestamp function within this context if needed, though top-level should work
    // const serverTimestamp = firestoreServerTimestamp;

    const updateData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value === 'SERVER_TIMESTAMP') {
            // Use the imported firestoreServerTimestamp directly
            acc[key] = firestoreServerTimestamp();
        } else if (value !== undefined) {
             if ((key === 'displayName' || key === 'status') && value === '') {
                 acc[key] = null;
             } else {
                 acc[key] = value;
             }
        }
        return acc;
    }, {} as Record<string, any>);


    if (Object.keys(updateData).length === 0) {
        console.warn(`Firestore: updateUserProfileDocument called for user ${uid} with no valid data to update.`);
        return;
    }

    const userRef = doc(db, 'users', uid);

    try {
         const docSnap = await getDoc(userRef);
         if (!docSnap.exists()) {
             console.warn(`Firestore: updateUserProfileDocument - Document for user ${uid} does not exist. Cannot update. Attempted data:`, updateData);
             // Don't throw here, maybe log and return, or decide if creation is intended (use setDoc with merge:true)
             // For presence updates, the doc should exist. Throwing might be appropriate.
             throw new Error(`User profile document for UID ${uid} does not exist. Update failed.`);
         }

         console.log(`Attempting Firestore update for user ${uid} with data:`, JSON.stringify(updateData, null, 2));
         await updateDoc(userRef, updateData);
         console.log(`Firestore: Document for user ${uid} updated successfully.`);

    } catch (error: any) {
        const detailedErrorMessage = `Failed to update Firestore document for UID ${uid}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}. Data attempted: ${JSON.stringify(updateData, null, 2)}`;
        console.error("🔴 Detailed Firestore Update Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};
