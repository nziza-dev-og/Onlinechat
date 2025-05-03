'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, Timestamp, getCountFromServer } from 'firebase/firestore';

/**
 * Placeholder function to get the count of online users.
 * In a real implementation, this would query the 'users' collection.
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

// Add more analytics functions here as needed (e.g., getMessageCount, getActiveChats, etc.)
