'use server'; // Indicate this runs on the server or can be called from server components/actions

// Import types and FirebaseError check utility
import type { UserProfile } from '@/types';
import { isFirebaseError } from '@/lib/firebase-errors';
import type { FirestoreError } from 'firebase/firestore';

// Import Firebase functions dynamically within the action if needed, or rely on top-level imports
// If top-level imports continue to cause issues, uncomment the dynamic imports below.
import { doc, setDoc, serverTimestamp as firestoreServerTimestamp, Timestamp, getDoc, updateDoc, getFirestore, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { app } from '@/lib/firebase'; // Import the initialized app instance
// import { getAuth as getAdminAuth } from 'firebase-admin/auth'; // Use Firebase Admin SDK for certain actions if needed (requires setup)

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
    let db;
    try {
        db = getFirestore(app);
    } catch (initError: any) {
        const dbErrorMsg = `Database service (db) could not be initialized in createOrUpdateUserProfile. Check Firebase app initialization. Error: ${initError.message}`;
        console.error("🔴 createOrUpdateUserProfile Error:", dbErrorMsg, initError);
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

        // Prepare the base data object
        const firestoreData: Record<string, any> = {
            uid: uid,
            email: email?.toLowerCase() ?? null,
            // Only update fields if they are explicitly provided in userData
            // Use existing data as fallback ONLY if it's an update, not for creation
            ...(displayName !== undefined && { displayName: displayName || null }),
            ...(photoURL !== undefined && { photoURL: photoURL || null }),
            ...(status !== undefined && { status: status || null }),
            lastSeen: firestoreServerTimestamp(), // Always update lastSeen on any interaction
        };

        if (isNewUser) {
            // Fields to set ONLY for new users
            firestoreData.createdAt = firestoreServerTimestamp();
            firestoreData.passwordChangeRequested = false;
            firestoreData.passwordChangeApproved = false;
            firestoreData.isAdmin = false; // Default to false

            // Handle admin status ONLY for new users based on the secret code
            // WARNING: This is insecure. Do not use in production without server-side validation.
            if (adminCode === ADMIN_SECRET_CODE) {
                console.warn(`Firestore: Assigning ADMIN role to new user ${uid} based on client-provided secret code.`);
                firestoreData.isAdmin = true;
            }

            // Set defaults for fields not provided during signup
            if (displayName === undefined) firestoreData.displayName = null;
            if (photoURL === undefined) firestoreData.photoURL = null;
            if (status === undefined) firestoreData.status = null;

            console.log(`Attempting Firestore set for NEW user ${uid}`);
            await setDoc(userRef, firestoreData); // Use setDoc for new users
            console.log(`Firestore: User profile created for user: ${uid}`);
        } else {
            // For existing users, update only the provided fields + lastSeen
            console.log(`Attempting Firestore update for user ${uid}`);
            if (Object.keys(firestoreData).length > 1 || 'lastSeen' in firestoreData) { // Ensure there's something to update besides uid
                await updateDoc(userRef, firestoreData); // Use updateDoc for existing users
                 console.log(`Firestore: User profile updated for user: ${uid}`);
            } else {
                console.log(`Firestore: No new data provided to update profile for user: ${uid}`);
            }
        }


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
     let db;
     try {
         db = getFirestore(app);
     } catch (initError: any) {
         const dbErrorMsg = `Database service (db) could not be initialized in updateUserProfileDocument. Check Firebase app initialization. Error: ${initError.message}`;
         console.error("🔴 updateUserProfileDocument Error:", dbErrorMsg, initError);
         throw new Error(dbErrorMsg);
     }


    const updateData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value === 'SERVER_TIMESTAMP') {
            acc[key] = firestoreServerTimestamp();
        } else if (value !== undefined) {
             // Treat empty string for displayName/status as null in Firestore
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
        return; // No actual update needed
    }

    const userRef = doc(db, 'users', uid);

    try {
         console.log(`Attempting Firestore update for user ${uid} with data:`, JSON.stringify(updateData)); // Don't stringify complex objects like timestamps
         await updateDoc(userRef, updateData);
         // console.log(`Firestore: Document for user ${uid} updated successfully.`); // Reduce successful logging noise

    } catch (error: any) {
         const baseErrorMessage = `Failed to update Firestore document for UID ${uid}.`;
         let firestoreErrorDetails = 'Unknown Firestore error';
         let errorCode = 'unknown';

        if (isFirebaseError(error)) {
            firestoreErrorDetails = error.message;
            errorCode = error.code;
            console.error(`🔴 Firestore Update Error (Code: ${errorCode}) for UID ${uid}: ${firestoreErrorDetails}`, error);
         } else {
            firestoreErrorDetails = error.message || firestoreErrorDetails;
            console.error(`🔴 Generic Update Error for UID ${uid}: ${firestoreErrorDetails}`, error);
         }

         const attemptedDataString = JSON.stringify(updateData); // Stringify here for error message
         const detailedErrorMessage = `${baseErrorMessage} Error: ${firestoreErrorDetails} (Code: ${errorCode}). Data attempted: ${attemptedDataString}`;

         // Log the detailed error but throw a more generic one to the client
         // This prevents exposing too much internal detail or potentially sensitive data.
         console.error("🔴 Detailed Firestore Update Error Log:", detailedErrorMessage);
         throw new Error(`${baseErrorMessage} Please check connection or try again.`);
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
   let db; try { db = getFirestore(app); } catch (e: any) { throw new Error(`DB init error: ${e.message}`); }
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
   let db; try { db = getFirestore(app); } catch (e: any) { throw new Error(`DB init error: ${e.message}`); }
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
     let db; try { db = getFirestore(app); } catch (e: any) { throw new Error(`DB init error: ${e.message}`); }
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
     let db; try { db = getFirestore(app); } catch (e: any) { throw new Error(`DB init error: ${e.message}`); }
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
 * Converts Timestamps to serializable format (ISO strings).
 *
 * @param adminUserId - The UID of the admin performing the action (for verification).
 * @returns Promise<UserProfile[]> - Array of user profiles requesting password change with serializable timestamps.
 * @throws Error if admin check fails, db is not initialized, or fetch fails.
 */
export const getPasswordChangeRequests = async (adminUserId: string): Promise<UserProfile[]> => {
    if (!adminUserId) throw new Error("Admin User ID is required.");
     let db; try { db = getFirestore(app); } catch (e: any) { throw new Error(`DB init error: ${e.message}`); }
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

        const requests: UserProfile[] = querySnapshot.docs.map(doc => {
            const data = doc.data();
             // Simple validation to ensure core fields exist
             if (!data.uid) {
                console.warn("Skipping user profile with missing UID:", doc.id);
                return null;
             }
             // Convert Timestamps to JS Dates (or ISO strings if preferred) for client-side usage
             const convertTimestamp = (ts: any): Date | undefined => {
                 if (ts instanceof Timestamp) return ts.toDate();
                 if (ts && typeof ts.toDate === 'function') return ts.toDate(); // Handle Firestore-like Timestamp objects
                 return undefined;
             };
            return {
                uid: data.uid,
                displayName: data.displayName ?? null,
                email: data.email ?? null,
                photoURL: data.photoURL ?? null,
                status: data.status ?? null,
                lastSeen: convertTimestamp(data.lastSeen), // Convert or leave as undefined
                createdAt: convertTimestamp(data.createdAt), // Convert or leave as undefined
                isAdmin: data.isAdmin ?? false,
                passwordChangeRequested: data.passwordChangeRequested ?? false,
                passwordChangeApproved: data.passwordChangeApproved ?? false,
            };
        }).filter((profile): profile is UserProfile => profile !== null); // Filter out nulls

        console.log(`Firestore: Fetched ${requests.length} password change requests for admin ${adminUserId}.`);
        return requests;

    } catch (error: any) {
        const msg = `Failed to fetch password change requests. Error: ${error.message}`;
        console.error("🔴 Firestore Error:", msg, error);
        throw new Error(msg);
    }
};
