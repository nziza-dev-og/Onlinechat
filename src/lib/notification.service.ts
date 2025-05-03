
'use server';

import { db } from '@/lib/firebase';
import { addDoc, collection, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'; // Added Timestamp, doc, updateDoc
// Import Firebase Admin SDK for FCM if using push notifications

const NOTIFICATIONS_COLLECTION = 'notifications'; // Use a generic collection name
const ADMIN_MESSAGES_COLLECTION = 'adminMessages'; // Collection for messages to admin

/**
 * Sends a global announcement to all users by adding it to the 'notifications' collection
 * without a targetUserId.
 *
 * @param message - The notification message content.
 * @param adminUserId - The UID of the admin sending the announcement.
 * @returns Promise<string> - The ID of the created notification document.
 * @throws Error if db is not initialized or add fails.
 */
export const sendGlobalNotification = async (message: string, adminUserId: string): Promise<string> => {
  if (!db) {
    console.error("🔴 sendGlobalNotification Error: Firestore (db) not available.");
    throw new Error("Database service not available.");
  }
  if (!message || !message.trim()) {
    throw new Error("Notification message cannot be empty.");
  }
  if (!adminUserId) {
      throw new Error("Admin User ID is required to send global notifications.");
  }

  try {
    const notificationsRef = collection(db, NOTIFICATIONS_COLLECTION);
    const docRef = await addDoc(notificationsRef, {
      message: message.trim(),
      timestamp: serverTimestamp(),
      senderId: adminUserId, // Identify the sender
      isGlobal: true, // Flag for global messages
      // targetUserId: null, // Explicitly null for global
    });
    console.log(`Firestore: Global notification sent: "${message.trim()}" by ${adminUserId}, Doc ID: ${docRef.id}`);
    return docRef.id;

  } catch (error: any) {
    const detailedErrorMessage = `Failed to send global notification. Error: ${error.message || 'Unknown error'}`;
    console.error("🔴 Global Notification Error:", detailedErrorMessage, error);
    throw new Error(detailedErrorMessage);
  }
};

/**
 * Sends a targeted notification to a specific user by adding it to the 'notifications' collection
 * with a targetUserId.
 *
 * @param message - The notification message content.
 * @param targetUserId - The UID of the user who should receive the notification.
 * @param adminUserId - The UID of the admin sending the notification.
 * @returns Promise<string> - The ID of the created notification document.
 * @throws Error if db is not initialized, IDs are missing, or add fails.
 */
export const sendTargetedNotification = async (message: string, targetUserId: string, adminUserId: string): Promise<string> => {
   if (!db) {
    console.error("🔴 sendTargetedNotification Error: Firestore (db) not available.");
    throw new Error("Database service not available.");
   }
   if (!message || !message.trim()) {
     throw new Error("Notification message cannot be empty.");
   }
   if (!targetUserId) {
      throw new Error("Target User ID is required for targeted notifications.");
   }
    if (!adminUserId) {
       throw new Error("Admin User ID is required to send targeted notifications.");
    }


   try {
     const notificationsRef = collection(db, NOTIFICATIONS_COLLECTION);
     const docRef = await addDoc(notificationsRef, {
       message: message.trim(),
       targetUserId: targetUserId, // Specific user
       timestamp: serverTimestamp(),
       senderId: adminUserId, // Identify the sender
       isGlobal: false, // Flag for targeted messages
       isRead: false, // Default to unread for targeted messages
     });
     console.log(`Firestore: Targeted notification sent to ${targetUserId}: "${message.trim()}" by ${adminUserId}, Doc ID: ${docRef.id}`);
     return docRef.id;

   } catch (error: any) {
     const detailedErrorMessage = `Failed to send targeted notification to ${targetUserId}. Error: ${error.message || 'Unknown error'}`;
     console.error("🔴 Targeted Notification Error:", detailedErrorMessage, error);
     throw new Error(detailedErrorMessage);
   }
};

/**
 * Sends a reply to an existing admin message. Updates the message document with the reply content.
 *
 * @param originalMessageId - The ID of the message being replied to.
 * @param replyText - The content of the reply message.
 * @param adminUserId - The UID of the admin sending the reply.
 * @returns Promise<void>
 * @throws Error if db is not initialized, IDs/text are missing, or update fails.
 */
export const sendAdminReply = async (originalMessageId: string, replyText: string, adminUserId: string): Promise<void> => {
    if (!db) {
        console.error("🔴 sendAdminReply Error: Firestore (db) not available.");
        throw new Error("Database service not available.");
    }
    if (!originalMessageId) {
        throw new Error("Original Message ID is required to send a reply.");
    }
    if (!replyText || !replyText.trim()) {
        throw new Error("Reply text cannot be empty.");
    }
    if (!adminUserId) {
        throw new Error("Admin User ID is required to send a reply.");
    }

    try {
        const messageRef = doc(db, ADMIN_MESSAGES_COLLECTION, originalMessageId);
        // Update the existing document with reply information
        await updateDoc(messageRef, {
            reply: replyText.trim(),
            repliedAt: serverTimestamp(),
            repliedBy: adminUserId,
            isRead: true // Mark as read when replying
        });
        console.log(`Firestore: Admin reply sent for message ${originalMessageId} by admin ${adminUserId}.`);

    } catch (error: any) {
        const detailedErrorMessage = `Failed to send admin reply for message ${originalMessageId}. Error: ${error.message || 'Unknown error'}`;
        console.error("🔴 Admin Reply Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};


/**
 * Interface for serializable notification data passed to the client.
 */
export interface NotificationSerializable {
    id: string;
    message: string;
    timestamp: string; // ISO string
    isGlobal: boolean;
    targetUserId?: string | null;
    isRead?: boolean; // Only relevant for targeted
    senderId?: string | null; // Optional sender info
}
