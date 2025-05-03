'use server';

import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
// Import Firebase Admin SDK for FCM if using push notifications

/**
 * Sends a global announcement to all users by adding it to a dedicated Firestore collection.
 *
 * @param message - The notification message content.
 * @returns Promise<void>
 */
export const sendNotification = async (message: string): Promise<void> => {
  if (!db) {
    console.error("🔴 sendNotification Error: Firestore (db) not available.");
    throw new Error("Database service not available.");
  }
  if (!message || !message.trim()) {
    throw new Error("Notification message cannot be empty.");
  }

  try {
    // Save the announcement to a global collection (e.g., 'announcements')
    const announcementsRef = collection(db, 'announcements');
    await addDoc(announcementsRef, {
      message: message.trim(),
      timestamp: serverTimestamp(),
      // Add other relevant fields like sender (admin ID) if needed
    });
    console.log(`Firestore: Global announcement sent: "${message.trim()}"`);

    // TODO: Integrate with FCM if push notifications are needed.
    // This would involve getting user FCM tokens and using the Firebase Admin SDK.

  } catch (error: any) {
    const detailedErrorMessage = `Failed to send announcement. Error: ${error.message || 'Unknown error'}`;
    console.error("🔴 Announcement Error:", detailedErrorMessage, error);
    throw new Error(detailedErrorMessage);
  }
};

// Placeholder for targeted notifications (future implementation)
// export const sendTargetedNotification = async (message: string, targetUserId: string): Promise<void> => {
//   // ... implementation ...
// };