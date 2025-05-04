
import { rtdb } from '@/lib/firebase';
import { ref, push, serverTimestamp, remove, onValue, connectDatabaseEmulator,
         type DatabaseReference, onDisconnect, set, get } from 'firebase/database';
import type { SignalingMessage } from '@/types';

/**
 * Checks if the database connection is established and user is connected
 */
export const checkRTDBConnection = async (): Promise<boolean> => {
  if (!rtdb) {
    console.error("🔴 RTDB Connection Error: Realtime Database not initialized.");
    return false;
  }

  try {
    // Check connection state using .info/connected
    const connectedRef = ref(rtdb, '.info/connected');
    return new Promise((resolve) => {
      onValue(connectedRef, (snap) => {
        const connected = snap.val() === true;
        console.log(`🔌 RTDB Connection Status: ${connected ? 'Connected' : 'Disconnected'}`);
        resolve(connected);
      }, { onlyOnce: true });

      // Add timeout for cases where Firebase might be unreachable
      setTimeout(() => resolve(false), 5000);
    });
  } catch (error: any) {
    console.error('🔴 RTDB Connection Check Error:', error);
    return false;
  }
};

/**
 * Sends a signaling message to the Realtime Database for a specific call.
 */
export const sendSignalingMessageRTDB = async (
  callId: string,
  message: Omit<SignalingMessage, 'senderId' | 'timestamp'>, // Exclude fields set by the function
  senderId: string
): Promise<void> => {
  // First check connection
  const isConnected = await checkRTDBConnection();
  if (!isConnected) {
    throw new Error("Cannot send message: User not connected to Realtime Database.");
  }

  if (!callId || !senderId || !message?.type || message.payload === undefined) { // Check payload explicitly for null/undefined
    console.error("🔴 RTDB Signaling Error: Invalid arguments.", { callId, senderId, message });
    throw new Error("Call ID, Sender ID, and valid message object (with type and non-undefined payload) are required.");
  }


  const messagesRef: DatabaseReference = ref(rtdb, `calls/${callId}/messages`);
  const messageWithSender: SignalingMessage = {
    ...message,
    senderId,
    timestamp: serverTimestamp() as object, // RTDB server timestamp sentinel
  };

  try {
    // Verify we can read from this location (permissions check)
    // This is a basic check; your RTDB rules should enforce proper access control.
    await get(ref(rtdb, `calls/${callId}`)).catch(error => {
      console.error("🔴 RTDB Permissions Error: Cannot access this call.", error);
      // Check if the error is specifically a permission denied error
      if (error.message && error.message.includes('permission_denied')) {
          throw new Error("Permission denied: User cannot access this call based on RTDB rules.");
      }
      // Rethrow other errors related to fetching
      throw new Error(`Failed to verify call access: ${error.message}`);
    });

    // Send the message
    await push(messagesRef, messageWithSender);
    // console.log(`✅ RTDB: Sent ${message.type} signal for call ${callId}`); // Reduced logging

    // Set up cleanup when user disconnects unexpectedly (simplified presence within call)
    if (message.type === 'offer' || message.type === 'answer') {
      const userStatusRef = ref(rtdb, `calls/${callId}/participants/${senderId}`);
      await set(userStatusRef, { connected: true, lastActive: serverTimestamp() });
      // When the client disconnects, update their status to disconnected
      onDisconnect(userStatusRef).update({ connected: false, lastActive: serverTimestamp() });
      console.log(`✅ RTDB: Set presence and disconnect handler for ${senderId} in call ${callId}`);
    }
  } catch (error: any) {
    console.error(`🔴 RTDB Push/Presence Error: ${error.message}`, error);
    // Provide a more specific error message if it was a permission issue caught earlier
    if (error.message.includes('Permission denied')) {
         throw error; // Re-throw the specific permission error
    }
    throw new Error(`Failed to send signaling message (${message.type}): ${error.message}`);
  }
};

/**
 * Removes all signaling messages and participant data for a call.
 */
