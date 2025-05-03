
'use server';

import { doc, updateDoc, getFirestore } from 'firebase/firestore';
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
    throw new Error("Chat ID and User ID are required.");
  }

  // Get Firestore instance within the server action context
  const db = getFirestore(app);
  if (!db) {
    const dbErrorMsg = "Database service (db) could not be initialized in updateTypingStatus.";
    console.error("🔴 updateTypingStatus Error:", dbErrorMsg);
    throw new Error(dbErrorMsg);
  }

  const chatRef = doc(db, 'chats', chatId);

  // Use dot notation to update a specific field within the 'typing' map
  const updateData = {
    [`typing.${userId}`]: isTyping,
  };

  try {
    console.log(`Firestore: Updating typing status for user ${userId} in chat ${chatId} to ${isTyping}`);
    await updateDoc(chatRef, updateData);
    // console.log(`Firestore: Typing status updated successfully for user ${userId} in chat ${chatId}.`);
  } catch (error: any) {
    const detailedErrorMessage = `Failed to update typing status for user ${userId} in chat ${chatId}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}. Data attempted: ${JSON.stringify(updateData)}`;
    console.error("🔴 Detailed Firestore Update Error:", detailedErrorMessage, error);

     // Avoid throwing generic error, let the caller handle UI feedback if necessary
     // throw new Error(detailedErrorMessage);

     // Check if it's a specific Firebase error (like permissions) if needed
     if (isFirebaseError(error)) {
        console.error("Firebase specific error code:", error.code);
     }
     // Re-throw or handle as appropriate for the application flow
     // For typing status, maybe just log the error and continue
  }
};
