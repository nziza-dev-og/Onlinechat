
'use server';

import { doc, updateDoc, getFirestore, serverTimestamp as firestoreServerTimestamp, collection, addDoc, Timestamp } from 'firebase/firestore'; // Added collection, addDoc, Timestamp
import { app, db as firebaseDb } from '@/lib/firebase'; // Import the initialized app instance and firebaseDb
import { isFirebaseError } from '@/lib/firebase-errors';
import type { User, Message } from '@/types'; // Import User type

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
    console.warn("updateTypingStatus warning: Chat ID or User ID missing. Skipping update.");
    return;
  }

  let db;
  try {
      if (!firebaseDb) { // Use the imported firebaseDb instance
        throw new Error("Firestore (firebaseDb) is not initialized.");
      }
      db = firebaseDb;
  } catch (initError: any) {
      const dbErrorMsg = `DB init error in updateTypingStatus: ${initError.message}`;
      console.error("🔴 updateTypingStatus Error:", dbErrorMsg, initError);
      return;
  }

  const chatRef = doc(db, 'chats', chatId);
  const updateData: Record<string, any> = {
    [`typing.${userId}`]: isTyping,
  };

  try {
    await updateDoc(chatRef, updateData);
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
     const attemptedDataString = JSON.stringify(updateData);
     const detailedErrorMessage = `${baseErrorMessage} Error: ${firestoreErrorDetails} (Code: ${errorCode}). Data attempted: ${attemptedDataString}`;
     console.error("🔴 Detailed Firestore Typing Update Error Log:", detailedErrorMessage);
  }
};


/**
 * Sends a message indicating a post has been shared to a specific chat.
 *
 * @param chatId - The ID of the chat to send the message to.
 * @param sender - The User object of the user sending the share.
 * @param sharedPostId - The ID of the post being shared.
 * @param originalPostAuthorName - The display name of the author of the original post.
 * @param postPreviewText - A snippet or description of the shared post.
 * @returns Promise<string> - The ID of the newly created message document.
 * @throws Error if Firestore is not available, or if adding the document fails.
 */
export const sendSharedPostMessageToChat = async (
  chatId: string,
  sender: User,
  sharedPostId: string,
  originalPostAuthorName: string | null,
  postPreviewText: string
): Promise<string> => {
  if (!firebaseDb) {
    console.error("🔴 sendSharedPostMessageToChat Error: Firestore (firebaseDb) not available.");
    throw new Error("Database service not available.");
  }
  if (!chatId || !sender?.uid || !sharedPostId) {
    throw new Error("Chat ID, sender information, and shared Post ID are required.");
  }

  const messagesRef = collection(firebaseDb, 'chats', chatId, 'messages');
  const messageText = `${sender.displayName || 'A user'} shared a post${originalPostAuthorName ? ` by ${originalPostAuthorName}` : ''}: ${postPreviewText.substring(0, 100)}${postPreviewText.length > 100 ? '...' : ''}`;

  const messageData: Omit<Message, 'id' | 'timestamp'> & { timestamp: any } = {
    text: messageText,
    uid: sender.uid,
    displayName: sender.displayName,
    photoURL: sender.photoURL,
    timestamp: firestoreServerTimestamp(),
    sharedPostId: sharedPostId,
    // Ensure other media fields are null for a shared post message
    imageUrl: null,
    audioUrl: null,
    videoUrl: null,
    fileUrl: null,
    fileName: null,
    fileType: null,
    fileSize: null,
    replyToMessageId: null,
    replyToMessageText: null,
    replyToMessageAuthor: null,
  };

  try {
    const docRef = await addDoc(messagesRef, messageData);
    console.log(`Firestore: Shared post message sent to chat ${chatId} by ${sender.uid}. Post ID: ${sharedPostId}. Message ID: ${docRef.id}`);
    return docRef.id;
  } catch (error: any) {
    const detailedErrorMessage = `Failed to send shared post message to chat ${chatId}. Error: ${error.message || 'Unknown Firestore error'}`;
    console.error("🔴 Shared Post Message Error:", detailedErrorMessage, error);
    throw new Error(detailedErrorMessage);
  }
};

