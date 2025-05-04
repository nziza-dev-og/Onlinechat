'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Loader2, AlertCircle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, User } from '@/types';
// Import RTDB functions
import { getDatabase, ref as rtdbRef, onValue, off, remove, type DatabaseReference, type DataSnapshot, type Unsubscribe as RtdbUnsubscribe, serverTimestamp as rtdbServerTimestamp } from "firebase/database";
import { rtdb } from '@/lib/firebase';
import { sendSignalingMessageRTDB, removeCallSignalingData } from '@/lib/webrtc.service';
import type { SignalingMessage } from '@/types';

// Helper to get initials
const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?';
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '?';
};

// --- WebRTC Configuration ---
const configuration: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Add TURN server configuration here if needed for NAT traversal
        // {
        //   urls: 'turn:your-turn-server.com',
        //   username: 'your-username',
        //   credential: 'your-password'
        // }
    ]
};

interface VideoCallModalProps {
  chatId: string;
  currentUser: User;
  partnerUser: UserProfile;
  isOpen: boolean;
  onClose: () => void;
}

type CallStatus = 'idle' | 'checking_perms' | 'perms_denied' | 'ready' | 'calling' | 'receiving' | 'connecting' | 'in_call' | 'error' | 'ended';

export function VideoCallModal({ chatId, currentUser, partnerUser, isOpen, onClose }: VideoCallModalProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCaller, setIsCaller] = useState(false);
  const [showMissedCall, setShowMissedCall] = useState(false); // Added state for missed call display
  const [isRTDBListenerAttached, setIsRTDBListenerAttached] = useState(false); // Track listener status
  const [isCheckingPermission, setIsCheckingPermission] = useState(true); // State for initial permission check
  // Added state for audio recorder
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callSignalingRef = useRef<DatabaseReference | null>(null);
  const messagesListenerUnsubscribe = useRef<RtdbUnsubscribe | null>(null);
  const iceGatheringTimeoutRef = useRef<NodeJS.Timeout | null>(null); // ICE gathering timeout
  const callEndTimeoutRef = useRef<NodeJS.Timeout | null>(null); // For missed call timeout
  const callStatusRef = useRef(callStatus); // Ref to track current status without causing re-renders
  const isMountedRef = useRef(true); // Track component mount status
  const streamRef = useRef<MediaStream | null>(null); // Ref for local media stream

  const { toast } = useToast();

  // Consistent status updates with logging and avoiding updates on unmounted component
  const updateStatus = useCallback((newStatus: CallStatus) => {
    setCallStatus((prevStatus) => {
      if (!isMountedRef.current) return prevStatus; // Don't update if unmounted
      // Avoid redundant 'ended' or 'error' states if already set
      if ((prevStatus === 'error' || prevStatus === 'ended') && (newStatus === 'error' || newStatus === 'ended')) {
          return prevStatus;
      }
      if (prevStatus === newStatus) {
          return prevStatus; // No change
      }
      console.log(`%cCall Status Transition: %c${prevStatus} -> %c${newStatus}`, 'color: gray', 'color: orange', 'color: green');
      callStatusRef.current = newStatus; // Update ref immediately
      return newStatus;
    });
  }, []);

  // Track mount status
  useEffect(() => {
      isMountedRef.current = true;
      return () => {
          isMountedRef.current = false; // Mark as unmounted on cleanup
          console.log("VideoCallModal unmounting...");
      }
  }, []);

  // Stop and cleanup local media stream
  const stopLocalStream = useCallback(() => {
    setLocalStream(prevStream => {
      if (prevStream) {
        prevStream.getTracks().forEach(track => track.stop());
        console.log("Local stream stopped.");
      }
       // Ensure local video element is cleared
       if (localVideoRef.current) {
           localVideoRef.current.srcObject = null;
       }
       // Also stop the stream stored in streamRef
       if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            console.log("Stream ref stopped.");
       }
      return null; // Set state to null
    });
  }, []);

  // Close and cleanup PeerConnection
  const closePeerConnection = useCallback(() => {
      if (peerConnectionRef.current) {
          console.log("Closing PeerConnection...");
          peerConnectionRef.current.ontrack = null;
          peerConnectionRef.current.onicecandidate = null;
          peerConnectionRef.current.oniceconnectionstatechange = null;
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
          console.log("Peer connection closed.");
      }
      // Clear remote stream and video element
      setRemoteStream(prevStream => {
          if (
          prevStream && remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = null;
          }
           // Clear ICE gathering timeout
           if (iceGatheringTimeoutRef.current) {
                clearTimeout(iceGatheringTimeoutRef.current);
                iceGatheringTimeoutRef.current = null;
           }
          return null;
      });
  }, []);

   // Detach RTDB listener
   const detachListener = useCallback(() => {
       if (messagesListenerUnsubscribe.current) {
           messagesListenerUnsubscribe.current(); // Call the unsubscribe function
           messagesListenerUnsubscribe.current = null;
           setIsRTDBListenerAttached(false); // Update state
           console.log("RTDB messages listener detached.");
       }
       // Also clear the database ref itself
       if (callSignalingRef.current) {
           callSignalingRef.current = null;
       }
   }, []);


  // Combined cleanup function
  const cleanup = useCallback((isEndingCallExplicitly = false, currentStatusOnCleanupStart: CallStatus) => {
    if (!isMountedRef.current) {
        console.log("Cleanup skipped: Component already unmounted.");
        return;
    }
    console.log(`%cRunning video call cleanup (Explicit End: ${isEndingCallExplicitly}). Status at cleanup start: ${currentStatusOnCleanupStart}`, 'color: blue');
    stopLocalStream();
    closePeerConnection();
    detachListener(); // Detach RTDB listener

    // Clear missed call timeout
    if (callEndTimeoutRef.current) {
      clearTimeout(callEndTimeoutRef.current);
      callEndTimeoutRef.current = null;
    }
     // Clear ICE gathering timeout
     if (iceGatheringTimeoutRef.current) {
          clearTimeout(iceGatheringTimeoutRef.current);
          iceGatheringTimeoutRef.current = null;
     }

    // Remove signaling data from RTDB only if the call was active and ended explicitly by this user
    const wasCallActive = ['calling', 'receiving', 'connecting', 'in_call'].includes(currentStatusOnCleanupStart);
    if (isEndingCallExplicitly && wasCallActive && chatId) {
       console.log(`%cRemoving RTDB data for call ${chatId} due to explicit end.`, 'color: red');
       removeCallSignalingData(chatId).catch(err => console.error("Error removing signaling data during cleanup:", err));
    }

    // Reset component state
    setIsCaller(false);
    setShowMissedCall(false); // Ensure this resets
    setIsMicMuted(false); // Reset mute/camera state
    setIsCameraOff(false);
    updateStatus('idle'); // Final state reset *after* cleanup actions

  }, [stopLocalStream, closePeerConnection, detachListener, chatId, updateStatus]);


  // Function to handle ending the call (called by button click or other events)
  const handleEndCall = useCallback(() => {
    const currentStatus = callStatusRef.current; // Get current status from ref
    console.log(`%chandleEndCall triggered. Current status: ${currentStatus}`, 'color: red; font-weight: bold;');

    if (currentStatus !== 'idle' && currentStatus !== 'ended') {
        // Determine if the call was potentially missed or actually connected
        const couldHaveBeenMissed = currentStatus === 'calling' || currentStatus === 'receiving';
        const wasConnected = currentStatus === 'in_call';

        updateStatus('ended'); // Set final 'ended' state

        // Show appropriate toast and missed call message
        if (couldHaveBeenMissed && !wasConnected) { // Only show missed if never connected
            setShowMissedCall(true);
            toast({ title: "Call Ended/Missed", description: `Call with ${partnerUser.displayName || 'User'} was not connected.` });
            // Set a timeout to hide the "missed call" message after a few seconds
            if (callEndTimeoutRef.current) clearTimeout(callEndTimeoutRef.current);
             callEndTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) setShowMissedCall(false); // Check mount status before setting state
            }, 4000); // Show for 4 seconds
        } else if (wasConnected) {
            toast({ title: "Call Ended", description: `Call with ${partnerUser.displayName || 'User'} ended.` });
        }

        // Perform cleanup, indicating this was an explicit end and passing the status *before* it was set to 'ended'
        cleanup(true, currentStatus);
        onClose(); // Close the modal
    } else {
        console.log("Attempted to end call but already idle or ended.");
        // Ensure status is 'ended' and perform cleanup without removing RTDB data
        updateStatus('ended');
        cleanup(false, currentStatus);
        onClose();
    }
  }, [cleanup, toast, partnerUser.displayName, onClose, updateStatus]);


  // Send signaling message via RTDB service
  const sendSignalingMessage = useCallback(async (message: Omit<SignalingMessage, 'senderId' | 'timestamp'>) => {
      if (!currentUser?.uid) {
        console.error("Cannot send signaling message: User ID missing.");
        return;
      }
      if (!chatId) {
          console.error("Cannot send signaling message: Chat ID missing.");
          return;
      }
      // Do not send messages if the call is already ended or in an error state
      if (!isMountedRef.current || ['ended', 'error', 'idle'].includes(callStatusRef.current)) {
          console.warn(`Signaling message send skipped because call status is ${callStatusRef.current}`);
          return;
      }
      try {
        // console.log(`Sending ${message.type} via RTDB...`);
        await sendSignalingMessageRTDB(chatId, message, currentUser.uid);
        // console.log(`RTDB: ${message.type} sent successfully.`);
      } catch (error: any) {
        console.error(`RTDB: Error sending ${message.type} message:`, error);
        toast({ variant: "destructive", title: "Signaling Error", description: `Could not send ${message.type}. Call may fail.` });
        // If sending fails critically (e.g., offer/answer), end the call attempt
         if (isMountedRef.current && callStatusRef.current !== 'ended' && callStatusRef.current !== 'error') handleEndCall();
      }
  }, [chatId, currentUser?.uid, toast, handleEndCall]);


  // Initialize PeerConnection
  const initializePeerConnection = useCallback(async (isInitiator: boolean) => {
        console.log(`Initializing PeerConnection. Is initiator: ${isInitiator}`);
        if (!localStream) {
            console.error("Cannot initialize PeerConnection: Local stream not available.");
             if (isMountedRef.current) updateStatus('error');
            toast({ variant: "destructive", title: "Call Error", description: "Camera/Mic stream failed." });
            handleEndCall();
            return null;
        }
        // Ensure only one PeerConnection exists
        if (peerConnectionRef.current) {
            console.warn("PeerConnection already exists. Closing previous one.");
            closePeerConnection(); // Use the cleanup helper
        }

        try {
            const pc = new RTCPeerConnection(configuration);
            peerConnectionRef.current = pc;
            setIsCaller(isInitiator); // Track role

            // Add local tracks to the connection
            localStream.getTracks().forEach(track => {
                try {
                    pc.addTrack(track, localStream);
                    console.log(`WebRTC: Added local ${track.kind} track.`);
                } catch (addTrackError) {
                    console.error(`WebRTC: Error adding local ${track.kind} track:`, addTrackError);
                    throw addTrackError; // Re-throw to be caught below
                }
            });

            // Handle incoming remote tracks
            pc.ontrack = (event) => {
                console.log(`%cWebRTC: Received remote track (${event.track.kind}). Streams:`, 'color: magenta', event.streams);
                if (event.streams && event.streams[0]) {
                    const incomingStream = event.streams[0];
                    setRemoteStream(prevStream => {
                        if (prevStream?.id === incomingStream.id) return prevStream; // Avoid resetting if same stream
                        console.log("%cWebRTC: Assigning remote stream:", 'color: magenta', incomingStream.id);
                        // Assign stream to the remote video element
                        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== incomingStream) {
                            remoteVideoRef.current.srcObject = incomingStream;
                            // Attempt to play, catching potential errors
                            remoteVideoRef.current.play().catch(e => console.error("Remote video play failed:", e));
                            console.log("%cWebRTC: Remote stream assigned to video element.", 'color: magenta');
                             // Update status to 'in_call' only if component is still mounted
                             if (isMountedRef.current) updateStatus('in_call');
                        }
                        return incomingStream;
                    });
                } else {
                    console.warn("WebRTC: Remote track received but no stream associated.");
                }
            };

            // Handle ICE candidate generation
            pc.onicecandidate = (event) => {
                 // Clear ICE gathering timeout when a candidate is generated or gathering finishes
                 if (iceGatheringTimeoutRef.current) {
                     clearTimeout(iceGatheringTimeoutRef.current);
                     iceGatheringTimeoutRef.current = null;
                 }
                if (event.candidate) {
                    // console.log(`%cWebRTC: Generated ICE candidate:`, 'color: cyan', event.candidate.type);
                    sendSignalingMessage({ type: 'candidate', payload: event.candidate.toJSON() });
                } else {
                    console.log("WebRTC: End of ICE candidates.");
                }
            };

            // Monitor connection state changes
            pc.oniceconnectionstatechange = () => {
                const currentState = pc.iceConnectionState;
                const currentCallStatus = callStatusRef.current; // Use ref for current status
                console.log(`%cWebRTC: ICE Connection State: ${currentState}, Current Call Status: ${currentCallStatus}`, 'color: orange');
                 // Clear ICE gathering timeout if connected or completed
                 if (['connected', 'completed'].includes(currentState) && iceGatheringTimeoutRef.current) {
                      clearTimeout(iceGatheringTimeoutRef.current);
                      iceGatheringTimeoutRef.current = null;
                 }

                if (!isMountedRef.current) return; // Prevent updates if unmounted

                switch (currentState) {
                    case 'checking':
                         if (currentCallStatus !== 'in_call') updateStatus('connecting');
                        break;
                    case 'connected': // Connection established
                    case 'completed': // More robust connection
                         if (currentCallStatus !== 'in_call') updateStatus('in_call');
                        break;
                    case 'disconnected':
                        console.warn("WebRTC: ICE Disconnected. Might try to reconnect...");
                        // You might want to implement reconnection logic here or simply end the call after a timeout
                        break;
                    case 'failed':
                        console.error("WebRTC: ICE Connection Failed.");
                         if (currentCallStatus !== 'error' && currentCallStatus !== 'ended') {
                            toast({ variant: "destructive", title: "Connection Failed", description: "Could not establish connection." });
                            updateStatus('error');
                            handleEndCall(); // End the call on failure
                         }
                        break;
                    case 'closed':
                        console.log("WebRTC: ICE Connection Closed.");
                         // If the connection closes unexpectedly, treat it as the call ending
                         if (currentCallStatus !== 'idle' && currentCallStatus !== 'ended') {
                             updateStatus('ended'); // Ensure state is set before cleanup
                             handleEndCall();
                         }
                        break;
                     default: // 'new' state
                         break;
                }
            };

             // Implement ICE gathering timeout
             if (iceGatheringTimeoutRef.current) clearTimeout(iceGatheringTimeoutRef.current); // Clear previous if any
             iceGatheringTimeoutRef.current = setTimeout(() => {
                 if (pc.iceGatheringState !== 'complete' && isMountedRef.current) {
                     console.warn("WebRTC: ICE gathering timeout reached. Ending call.");
                     toast({ variant: "destructive", title: "Connection Timeout", description: "Failed to establish connection quickly enough." });
                     handleEndCall(); // End the call if ICE gathering takes too long
                 }
             }, 15000); // 15 seconds timeout

            console.log("PeerConnection initialized successfully.");
            return pc;

        } catch (error) {
            console.error("Error initializing PeerConnection:", error);
            toast({ variant: "destructive", title: "WebRTC Error", description: "Failed to initialize call connection." });
             if (isMountedRef.current) updateStatus('error');
            handleEndCall();
            return null;
        }
  }, [localStream, toast, handleEndCall, closePeerConnection, sendSignalingMessage, updateStatus]); // Added localStream, handleEndCall, sendSignalingMessage, updateStatus


  // Setup RTDB signaling listener
  const setupSignalingListener = useCallback(() => {
        // Check prerequisites
        if (!rtdb || !chatId || !currentUser?.uid) {
            console.error("RTDB Signaling Error: Cannot set up listener - DB, chatId, or currentUser invalid.", { rtdb: !!rtdb, chatId, currentUser: !!currentUser?.uid });
            toast({ variant: "destructive", title: "Internal Error", description: "Signaling service unavailable." });
            if (isMountedRef.current && callStatusRef.current !== 'ended' && callStatusRef.current !== 'error') handleEndCall();
            return;
        }
        // Prevent attaching multiple listeners
        if (isRTDBListenerAttached) {
            console.warn("RTDB: Listener setup requested, but one is already attached.");
            return;
        }

        callSignalingRef.current = rtdbRef(rtdb, `calls/${chatId}/messages`);
        console.log(`%cRTDB: Setting up listener for messages at calls/${chatId}/messages`, 'color: purple');
        setIsRTDBListenerAttached(true); // Mark listener as attached

        // Attach the 'onValue' listener
        messagesListenerUnsubscribe.current = onValue(callSignalingRef.current, (snapshot: DataSnapshot) => {
            if (!isMountedRef.current) { // Check if component is still mounted
                 console.log("RTDB: Received data but component unmounted. Ignoring.");
                 return;
            }
            const currentStatus = callStatusRef.current; // Get current status via ref

            // Handle case where signaling data is removed (e.g., call ended by other party)
            if (!snapshot.exists()) {
                console.log(`%cRTDB: No signaling data found for call ${chatId} or data removed.`, 'color: purple');
                 // If the call was active, assume it was ended by the other party
                 if (['in_call', 'connecting', 'calling', 'receiving'].includes(currentStatus)) {
                    console.log("%cRTDB: Signaling data removed, assuming call ended by other party.", 'color: red');
                     if (currentStatus !== 'ended' && currentStatus !== 'error') {
                      toast({ title: "Call Ended", description: "The other user left the call." });
                      updateStatus('ended');
                      handleEndCall(); // Trigger cleanup and modal close
                    }
                } else if (currentStatus !== 'idle' && currentStatus !== 'ended' && currentStatus !== 'error'){
                     // If data removed but call wasn't active, maybe cleanup without toast
                     console.log("RTDB: Signaling data removed, call wasn't active. Cleaning up silently.");
                     updateStatus('ended');
                     handleEndCall();
                }
                return;
            }

            // Process incoming signaling messages
            const messages = snapshot.val();
            if (!messages) return; // No messages to process

            Object.keys(messages).forEach(async key => {
                const message = messages[key] as SignalingMessage;
                 if (!message || message.senderId === currentUser?.uid || !message.type || !message.payload) {
                     // console.log("Ignoring own message or invalid message structure", message);
                     return; // Ignore own messages or invalid ones
                 }
                 if (['ended', 'error', 'idle'].includes(callStatusRef.current)) {
                     console.log(`RTDB: Ignoring message type ${message.type} because call status is ${callStatusRef.current}.`);
                     return;
                 }

                let pc = peerConnectionRef.current;

                // Initialize PeerConnection if receiving an offer and not already initialized
                 if (!pc && message.type === 'offer' && ['ready'].includes(callStatusRef.current)) {
                    console.log("%cRTDB: Received offer, initializing PeerConnection as receiver...", 'color: green');
                    updateStatus('receiving'); // Indicate incoming call attempt
                    pc = await initializePeerConnection(false); // Initialize as receiver
                    if (!pc) { // Handle initialization failure
                        console.error("Failed to initialize PeerConnection as receiver.");
                         if (isMountedRef.current) updateStatus('error');
                        handleEndCall();
                        return;
                    }
                } else if (!pc) { // If PC doesn't exist and it's not an offer, ignore
                     console.warn(`RTDB: Ignoring signaling message type ${message.type} because PeerConnection is not ready or call status is ${callStatusRef.current}.`);
                     return;
                 }


                console.log(`%cRTDB: Received message type: ${message.type} from ${message.senderId}`, 'color: purple');
                try {
                    switch (message.type) {
                        case 'offer':
                             // Perfect Negotiation: Check signaling state and role
                             const offerCollision = message.type === "offer" &&
                                                (isCaller || pc.signalingState !== "stable");

                             if (offerCollision) {
                                console.warn(`WebRTC: Offer collision detected. Ignoring incoming offer.`);
                                return; // Ignore incoming offer if we are caller or not stable
                             }

                             console.log("%cWebRTC: Processing received offer...", 'color: green');
                             if (isMountedRef.current) updateStatus('receiving'); // Ensure state reflects incoming call
                             await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                             console.log("%cWebRTC: Remote description (offer) set.", 'color: green');
                             // Create and send answer
                             const answer = await pc.createAnswer();
                             console.log("%cWebRTC: Answer created.", 'color: green');
                             await pc.setLocalDescription(answer);
                             console.log("%cWebRTC: Local description (answer) set.", 'color: green');
                             sendSignalingMessage({ type: 'answer', payload: pc.localDescription!.toJSON() });
                             break;

                        case 'answer':
                            if (pc.signalingState !== 'have-local-offer') {
                                 console.warn(`WebRTC: Received answer in unexpected state: ${pc.signalingState}. Ignoring.`);
                                 return;
                            }
                             console.log("%cWebRTC: Processing received answer...", 'color: blue');
                             await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                             console.log("%cWebRTC: Remote description (answer) set.", 'color: blue');
                             break;

                        case 'candidate':
                             if (message.payload && pc.remoteDescription) { // Only add if remote description is set
                                 try {
                                     // console.log("%cWebRTC: Adding received ICE candidate...", 'color: cyan');
                                     await pc.addIceCandidate(new RTCIceCandidate(message.payload));
                                     // console.log("%cWebRTC: ICE candidate added.", 'color: cyan');
                                 } catch (e) {
                                     // Ignore benign errors during candidate addition
                                     if (!String(e).includes("OperationError: Failed to set ICE candidate")) {
                                        console.error("WebRTC: Error adding received ICE candidate:", e);
                                     } else {
                                        // console.warn("WebRTC: Ignored benign error adding ICE candidate:", e);
                                     }
                                 }
                             } else if (!message.payload) {
                                 console.log("RTDB: Received end-of-candidates signal (null candidate).");
                             } else {
                                 console.warn("WebRTC: Received ICE candidate but remote description is not set yet. Add candidate failed.");
                             }
                             break;
                    }
                } catch (error) { // Catch errors during WebRTC signaling processing
                    console.error(`WebRTC: Error handling signaling message type ${message.type}:`, error);
                     if (isMountedRef.current && callStatusRef.current !== 'error' && callStatusRef.current !== 'ended') {
                         updateStatus('error');
                         toast({ variant: "destructive", title: "WebRTC Error", description: `Failed to process ${message.type}.` });
                         handleEndCall();
                     }
                }
            });
        }, (error) => { // Handle errors with the RTDB listener itself
            console.error(`RTDB: Error listening for signaling messages at calls/${chatId}/messages:`, error);
            if (isMountedRef.current && callStatusRef.current !== 'error' && callStatusRef.current !== 'ended') {
                toast({ variant: "destructive", title: "Signaling Error", description: "Lost connection to signaling server." });
                handleEndCall();
            }
            detachListener(); // Ensure listener is detached on error
        });

   }, [rtdb, chatId, currentUser?.uid, toast, handleEndCall, sendSignalingMessage, detachListener, initializePeerConnection, updateStatus, isRTDBListenerAttached, isCaller]); // Added isCaller


  // Main effect for handling modal open/close and permissions
  useEffect(() => {
        if (!isOpen) {
            // Cleanup when modal is closed externally
            const statusBeforeClose = callStatusRef.current;
            const shouldRemoveRtdb = statusBeforeClose !== 'idle' && statusBeforeClose !== 'ended';
             // Run cleanup, potentially removing RTDB data if call was active
            cleanup(shouldRemoveRtdb, statusBeforeClose);
            return; // Stop execution if modal is closed
        }

        console.log("Video call modal opened. Initializing...");
        setIsCheckingPermission(true); // Start permission check
        updateStatus('checking_perms'); // Set status to checking

        // Ensure previous listener is detached before setting up a new one
        detachListener();

        console.log("Requesting media permissions...");
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                if (!isMountedRef.current) { // Check if component unmounted while waiting for permissions
                    stream.getTracks().forEach(track => track.stop());
                    console.log("Permissions granted, but component unmounted. Stream stopped.");
                    return;
                }
                console.log("%cMedia access granted.", 'color: green');
                setLocalStream(stream);
                streamRef.current = stream; // Store stream in ref as well
                // Assign stream to local video element
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                     localVideoRef.current.play().catch(e => console.error("Local video play failed:", e));
                }
                updateStatus('ready');
                setIsCheckingPermission(false); // Permission check complete
                // Setup RTDB listener *after* getting media and setting status to ready
                setupSignalingListener();
            })
            .catch(error => {
                 if (!isMountedRef.current) return; // Check mount status
                 console.error("Error accessing camera/mic:", error.name, error.message);
                 updateStatus('perms_denied');
                 setIsCheckingPermission(false); // Permission check complete (failed)
                 toast({
                     variant: 'destructive',
                     title: 'Permissions Required',
                     description: `Could not access camera/microphone: ${error.message}. Please enable permissions.`,
                     duration: 7000, // Show longer
                 });
                 // Automatically close/end call after a delay if permissions are denied
                 if (callEndTimeoutRef.current) clearTimeout(callEndTimeoutRef.current);
                 callEndTimeoutRef.current = setTimeout(() => {
                      if (isMountedRef.current) handleEndCall(); // Check mount status before ending
                 }, 3000); // Close after 3 seconds
            });

        // Cleanup function for this effect when isOpen becomes false or component unmounts
        return () => {
            console.log("Video call modal effect cleanup triggered (unmount/close).");
            const statusBeforeCleanup = callStatusRef.current;
            const shouldRemoveRtdbOnClose = statusBeforeCleanup !== 'idle' && statusBeforeCleanup !== 'ended';
            cleanup(shouldRemoveRtdbOnClose, statusBeforeCleanup);
        };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only re-run when isOpen changes



  // Function to initiate the call
  const handleStartCall = async () => {
    // Check current state and prerequisites
     if (callStatusRef.current !== 'ready' || !localStream || !chatId) {
       toast({ variant: 'destructive', title: 'Cannot Start Call', description: 'Permissions denied, media stream not available, or chat ID missing.' });
       return;
     }

    console.log(`%cInitiating call in chat ${chatId} to ${partnerUser.uid}...`, 'color: blue; font-weight: bold;');
    updateStatus('calling');

    try {
        console.log("Clearing previous signaling data (if any)...");
        await removeCallSignalingData(chatId); // Clear old data first
        console.log("Previous signaling data cleared.");
        // Re-attach listener AFTER clearing data if it wasn't already attached
        if (!isRTDBListenerAttached) {
             console.log("Re-attaching RTDB listener after clearing data...");
             setupSignalingListener(); // Ensure listener is active for the new call
        }
    } catch (clearError) {
        console.warn("Could not clear previous signaling data:", clearError);
    }

    // Initialize PeerConnection as the caller
    const pc = await initializePeerConnection(true);
    if (!pc) return; // Initialization failed (error handled inside initializePeerConnection)

    // Create and send offer
     try {
         console.log("WebRTC: Creating offer...");
         const offer = await pc.createOffer();
         await pc.setLocalDescription(offer);
         console.log("WebRTC: Local description (offer) set.");
         sendSignalingMessage({ type: 'offer', payload: pc.localDescription!.toJSON() });
         console.log("RTDB: Offer sent.");
     } catch (error) {
         console.error("Error creating or sending offer:", error);
         toast({ variant: "destructive", title: "Call Error", description: "Failed to create call offer." });
         if (isMountedRef.current) updateStatus('error');
         handleEndCall(); // End call on offer failure
     }
  };

  // Toggle microphone mute state
  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsMicMuted(!track.enabled); // Update UI state
        console.log(`Microphone ${track.enabled ? 'unmuted' : 'muted'}`);
      });
    }
  };

  // Toggle camera on/off state
  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsCameraOff(!track.enabled); // Update UI state
        console.log(`Camera ${track.enabled ? 'on' : 'off'}`);
      });
    }
  };

  // Get display text for current call status
  const getDialogDescription = () => {
    const currentStatus = callStatusRef.current; // Use ref for latest status
    switch (currentStatus) {
      case 'checking_perms':
        return <span className="flex items-center"><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Requesting permissions...</span>;
      case 'perms_denied':
        return <span className="flex items-center text-destructive"><AlertCircle className="mr-1 h-4 w-4" /> Permissions denied. Allow access to proceed.</span>;
      case 'ready':
        return 'Ready to call.';
      case 'calling':
        return <span className="flex items-center"><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Calling {partnerUser.displayName || 'User'}...</span>;
       case 'receiving': // Status shown while processing offer
           return `Incoming call from ${partnerUser.displayName || 'User'}...`;
       case 'connecting': // Status shown during ICE connection checks
           return <span className="flex items-center"><Loader2 className="mr-1 h-4 w-4 animate-spin"/> Connecting...</span>;
      case 'in_call':
        return <span className="text-green-600 font-medium">Connected</span>;
       case 'ended': // Status after call ends
           return showMissedCall ? `Call with ${partnerUser.displayName || 'User'} was missed.` : 'Call ended.';
      case 'error':
        return <span className="text-destructive">Call error occurred.</span>;
      case 'idle': // Initial state before permissions
      default:
        return 'Initializing...';
    }
  };


  // --- Render Logic ---
  return (
    // Dialog component setup
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleEndCall(); }}>
      {/* Increased max-width and height constraints */}
      <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] xl:max-w-[50vw] p-0 overflow-hidden grid grid-rows-[auto_1fr_auto] h-[80vh]">
        {/* Header */}
        <DialogHeader className="p-4 border-b bg-background">
          <DialogTitle className="text-lg flex items-center gap-2">
            Video Call with {partnerUser.displayName || 'User'}
          </DialogTitle>
          <DialogDescription className="flex items-center text-sm min-h-[20px]">
            {getDialogDescription()}
          </DialogDescription>
        </DialogHeader>

        {/* Video Area */}
        <div className="relative grid grid-cols-1 bg-black overflow-hidden h-full">
          {/* Remote Video Display */}
          <div className="relative flex items-center justify-center bg-muted/80 w-full h-full overflow-hidden">
             {/* Show remote video if stream exists and call is connecting/in_call */}
             {remoteStream && ['in_call', 'connecting'].includes(callStatusRef.current) ? (
                <video
                   ref={remoteVideoRef}
                   autoPlay
                   playsInline // Important for mobile browsers
                   className="w-full h-full object-cover" // Use cover to fill the area
                   onLoadedMetadata={(e) => e.currentTarget.play().catch(err => console.warn("Remote play prevented:", err))}
                />
             ) : (
               // Placeholder shown when no remote stream or call not connected
               <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gradient-to-b from-black/30 to-black/70">
                 {/* Partner Avatar */}
                 <Avatar className="h-24 w-24 mb-2 border-4 border-background/50">
                   <AvatarImage src={partnerUser.photoURL || undefined} alt={partnerUser.displayName || 'User'} data-ai-hint="video call partner avatar" />
                   <AvatarFallback className="text-3xl">{getInitials(partnerUser.displayName)}</AvatarFallback>
                 </Avatar>
                 {/* Partner Name */}
                 <p className="text-white/80 font-medium mt-2 bg-black/50 px-2 py-1 rounded">{partnerUser.displayName || 'User'}</p>
                 {/* Status Indicators */}
                  {callStatusRef.current === 'calling' && <p className="text-white/70 text-sm mt-1">Ringing...</p>}
                  {(callStatusRef.current === 'ended' && showMissedCall) && <p className="text-yellow-400 text-sm mt-1">Call Missed</p>}
                  {callStatusRef.current === 'receiving' && <p className="text-white/70 text-sm mt-1">Incoming call...</p>}
                  {callStatusRef.current === 'connecting' && <p className="text-white/70 text-sm mt-1">Connecting...</p>}
                  {callStatusRef.current === 'ended' && !showMissedCall && <p className="text-white/70 text-sm mt-1">Call Ended</p>}
                  {callStatusRef.current === 'error' && <p className="text-red-400 text-sm mt-1">Error</p>}
               </div>
             )}
          </div>

          {/* Local Video Preview (Picture-in-Picture style) */}
          <div className="absolute bottom-4 right-4 w-32 h-24 md:w-40 md:h-30 lg:w-48 lg:h-36 z-20 rounded-md overflow-hidden border-2 border-white/50 shadow-lg bg-black">
             {/* Show local video if stream exists and camera is not off */}
            {localStream && !isCameraOff ? (
              <video
                 ref={localVideoRef}
                 autoPlay
                 playsInline
                 muted // Local video should always be muted to prevent echo
                 className="w-full h-full object-cover scale-x-[-1]" // Flip horizontally for mirror effect
                 onLoadedMetadata={(e) => e.currentTarget.play().catch(err => console.warn("Local play prevented:", err))}
               />
            ) : (
              // Placeholder when no stream, permissions denied, camera off, or checking perms
              <div className="w-full h-full flex items-center justify-center bg-muted">
                 {isCheckingPermission && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
                 {callStatusRef.current === 'perms_denied' && !isCheckingPermission && <AlertCircle className="h-8 w-8 text-destructive" />}
                 {/* Show VideoOff icon if camera is manually turned off */}
                  {localStream && ['ready', 'calling', 'receiving', 'connecting', 'in_call'].includes(callStatusRef.current) && isCameraOff && <VideoOff className="h-8 w-8 text-muted-foreground" />}
                  {/* Show user avatar as fallback */}
                  {currentUser && (!localStream || ['idle', 'ended', 'error', 'perms_denied'].includes(callStatusRef.current) || isCameraOff) && !isCheckingPermission && (
                     <Avatar className="h-12 w-12">
                          <AvatarImage src={currentUser.photoURL || undefined} />
                          <AvatarFallback>{getInitials(currentUser.displayName)}</AvatarFallback>
                     </Avatar>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Footer with Call Controls */}
        <DialogFooter className="p-4 border-t bg-background flex flex-row justify-center items-center gap-4 min-h-[72px]">
           {/* Mic and Camera Toggles (Show when stream is ready/call active) */}
          {localStream && ['ready', 'calling', 'receiving', 'connecting', 'in_call'].includes(callStatusRef.current) && (
            <>
              <Button variant={isMicMuted ? "secondary" : "outline"} size="icon" onClick={toggleMic} aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"} className="rounded-full h-11 w-11">
                {isMicMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
              <Button variant={isCameraOff ? "secondary" : "outline"} size="icon" onClick={toggleCamera} aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"} className="rounded-full h-11 w-11">
                {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </Button>
            </>
          )}

           {/* Start Call Button (Show only when ready) */}
           {callStatusRef.current === 'ready' && (
                 <Button
                     variant="default"
                     size="icon"
                     onClick={handleStartCall}
                     className="rounded-full h-12 w-12 bg-green-600 hover:bg-green-700"
                     aria-label="Start call"
                 >
                     <Phone className="h-6 w-6" />
                 </Button>
            )}

           {/* Placeholder for 'Accept' - Implicitly handled by answering the offer */}
           {/* {callStatusRef.current === 'receiving' && ( ... )} */}

          {/* Loading Indicator during calling/connecting */}
          {(callStatusRef.current === 'calling' || callStatusRef.current === 'connecting') && (
            <Button
              variant="ghost"
              size="icon"
              disabled
              className="rounded-full h-12 w-12 text-yellow-500 cursor-not-allowed"
              aria-label={callStatusRef.current === 'calling' ? "Calling..." : "Connecting..."}
            >
              <Loader2 className="h-6 w-6 animate-spin" />
            </Button>
          )}

          {/* End Call Button (Show during active call states) */}
           {['ready', 'calling', 'receiving', 'connecting', 'in_call'].includes(callStatusRef.current) && (
            <Button variant="destructive" size="icon" onClick={handleEndCall} className="rounded-full h-12 w-12" aria-label="End call">
              <PhoneOff className="h-6 w-6" />
            </Button>
           )}

           {/* Close Button (Show when call ended, error, or perms denied) */}
           {(callStatusRef.current === 'ended' || callStatusRef.current === 'error' || callStatusRef.current === 'perms_denied') && (
             <Button variant="secondary" size="icon" onClick={onClose} className="rounded-full h-12 w-12" aria-label="Close">
                  <X className="h-6 w-6" />
             </Button>
           )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

