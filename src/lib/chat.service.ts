
'use server';

import { doc, updateDoc, getFirestore, serverTimestamp as firestoreServerTimestamp } from 'firebase/firestore'; // Added serverTimestamp
import { app } from '@/lib/firebase'; // Import the initialized app instance
import { isFirebaseError } from '@/lib/firebase-errors';

/**
 * Updates the typing status of a user within a specific chat document in Firestore.
 *
 * @param chatId - The ID of the chat document.
 * @param userId - The ID of the user whose typing status is being updated.
 * @param isTyping - Boolean indicating whether the user is currently typing.
 * @returns Promise<void>
 * @throws Error if chat ID or user ID is missing, db cannot be initialized, or update fails.
 */
export const updateTypingStatus = async (
  chatId: string,
  userId: string,
  isTyping: boolean
): Promise<void> => {
  if (!chatId || !userId) {
    console.error("🔴 updateTypingStatus Error: Chat ID and User ID are required.");
    // Consider not throwing, but logging, depending on how critical typing status is
    return;
    // throw new Error("Chat ID and User ID are required.");
  }

  // Get Firestore instance within the server action context
  let db;
  try {
      // Validate Firebase app instance before getting Firestore
      if (!app) {
        throw new Error("Firebase app is not initialized.");
      }
      db = getFirestore(app);
  } catch (initError: any) {
      const dbErrorMsg = `DB init error in updateTypingStatus: ${initError.message}`;
      console.error("🔴 updateTypingStatus Error:", dbErrorMsg, initError);
      // Consider not throwing, but logging
      return;
      // throw new Error(dbErrorMsg);
  }

  const chatRef = doc(db, 'chats', chatId);

  // Use dot notation to update a specific field within the 'typing' map
  // Also update a general lastModified field for the chat
  const updateData: Record<string, any> = {
    [`typing.${userId}`]: isTyping,
    // Optionally update a lastModified timestamp for the chat document
    // lastModified: firestoreServerTimestamp()
  };

  try {
    // console.log(`Firestore: Updating typing status for user ${userId} in chat ${chatId} to ${isTyping}`);
    await updateDoc(chatRef, updateData);
    // console.log(`Firestore: Typing status updated successfully for user ${userId} in chat ${chatId}.`);
  } catch (error: any) {
    const baseErrorMessage = `Failed to update typing status for user ${userId} in chat ${chatId}.`;
    let firestoreErrorDetails = 'Unknown Firestore error';
    let errorCode = 'unknown';

    if (isFirebaseError(error)) {
       firestoreErrorDetails = error.message;
       errorCode = error.code;
        console.error(`🔴 Firestore Update Error (Code: ${errorCode}) for typing status in chat ${chatId}: ${firestoreErrorDetails}`, error);
     } else {
        firestoreErrorDetails = error.message || firestoreErrorDetails;
        console.error(`🔴 Generic Update Error for typing status in chat ${chatId}: ${firestoreErrorDetails}`, error);
     }

     // Log the detailed error but avoid throwing for typing status updates
     const attemptedDataString = JSON.stringify(updateData); // Stringify here for error message
     const detailedErrorMessage = `${baseErrorMessage} Error: ${firestoreErrorDetails} (Code: ${errorCode}). Data attempted: ${attemptedDataString}`;
     console.error("🔴 Detailed Firestore Typing Update Error Log:", detailedErrorMessage);

     // Do NOT throw - typing status failure shouldn't break the app flow
     // throw new Error(`${baseErrorMessage} Please check connection or try again.`);
  }
};

