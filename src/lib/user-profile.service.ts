
'use server'; // Indicate this runs on the server or can be called from server components/actions

import { doc, setDoc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import type { UserCredential, User as FirebaseUser } from 'firebase/auth';
import { updateProfile as updateAuthProfile } from 'firebase/auth';


/**
 * Creates or updates a user's profile document in Firestore and optionally updates Firebase Auth profile.
 *
 * @param userOrCredential - The Firebase User object or UserCredential.
 * @param details - Optional details like displayName and photoURL to update.
 * @returns Promise<void>
 */
export const createOrUpdateUserProfile = async (
    userOrCredential: FirebaseUser | UserCredential,
    details?: { displayName?: string | null; photoURL?: string | null }
): Promise<void> => {
    const user = 'user' in userOrCredential ? userOrCredential.user : userOrCredential;
    if (!user) {
        console.error("No user provided to createOrUpdateUserProfile.");
        throw new Error("Invalid user data.");
    }

    const userRef = doc(db, 'users', user.uid);
    let isNewUser = false;

    try {
        // Check if the user document exists to determine if it's a new registration vs. login update
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
            isNewUser = true;
            console.log(`Creating new profile for user ${user.uid}`);
        } else {
            console.log(`Updating profile for existing user ${user.uid}`);
        }

        // 1. Prepare data for Firebase Auth update
        const authUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
        if (details?.displayName !== undefined && details.displayName !== user.displayName) {
            authUpdateData.displayName = details.displayName;
        }
        if (details?.photoURL !== undefined && details.photoURL !== user.photoURL) {
            authUpdateData.photoURL = details.photoURL;
        }

        // 2. Update Firebase Auth profile (if necessary)
        if (Object.keys(authUpdateData).length > 0) {
            await updateAuthProfile(user, authUpdateData);
            console.log("Firebase Auth profile updated:", authUpdateData);
        }

        // 3. Prepare data for Firestore document
        const firestoreData: Partial<UserProfile> = {
            uid: user.uid,
            email: user.email,
            // Use provided details or fallback to current Auth user data
            displayName: details?.displayName !== undefined ? details.displayName : user.displayName,
            photoURL: details?.photoURL !== undefined ? details.photoURL : user.photoURL,
            lastSeen: serverTimestamp(), // Always update lastSeen
        };

        // Add createdAt only for new users
        if (isNewUser) {
            firestoreData.createdAt = serverTimestamp();
        }

        // 4. Create or update Firestore document using setDoc with merge: true
        await setDoc(userRef, firestoreData, { merge: true });
        console.log("Firestore user profile updated/created:", firestoreData);

    } catch (error) {
        console.error("Error in createOrUpdateUserProfile:", error);
        // Re-throw the error to be handled by the caller (e.g., show a toast)
        throw new Error("Failed to update user profile.");
    }
};


/**
 * Updates specific fields in a user's profile document in Firestore.
 * Does NOT update Firebase Auth profile.
 *
 * @param uid - The user's unique ID.
 * @param data - An object containing the fields to update (e.g., { displayName: 'New Name' }).
 * @returns Promise<void>
 */
export const updateUserProfileDocument = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
     if (!uid) {
        console.error("No UID provided to updateUserProfileDocument.");
        throw new Error("User ID is required.");
    }
    if (Object.keys(data).length === 0) {
        console.warn("updateUserProfileDocument called with empty data.");
        return; // No changes to make
    }

    const userRef = doc(db, 'users', uid);

    try {
        // Use setDoc with merge: true to update only specified fields or create if doesn't exist (though typically it should)
        await setDoc(userRef, data, { merge: true });
        console.log(`Firestore document for user ${uid} updated with:`, data);
    } catch (error) {
        console.error(`Error updating Firestore document for user ${uid}:`, error);
        throw new Error("Failed to update profile document.");
    }
};
