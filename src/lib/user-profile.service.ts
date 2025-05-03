
'use server'; // Indicate this runs on the server or can be called from server components/actions

// Import types and FirebaseError check utility
import type { UserProfile } from '@/types';
import { isFirebaseError } from '@/lib/firebase-errors';
import type { FirestoreError } from 'firebase/firestore';

// Import Firebase functions dynamically within the action if needed, or rely on top-level imports
// If top-level imports continue to cause issues, uncomment the dynamic imports below.
import { doc, setDoc, serverTimestamp as firestoreServerTimestamp, Timestamp, getDoc, updateDoc, getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { app, auth as serverAuth } from '@/lib/firebase'; // Import the initialized app instance AND server-side auth if needed
import { getAuth as getAdminAuth } from 'firebase-admin/auth'; // Use Firebase Admin SDK for certain actions if needed (requires setup)

// IMPORTANT SECURITY WARNING: Storing secret codes directly in client-side code is highly insecure.
// This implementation is based on the user request but is NOT recommended for production.
// A secure alternative is to assign roles manually via the Firebase console or using Cloud Functions.
const ADMIN_SECRET_CODE = 'juleschat';


/**
 * Input type for createOrUpdateUserProfile, containing only serializable data.
 */
export interface UserProfileInput {
    uid: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    status?: string | null;
    adminCode?: string | null; // Added field for the secret code
    // Timestamps need to be handled as strings or numbers if passed from client, or use 'SERVER_TIMESTAMP' sentinel
    createdAt?: 'SERVER_TIMESTAMP';
    lastSeen?: 'SERVER_TIMESTAMP';
}


/**
 * Creates or updates a user's profile document in Firestore.
 * Accepts primitive user data to avoid passing non-serializable objects across server/client boundaries.
 * Handles admin registration based on a secret code (INSECURE - SEE WARNING ABOVE).
 * Handles both new user creation and updates for existing users (e.g., updating lastSeen).
 * Uses 'SERVER_TIMESTAMP' sentinel string for timestamp fields.
 *
 * @param userData - An object containing the user's uid, email, and optionally displayName, photoURL, status, adminCode, and timestamp sentinels.
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

    const { uid, email, displayName, photoURL, status, adminCode } = userData;

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
            // Initialize password change fields for new users
            ...(isNewUser && { passwordChangeRequested: false, passwordChangeApproved: false }),
        };

        if (isNewUser) {
            firestoreData.createdAt = firestoreServerTimestamp();
            // Handle admin status only for new users based on the secret code
            // WARNING: This is insecure. Do not use in production without server-side validation.
            if (adminCode === ADMIN_SECRET_CODE) {
                console.warn(`Firestore: Assigning ADMIN role to new user ${uid} based on client-provided secret code.`);
                firestoreData.isAdmin = true;
            } else {
                firestoreData.isAdmin = false;
            }
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
 * Prevents isAdmin from being updated directly by clients.
 */
type UserProfileUpdateData = {
    displayName?: string | null;
    photoURL?: string | null;
    status?: string | null;
    lastSeen?: 'SERVER_TIMESTAMP';
    // Password change flags can be updated by specific actions, but not generally
    passwordChangeRequested?: boolean;
    passwordChangeApproved?: boolean;
} & {
    uid?: never;
    email?: never;
    createdAt?: never;
    isAdmin?: never; // Explicitly prevent isAdmin updates via this general function
};


/**
 * Updates specific fields in a user's profile document in Firestore.
 * Ensures Firestore client and functions are obtained within the server action context.
 * Does NOT allow updating the isAdmin field. Use specific admin actions for that.
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

    const updateData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value === 'SERVER_TIMESTAMP') {
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

    // Ensure isAdmin is never updated through this function
    if ('isAdmin' in updateData) {
         console.warn(`Firestore: Attempt to update 'isAdmin' field via general updateUserProfileDocument function blocked for user ${uid}.`);
         delete updateData.isAdmin;
    }

    if (Object.keys(updateData).length === 0) {
        console.warn(`Firestore: updateUserProfileDocument called for user ${uid} with no valid data to update.`);
        return;
    }

    const userRef = doc(db, 'users', uid);

    try {
         const docSnap = await getDoc(userRef);
         if (!docSnap.exists()) {
             console.warn(`Firestore: updateUserProfileDocument - Document for user ${uid} does not exist. Cannot update. Attempted data:`, updateData);
             throw new Error(`User profile document for UID ${uid} does not exist. Update failed.`);
         }

         console.log(`Attempting Firestore update for user ${uid} with data:`, JSON.stringify(updateData, null, 2));
         await updateDoc(userRef, updateData);
         console.log(`Firestore: Document for user ${uid} updated successfully.`);

    } catch (error: any) {
        const detailedErrorMessage = `Failed to update Firestore document for UID ${uid}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}. Data attempted: ${JSON.stringify(updateData, null, 2)}`;
        console.error("🔴 Detailed Firestore Update Error:", detailedErrorMessage, error);
        // Re-throw a more specific error if possible, otherwise the detailed one
        throw new Error(error.message || detailedErrorMessage);
    }
};

/**
 * Sets the passwordChangeRequested flag for a user.
 *
 * @param userId - The ID of the user requesting the password change.
 * @returns Promise<void>
 * @throws Error if userId is missing, db is not initialized, or update fails.
 */
export const requestPasswordChange = async (userId: string): Promise<void> => {
  if (!userId) {
    throw new Error("User ID is required to request password change.");
  }
  const db = getFirestore(app);
  if (!db) throw new Error("Database service not available.");

  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, { passwordChangeRequested: true, passwordChangeApproved: false });
    console.log(`Firestore: Password change requested for user ${userId}.`);
  } catch (error: any) {
    const msg = `Failed to request password change for user ${userId}. Error: ${error.message}`;
    console.error("🔴 Firestore Error:", msg, error);
    throw new Error(msg);
  }
};

