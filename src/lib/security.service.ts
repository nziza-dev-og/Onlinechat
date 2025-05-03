
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
 * Validates an IPv4 address format.
 *
 * @param ip - The string to validate.
 * @returns boolean - True if the format is valid, false otherwise.
 */
const isValidIPv4 = (ip: string): boolean => {
  if (typeof ip !== 'string') return false;
  const blocks = ip.split('.');
  if (blocks.length !== 4) return false;
  return blocks.every(block => {
    const num = parseInt(block, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && String(num) === block; // Check for leading zeros etc.
  });
};

/**
 * Blocks an IP address by adding it to a dedicated Firestore collection.
 * Requires admin privileges.
 *
 * @param ipAddress - The IPv4 address to block.
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

   const trimmedIp = ipAddress.trim();
   if (!isValidIPv4(trimmedIp)) {
       throw new Error("Invalid IPv4 Address format provided.");
   }
   const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
         // Consider if reason should be mandatory or have a default
         console.warn(`Blocking IP ${trimmedIp} without an explicit reason.`);
         // throw new Error("A reason is required for blocking an IP address.");
    }
    if (trimmedReason.length > 100) {
         throw new Error("Block reason cannot exceed 100 characters.");
    }


   const adminRef = doc(dbInstance, 'users', adminUserId);
   // Use IP address directly as doc ID after validation
   const blockedIpRef = doc(dbInstance, BLOCKED_IPS_COLLECTION, trimmedIp);

   try {
      // Basic Admin Check using getDoc
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
          console.warn(`Unauthorized attempt to block IP ${trimmedIp} by user ${adminUserId}.`);
           // Log the attempt
           await logSuspiciousActivity('unauthorized_ip_block_attempt', { attemptorUid: adminUserId, targetIp: trimmedIp });
          throw new Error("Unauthorized: Only administrators can block IP addresses.");
      }

      // Check if IP is already blocked
      const blockedIpSnap = await getDoc(blockedIpRef);
      if (blockedIpSnap.exists()) {
         console.log(`Firestore: IP Address ${trimmedIp} is already blocked.`);
         throw new Error(`IP address ${trimmedIp} is already blocked.`);
      }

      await setDoc(blockedIpRef, {
          ip: trimmedIp,
          reason: trimmedReason || 'Blocked by administrator', // Default reason if empty
          blockedAt: serverTimestamp(),
          blockedBy: adminUserId
      });
      console.log(`Firestore: IP Address ${trimmedIp} blocked by admin ${adminUserId}. Reason: ${trimmedReason}`);
       // Log the successful block
       await logSuspiciousActivity('ip_blocked', { targetIp: trimmedIp, reason: trimmedReason, adminUid: adminUserId });

   } catch (error: any) {
      // Avoid duplicate error logging if it's the "already blocked" error
       if (error.message.includes("already blocked")) {
           throw error; // Re-throw the specific error
       }
      const detailedErrorMessage = `Failed to block IP address ${trimmedIp}. Error: ${error.message || 'Unknown error'}`;
      console.error("🔴 IP Blocking Error:", detailedErrorMessage, error);
      throw new Error(detailedErrorMessage); // Re-throw the specific error
   }
};

// Add more security-related functions here (e.g., check IP block, manage 2FA triggers)
// export const isIpBlocked = async (ipAddress: string): Promise<boolean> => { ... }

    