
'use server'; // May not be needed if only called from client, but good practice

import { rtdb } from '@/lib/firebase';
import { ref, push, serverTimestamp, type DatabaseReference } from 'firebase/database';
import type { SignalingMessage } from '@/types'; // Assuming SignalingMessage types are defined here or imported

/**
 * Sends a signaling message to the Realtime Database for a specific call.
 *
 * @param callId - The unique ID for the call (e.g., derived from chatId).
 * @param message - The signaling message (offer, answer, candidate).
 * @returns Promise<void>
 */
export const sendSignalingMessageRTDB = async (
    callId: string,
    message: Omit<SignalingMessage, 'senderId' | 'timestamp'>, // Exclude fields set by the function
    senderId: string
): Promise<void> => {
    if (!rtdb) {
        console.error("🔴 RTDB Signaling Error: Realtime Database not initialized.");
        throw new Error("Realtime Database service is unavailable.");
    }
    if (!callId || !senderId || !message || !message.type || !message.payload) {
        console.error("🔴 RTDB Signaling Error: Invalid arguments provided.", { callId, senderId, message });
        throw new Error("Call ID, Sender ID, and valid message object are required.");
    }

    const messagesRef: DatabaseReference = ref(rtdb, `calls/${callId}/messages`);
    const messageWithSender: SignalingMessage = {
        ...message,
        senderId: senderId,
        timestamp: serverTimestamp() as object, // RTDB server timestamp sentinel
    };

    try {
        await push(messagesRef, messageWithSender); // push() generates a unique key for each message
        // console.log(`RTDB: Sent ${message.type} for call ${callId}`);
    } catch (error: any) {
        const detailedErrorMessage = `Failed to send signaling message (${message.type}) for call ${callId}. Error: ${error.message || 'Unknown RTDB error'}`;
        console.error("🔴 RTDB Push Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};

/**
 * Removes the signaling data for a specific call from the Realtime Database.
 * Typically called when a call ends.
 *
 * @param callId - The unique ID of the call whose data should be removed.
 * @returns Promise<void>
 */
export const removeCallSignalingData = async (callId: string): Promise<void> => {
     if (!rtdb) {
        console.error("🔴 RTDB Cleanup Error: Realtime Database not initialized.");
        // Don't throw, just log, as cleanup might happen during app shutdown
        return;
    }
    if (!callId) {
        console.error("🔴 RTDB Cleanup Error: Call ID is required to remove signaling data.");
        return;
    }

    const callRef: DatabaseReference = ref(rtdb, `calls/${callId}`);

    try {
        await remove(callRef);
        console.log(`RTDB: Removed signaling data for call ${callId}.`);
    } catch (error: any) {
        // Log error but don't necessarily throw during cleanup
        console.error(`Failed to remove signaling data for call ${callId}. Error: ${error.message || 'Unknown RTDB error'}`, error);
    }
};

// Potential future functions:
// - listenForIncomingCall(userId, callback)
// - updateCallStatus(callId, status)
// - getCallParticipants(callId)
