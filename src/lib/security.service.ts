'use server';

import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp, getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'; // Added imports
import { app } from '@/lib/firebase'; // Import app

const SECURITY_LOGS_COLLECTION = 'security_logs';
const BLOCKED_IPS_COLLECTION = 'blocked_ips';

/**
 * Logs a suspicious activity event to a dedicated Firestore collection.
 *
 * @param activityType - Type of activity (e.g., 'failed_login', 'ip_block_attempt').
 * @param details - An object containing relevant details about the activity (e.g., userId, ipAddress, timestamp).
 * @returns Promise<void>
 */
export const logSuspiciousActivity = async (activityType: string, details: Record<string, any>): Promise<void> => {
  let dbInstance;
  try {
      dbInstance = getFirestore(app);
  } catch (initError: any) {
      // Log locally but don't necessarily throw, as logging failure might not be critical
      console.error("🔴 DB init error in logSuspiciousActivity:", initError.message, initError);
      return;
  }
  if (!dbInstance) {
      console.error("🔴 logSuspiciousActivity Error: Firestore (db) not available.");
      return; // Avoid throwing errors for logging failures unless critical
  }

  try {
    console.log(`Logging suspicious activity - Type: ${activityType}`, details);
    const logsRef = collection(dbInstance, SECURITY_LOGS_COLLECTION);
    await addDoc(logsRef, {
      type: activityType,
      timestamp: serverTimestamp(),
      ...details,
    });
    console.log(`Firestore: Suspicious activity logged: ${activityType}`);
  } catch (error: any) {
    // Log the error but don't throw to avoid disrupting primary operations
    console.error(`Failed to log suspicious activity. Error: ${error.message || 'Unknown error'}`, error);
  }
};

/**
 * Blocks an IP address by adding it to a dedicated Firestore collection.
 * Requires admin privileges.
 *
 * @param ipAddress - The IP address to block.
 * @param reason - The reason for blocking.
 * @param adminUserId - The UID of the admin performing the action.
 * @returns Promise<void>
 * @throws Error if admin check fails, IP is invalid, db not initialized, or update fails.
 */
export const blockIpAddress = async (ipAddress: string, reason: string, adminUserId: string): Promise<void> => {
   let dbInstance;
   try {
       dbInstance = getFirestore(app);
   } catch (initError: any) {
       const dbErrorMsg = `DB init error in blockIpAddress: ${initError.message}`;
       console.error("🔴 IP Blocking Error:", dbErrorMsg, initError);
       throw new Error(dbErrorMsg);
   }
   if (!dbInstance) throw new Error("Database service not available.");
   if (!adminUserId) throw new Error("Admin User ID is required to block IPs.");
   if (!ipAddress || typeof ipAddress !== 'string' || !ipAddress.match(/^(\d{1,3}\.){3}\d{1,3}$/)) { // Basic IP format validation
       throw new Error("Invalid IP Address format provided.");
   }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
         throw new Error("A reason is required for blocking an IP address.");
    }


   const adminRef = doc(dbInstance, 'users', adminUserId);
   const blockedIpRef = doc(dbInstance, BLOCKED_IPS_COLLECTION, ipAddress.replace(/\./g, '-')); // Use IP as doc ID (replace dots)

   try {
      // Basic Admin Check
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
          console.warn(`Unauthorized attempt to block IP ${ipAddress} by user ${adminUserId}.`);
           // Log the attempt
           await logSuspiciousActivity('unauthorized_ip_block_attempt', { attemptorUid: adminUserId, targetIp: ipAddress });
          throw new Error("Unauthorized: Only administrators can block IP addresses.");
      }

      await setDoc(blockedIpRef, {
          ip: ipAddress,
          reason: reason.trim(),
          blockedAt: serverTimestamp(),
          blockedBy: adminUserId
      });
      console.log(`Firestore: IP Address ${ipAddress} blocked by admin ${adminUserId}. Reason: ${reason.trim()}`);
       // Log the successful block
       await logSuspiciousActivity('ip_blocked', { targetIp: ipAddress, reason: reason.trim(), adminUid: adminUserId });

   } catch (error: any) {
      const detailedErrorMessage = `Failed to block IP address ${ipAddress}. Error: ${error.message || 'Unknown error'}`;
      console.error("🔴 IP Blocking Error:", detailedErrorMessage, error);
      throw new Error(detailedErrorMessage); // Re-throw the specific error
   }
};

// Add more security-related functions here (e.g., check IP block, manage 2FA triggers)
// export const isIpBlocked = async (ipAddress: string): Promise<boolean> => { ... }