export const removeCallSignalingData = async (callId: string): Promise<void> => {
  if (!rtdb) {
    console.error("🔴 RTDB Cleanup Error: Realtime Database not initialized.");
    return;
  }

  if (!callId) {
    console.error("🔴 RTDB Cleanup Error: Call ID is required.");
    return;
  }

  const isConnected = await checkRTDBConnection();
  if (!isConnected) {
    // Log a warning but maybe don't throw? Cleanup might happen during disconnects.
    console.warn("⚠️ RTDB Cleanup Warning: Cannot clean up call data while disconnected.");
    return;
  }

  const callRef: DatabaseReference = ref(rtdb, `calls/${callId}`);
  try {
    await remove(callRef);
    console.log(`✅ RTDB: Cleaned up all data for call ${callId}`);
  } catch (error: any) {
    console.error(`⚠️ Cleanup failed for call ${callId}: ${error.message}`, error);
    // Don't throw during cleanup unless absolutely necessary
  }
};


/**
 * Monitor connection status and participant presence in a call.
 * Sets the current user's presence and listens for changes in all participants.
 * THIS FUNCTION IS INTENDED TO BE CALLED FROM THE CLIENT SIDE.
 *
 * @param callId The ID of the call to monitor.
 * @param userId The UID of the current user.
 * @param onParticipantChange Callback function triggered when the participant list/status changes.
 *                             Receives an object mapping participant UIDs to their presence data.
 * @returns A function to unsubscribe the listeners.
 */
export const monitorCallConnection = (
  callId: string,
  userId: string,
  onParticipantChange: (participants: Record<string, { connected: boolean, lastActive: number }>) => void
): (() => void) => { // Return type is the unsubscribe function
  if (!rtdb || !callId || !userId) {
     console.error("🔴 MonitorCall Error: Invalid arguments or RTDB not ready.", { callId, userId, rtdb: !!rtdb });
     return () => {}; // Return a no-op unsubscribe function
  }

  console.log(`🔌 Setting up presence monitoring for user ${userId} in call ${callId}`);

  // Reference to the current user's status within the call's participants node
  const userStatusRef = ref(rtdb, `calls/${callId}/participants/${userId}`);

  // Set initial presence and server timestamp
  set(userStatusRef, { connected: true, lastActive: serverTimestamp() })
    .then(() => {
      console.log(`✅ RTDB: Initial presence set for user ${userId} in call ${callId}.`);
      // Set up onDisconnect handler AFTER initial presence is set
      return onDisconnect(userStatusRef).update({ connected: false, lastActive: serverTimestamp() });
    })
    .then(() => {
       console.log(`✅ RTDB: onDisconnect handler set for user ${userId} in call ${callId}.`);
    })
    .catch(error => {
      console.error(`🔴 RTDB Error setting presence/onDisconnect for user ${userId} in call ${callId}:`, error);
    });


  // Reference to the participants node for the call
  const participantsRef = ref(rtdb, `calls/${callId}/participants`);

  // Listen for value changes on the participants node
  const unsubscribe = onValue(participantsRef, (snapshot) => {
    const participants = snapshot.val() || {};
    // console.log(`👥 RTDB Participants Update for call ${callId}:`, participants); // Can be noisy
    onParticipantChange(participants); // Trigger the callback with the latest participant data
  }, (error) => {
      console.error(`🔴 RTDB Error listening to participants for call ${callId}:`, error);
      // Handle the error appropriately, maybe notify the user or attempt to reconnect
  });

  // Return a function that cleans up the listener and the onDisconnect handler
  return () => {
    console.log(`🔌 Cleaning up presence monitoring for user ${userId} in call ${callId}`);
    unsubscribe(); // Detach the onValue listener
    // Attempt to remove the onDisconnect handler (though this is often implicit when connection closes)
    // It's generally better to remove the presence node itself if the user explicitly leaves the call.
    // onDisconnect(userStatusRef).cancel(); // This might not be necessary or reliable
     // Optionally, explicitly set the user as disconnected when they leave the modal/call cleanly
     // update(userStatusRef, { connected: false, lastActive: serverTimestamp() });
  };
};