/**
 * Approves or denies a user's password change request. Only callable by an admin.
 *
 * @param adminUserId - The UID of the admin performing the action.
 * @param targetUserId - The UID of the user whose request is being reviewed.
 * @param approve - Boolean indicating whether to approve (true) or deny (false) the request.
 * @returns Promise<void>
 * @throws Error if admin check fails, user IDs are missing, db is not initialized, or update fails.
 */
export const reviewPasswordChangeRequest = async (adminUserId: string, targetUserId: string, approve: boolean): Promise<void> => {
  if (!adminUserId || !targetUserId) {
    throw new Error("Admin User ID and Target User ID are required.");
  }
  const db = getFirestore(app);
  if (!db) throw new Error("Database service not available.");

  const adminRef = doc(db, 'users', adminUserId);
  const targetUserRef = doc(db, 'users', targetUserId);

  try {
    // 1. Verify admin status
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
      throw new Error("Unauthorized: Only administrators can review password change requests.");
    }

    // 2. Update the target user's document
    const updateData = {
      passwordChangeRequested: false, // Reset the request flag
      passwordChangeApproved: approve, // Set the approval status
    };
    await updateDoc(targetUserRef, updateData);
    console.log(`Firestore: Password change request for user ${targetUserId} reviewed by admin ${adminUserId}. Approved: ${approve}.`);

  } catch (error: any) {
    const msg = `Failed to review password change request for user ${targetUserId}. Error: ${error.message}`;
    console.error("🔴 Firestore Error:", msg, error);
    throw new Error(msg);
  }
};

/**
 * Fetches a specific user's profile to check their password change approval status.
 *
 * @param userId - The UID of the user to check.
 * @returns Promise<{ approved: boolean }> - An object indicating if the password change is approved.
 * @throws Error if user not found, db is not initialized, or fetch fails.
 */
export const checkPasswordChangeApproval = async (userId: string): Promise<{ approved: boolean }> => {
    if (!userId) throw new Error("User ID is required.");
    const db = getFirestore(app);
    if (!db) throw new Error("Database service not available.");

    const userRef = doc(db, 'users', userId);
    try {
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
            throw new Error("User profile not found.");
        }
        const profile = docSnap.data() as UserProfile;
        return { approved: profile.passwordChangeApproved ?? false };
    } catch (error: any) {
        const msg = `Failed to check password change approval for user ${userId}. Error: ${error.message}`;
        console.error("🔴 Firestore Error:", msg, error);
        throw new Error(msg);
    }
};

/**
 * Resets the passwordChangeApproved flag after the user successfully changes their password.
 *
 * @param userId - The UID of the user whose flag needs resetting.
 * @returns Promise<void>
 * @throws Error if userId is missing, db is not initialized, or update fails.
 */
export const resetPasswordChangeApproval = async (userId: string): Promise<void> => {
    if (!userId) throw new Error("User ID is required.");
    const db = getFirestore(app);
    if (!db) throw new Error("Database service not available.");

    const userRef = doc(db, 'users', userId);
    try {
        await updateDoc(userRef, { passwordChangeApproved: false });
        console.log(`Firestore: Password change approval flag reset for user ${userId}.`);
    } catch (error: any) {
        const msg = `Failed to reset password change approval for user ${userId}. Error: ${error.message}`;
        console.error("🔴 Firestore Error:", msg, error);
        throw new Error(msg);
    }
};

/**
 * Fetches all users requesting a password change. Intended for admin use.
 *
 * @param adminUserId - The UID of the admin performing the action (for verification).
 * @returns Promise<UserProfile[]> - Array of user profiles requesting password change.
 * @throws Error if admin check fails, db is not initialized, or fetch fails.
 */
export const getPasswordChangeRequests = async (adminUserId: string): Promise<UserProfile[]> => {
    if (!adminUserId) throw new Error("Admin User ID is required.");
    const db = getFirestore(app);
    if (!db) throw new Error("Database service not available.");

    const adminRef = doc(db, 'users', adminUserId);
    try {
        // 1. Verify admin status
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
            throw new Error("Unauthorized: Only administrators can view password change requests.");
        }

        // 2. Query users with passwordChangeRequested = true
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where("passwordChangeRequested", "==", true));
        const querySnapshot = await getDocs(q);

        const requests: UserProfile[] = querySnapshot.docs.map(doc => doc.data() as UserProfile);
        console.log(`Firestore: Fetched ${requests.length} password change requests for admin ${adminUserId}.`);
        return requests;

    } catch (error: any) {
        const msg = `Failed to fetch password change requests. Error: ${error.message}`;
        console.error("🔴 Firestore Error:", msg, error);
        throw new Error(msg);
    }
};
