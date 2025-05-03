
'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, Timestamp, getCountFromServer, getDocs, orderBy, limit } from 'firebase/firestore'; // Added getDocs, orderBy, limit
import type { AdminMessage } from '@/types'; // Import AdminMessage type

/**
 * Fetches the count of online users based on their lastSeen timestamp.
 *
 * @returns Promise<number> - The count of online users.
 * @throws Error if db is not initialized or query fails.
 */
export const getOnlineUsersCount = async (): Promise<number> => {
  if (!db) {
    console.error("🔴 getOnlineUsersCount Error: Firestore (db) not available.");
    throw new Error("Database service not available.");
  }

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    // Firestore requires Date objects to be converted to Timestamp objects
    const fiveMinutesAgoTimestamp = Timestamp.fromDate(fiveMinutesAgo);

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('lastSeen', '>=', fiveMinutesAgoTimestamp));

    const snapshot = await getCountFromServer(q);
    const count = snapshot.data().count;

    console.log(`Firestore: Fetched online user count: ${count}`);
    return count;
  } catch (error: any) {
    const detailedErrorMessage = `Failed to fetch online user count. Error: ${error.message || 'Unknown Firestore error'}`;
    console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
    throw new Error(detailedErrorMessage);
  }
};


/**
 * Fetches messages sent to administrators.
 *
 * @param adminUserId - The UID of the admin performing the action (for verification, although not strictly used for query here).
 * @param count - Maximum number of messages to fetch (default 50).
 * @returns Promise<AdminMessage[]> - Array of admin message objects.
 * @throws Error if db is not initialized or fetch fails.
 */
export const getAdminMessages = async (adminUserId: string, count: number = 50): Promise<AdminMessage[]> => {
     if (!db) {
         console.error("🔴 getAdminMessages Error: Firestore (db) not available.");
         throw new Error("Database service not available.");
     }
      if (!adminUserId) {
         // While not strictly needed for the query (as messages are in a dedicated collection),
         // it's good practice to ensure an admin is logged in.
         throw new Error("Admin User ID is required to fetch admin messages.");
     }

     try {
        const messagesRef = collection(db, 'adminMessages'); // Assuming collection name 'adminMessages'
        const q = query(
            messagesRef,
            orderBy('timestamp', 'desc'), // Get newest messages first
            limit(count)
        );

        const querySnapshot = await getDocs(q);

        const messages: AdminMessage[] = querySnapshot.docs.map(doc => {
            const data = doc.data();
             // Basic validation
             if (!data.senderUid || !(data.timestamp instanceof Timestamp)) {
                 console.warn("Skipping invalid admin message document:", doc.id, data);
                 return null;
             }
            return {
                id: doc.id,
                senderUid: data.senderUid,
                senderName: data.senderName ?? null,
                senderEmail: data.senderEmail ?? null,
                message: data.message ?? '',
                timestamp: data.timestamp.toDate().toISOString(), // Serialize timestamp
                isRead: data.isRead ?? false, // Default to unread
                // Add other fields like reply if implemented
            };
        }).filter((msg): msg is AdminMessage => msg !== null); // Filter out invalid docs

        console.log(`Firestore: Fetched ${messages.length} admin messages.`);
        return messages;

     } catch (error: any) {
         const detailedErrorMessage = `Failed to fetch admin messages. Error: ${error.message || 'Unknown Firestore error'}`;
         console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
         throw new Error(detailedErrorMessage);
     }
};


// Placeholder for sending a reply from admin (you'll need a corresponding service)
// export const sendAdminReply = async (originalMessageId: string, replyText: string, adminUserId: string) => { ... }

// Add more analytics functions here as needed (e.g., getMessageCount, getActiveChats, etc.)
    
