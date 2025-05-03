'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Loader2, AlertCircle, X } from 'lucide-react'; // Added X
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, User } from '@/types';
// Import RTDB functions
import { getDatabase, ref as rtdbRef, push, onValue, off, remove, serverTimestamp, type DatabaseReference, DataSnapshot, type Unsubscribe as RtdbUnsubscribe } from "firebase/database";
import { rtdb } from '@/lib/firebase'; // Import the initialized RTDB instance
import { sendSignalingMessageRTDB, removeCallSignalingData } from '@/lib/webrtc.service'; // Import RTDB service functions
import type { SignalingMessage } from '@/types'; // Import signaling types

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
        // Add TURN servers here if needed for NAT traversal
        // { urls: 'turn:your-turn-server.com', username: 'user', credential: 'password' }
    ]
};

interface VideoCallModalProps {
  chatId: string; // Used as the base for the RTDB call path
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
  const [isCaller, setIsCaller] = useState(false); // Track if current user initiated the call
  const [showMissedCall, setShowMissedCall] = useState(false); // Track if call was missed

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callSignalingRef = useRef<DatabaseReference | null>(null); // Ref for the RTDB signaling path
  const messagesListenerUnsubscribe = useRef<RtdbUnsubscribe | null>(null); // Ref for RTDB listener cleanup
  const callEndTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timeout for missed call/auto-close
  // Use a ref to track the latest callStatus inside callbacks that might have stale closures
  const callStatusRef = useRef(callStatus);

  const { toast } = useToast();

  // --- Helper to safely update status ---
  const updateStatus = useCallback((newStatus: CallStatus) => {
    setCallStatus((prevStatus) => {
      // Avoid setting to 'error' or 'ended' if already in a final state
      if ((prevStatus === 'error' || prevStatus === 'ended') && (newStatus === 'error' || newStatus === 'ended')) {
        return prevStatus;
      }
      console.log(`Call Status Transition: ${prevStatus} -> ${newStatus}`);
      return newStatus;
    });
  }, []);

   // Update callStatusRef whenever callStatus changes
   useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);


  // --- Cleanup Functions ---
  const stopLocalStream = useCallback(() => {
    setLocalStream(prevStream => {
      if (prevStream) {
        prevStream.getTracks().forEach(track => track.stop());
        console.log("Local stream stopped.");
      }
       if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      return null; // Return null to update the state
    });
  }, []); // No dependencies needed

  const closePeerConnection = useCallback(() => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        console.log("Peer connection closed.");
      }
      setRemoteStream(prevStream => {
        if (prevStream && remoteVideoRef.current) {
           remoteVideoRef.current.srcObject = null;
        }
        return null; // Clear remote stream state
      });
  }, []); // No dependencies needed

  // Detach RTDB listener
   const detachListener = useCallback(() => {
       if (messagesListenerUnsubscribe.current) {
           messagesListenerUnsubscribe.current();
           messagesListenerUnsubscribe.current = null;
           console.log("RTDB messages listener detached.");
       }
       callSignalingRef.current = null; // Clear the ref after detaching
   }, []); // No dependencies needed


  // Combined cleanup logic
  const cleanup = useCallback((isEndingCallExplicitly = false, currentStatus: CallStatus) => {
    console.log(`Running video call cleanup (Explicit End: ${isEndingCallExplicitly}). Current status: ${currentStatus}`);
    stopLocalStream();
    closePeerConnection();
    detachListener();

    // Clear any pending timeouts
    if (callEndTimeoutRef.current) {
      clearTimeout(callEndTimeoutRef.current);
      callEndTimeoutRef.current = null;
    }

    // Remove signaling data only if explicitly ending the call AND the call was in an active state
    const wasCallActive = ['calling', 'receiving', 'connecting', 'in_call'].includes(currentStatus);
    if (isEndingCallExplicitly && wasCallActive) {
       console.log(`Removing RTDB data for call ${chatId} due to explicit end.`);
       removeCallSignalingData(chatId).catch(err => console.error("Error removing signaling data during cleanup:", err));
    }

    setIsCaller(false); // Reset caller status
    setShowMissedCall(false);
    updateStatus('idle'); // Reset status *after* cleanup
  }, [stopLocalStream, closePeerConnection, detachListener, chatId, updateStatus]);


  const handleEndCall = useCallback(() => {
    console.log(`handleEndCall triggered. Current status from ref: ${callStatusRef.current}`);
    const currentStatus = callStatusRef.current; // Use the ref value

    if (currentStatus !== 'idle' && currentStatus !== 'ended') {
      console.log("Ending call explicitly...");

      const couldHaveBeenMissed = currentStatus === 'calling' || currentStatus === 'receiving';
      const wasConnected = currentStatus === 'in_call';

      // Show toast based on state before cleanup
      if (couldHaveBeenMissed) {
        setShowMissedCall(true); // Show missed call message briefly in UI
        toast({ title: "Call Ended/Missed", description: `Call with ${partnerUser.displayName || 'User'} was not connected.` });
        // Set a timeout to hide the missed call UI element if needed, or just rely on modal close
        if (callEndTimeoutRef.current) clearTimeout(callEndTimeoutRef.current);
        callEndTimeoutRef.current = setTimeout(() => setShowMissedCall(false), 4000);
      } else if (wasConnected) {
        toast({ title: "Call Ended", description: `Call with ${partnerUser.displayName || 'User'} ended.` });
      }

      updateStatus('ended'); // Set final 'ended' state immediately

      // Perform cleanup *after* potentially showing toast/setting state
      // Pass the status *before* setting it to 'ended'
      cleanup(true, currentStatus);

      onClose(); // Close the modal
    } else {
      console.log("Attempted to end call but already idle or ended.");
      updateStatus('ended'); // Ensure it's marked ended
      // Perform cleanup without removing RTDB data if already idle/ended
      cleanup(false, currentStatus);
      onClose(); // Ensure modal closes
    }
  }, [cleanup, toast, partnerUser.displayName, onClose, updateStatus]); // Dependencies for handleEndCall

  // --- End Cleanup Functions ---

  // --- RTDB Signaling ---
  const sendSignalingMessage = useCallback(async (message: Omit<SignalingMessage, 'senderId' | 'timestamp'>) => {
    if (!currentUser?.uid) {
        console.error("Cannot send signaling message: User ID missing.");
        return;
    }
    try {
      await sendSignalingMessageRTDB(chatId, message, currentUser.uid);
     } catch (error: any) {
        console.error(`RTDB: Error sending ${message.type} message:`, error);
        toast({ variant: "destructive", title: "Signaling Error", description: `Could not send ${message.type}. Call may fail.` });
        handleEndCall(); // Trigger cleanup on signaling error
     }
  }, [chatId, currentUser?.uid, toast, handleEndCall]);
  // --- End RTDB Signaling ---


  // --- WebRTC Peer Connection Setup ---
   const initializePeerConnection = useCallback(async (isInitiator: boolean) => {
       console.log(`Initializing PeerConnection. Is initiator: ${isInitiator}`);
        const currentLocalStream = localStream; // Capture localStream at the time of call
        if (!currentLocalStream) {
            console.error("Cannot initialize PeerConnection: Local stream not available.");
            updateStatus('error');
            toast({ variant: "destructive", title: "Call Error", description: "Camera/Mic stream failed." });
            handleEndCall(); // Trigger full cleanup and close
            return null;
        }
       if (peerConnectionRef.current) {
           console.warn("PeerConnection already exists. Closing previous one.");
           closePeerConnection(); // Use the useCallback version
       }

       try {
           const pc = new RTCPeerConnection(configuration);
           peerConnectionRef.current = pc;
           setIsCaller(isInitiator); // Set caller status based on who initializes first

           // Add local stream tracks
           currentLocalStream.getTracks().forEach(track => {
               try {
                   pc.addTrack(track, currentLocalStream);
                   console.log(`WebRTC: Added local ${track.kind} track.`);
               } catch (addTrackError) {
                    console.error(`WebRTC: Error adding local ${track.kind} track:`, addTrackError);
               }
           });

           // Handle incoming remote tracks
           pc.ontrack = (event) => {
               console.log(`WebRTC: Received remote track (${event.track.kind}). Streams:`, event.streams);
               if (event.streams && event.streams[0]) {
                   const incomingStream = event.streams[0];
                   setRemoteStream(prevStream => {
                       // Prevent setting the same stream multiple times
                       if (prevStream?.id === incomingStream.id) return prevStream;
                       console.log("WebRTC: Assigning remote stream:", incomingStream.id);
                       if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== incomingStream) {
                           remoteVideoRef.current.srcObject = incomingStream;
                           remoteVideoRef.current.play().catch(e => console.error("Remote video play failed:", e));
                           console.log("WebRTC: Remote stream assigned to video element.");
                           updateStatus('in_call'); // Update status when remote stream is ready to play
                       }
                       return incomingStream;
                   });
               } else {
                   console.warn("WebRTC: Remote track received but no stream associated.");
               }
           };

           // Handle ICE candidates
           pc.onicecandidate = (event) => {
               if (event.candidate) {
                   sendSignalingMessage({ type: 'candidate', payload: event.candidate.toJSON() });
               } else {
                   console.log("WebRTC: End of ICE candidates.");
                   // Optionally send null candidate if required by signaling protocol
                   // sendSignalingMessage({ type: 'candidate', payload: null });
               }
           };

           // Handle connection state changes
           pc.oniceconnectionstatechange = () => {
               const currentState = pc.iceConnectionState;
               const currentStatus = callStatusRef.current; // Use ref
               console.log(`WebRTC: ICE Connection State: ${currentState}, Current Call Status: ${currentStatus}`);
               switch (currentState) {
                   case 'checking':
                       if (currentStatus !== 'in_call') updateStatus('connecting');
                       break;
                   case 'connected':
                   case 'completed':
                       if (currentStatus !== 'in_call') updateStatus('in_call');
                       break;
                   case 'disconnected':
                        console.warn("WebRTC: ICE Disconnected. Attempting to reconnect...");
                        // Consider temporary UI feedback, connection might recover
                        break;
                   case 'failed':
                        console.error("WebRTC: ICE Connection Failed.");
                        if (currentStatus !== 'error' && currentStatus !== 'ended') { // Prevent toast spam
                           toast({ variant: "destructive", title: "Connection Failed", description: "Could not establish connection." });
                           updateStatus('error');
                           handleEndCall();
                        }
                        break;
                   case 'closed':
                        console.log("WebRTC: ICE Connection Closed.");
                        // Only trigger end call if not already ending/idle to avoid loops
                        if (currentStatus !== 'idle' && currentStatus !== 'ended') {
                            handleEndCall();
                        }
                        break;
                    default:
                        // 'new' state
                        break;
               }
           };

           return pc; // Return the created connection

       } catch (error) {
           console.error("Error initializing PeerConnection:", error);
           toast({ variant: "destructive", title: "WebRTC Error", description: "Failed to initialize call connection." });
           updateStatus('error');
           handleEndCall();
           return null;
       }
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [localStream, toast, handleEndCall, closePeerConnection, sendSignalingMessage, updateStatus]); // Removed remoteStream

   // --- Signaling Listener Setup ---
   const setupSignalingListener = useCallback(() => {
       if (!rtdb) {
           console.error("RTDB: Realtime Database not initialized. Cannot set up listener.");
            toast({ variant: "destructive", title: "Internal Error", description: "Signaling service unavailable." });
            handleEndCall(); // Use handleEndCall for consistent cleanup
           return;
       }
       if (messagesListenerUnsubscribe.current) {
           console.warn("RTDB: Listener already exists. Detaching previous one.");
           detachListener();
       }

       callSignalingRef.current = rtdbRef(rtdb, `calls/${chatId}/messages`);
       console.log(`RTDB: Setting up listener for messages at calls/${chatId}/messages`);

       messagesListenerUnsubscribe.current = onValue(callSignalingRef.current, (snapshot: DataSnapshot) => {
           const currentStatus = callStatusRef.current; // Get current status via ref

           if (!snapshot.exists()) {
               console.log(`RTDB: No signaling data found for call ${chatId} or data removed.`);
                // If call was active, assume the other user hung up.
                if (['in_call', 'connecting', 'calling', 'receiving'].includes(currentStatus)) {
                   console.log("RTDB: Signaling data removed, assuming call ended by other party.");
                    // Check showMissedCall state here if needed
                   if (currentStatus !== 'ended') { // Avoid double toast if already ending
                     toast({ title: "Call Ended", description: "The other user left the call." });
                     updateStatus('ended'); // Ensure status reflects end
                     handleEndCall(); // Trigger full cleanup
                   }
               }
               return;
           }

           const messages = snapshot.val();
           if (!messages) return; // No messages yet

           Object.keys(messages).forEach(async key => {
               const message = messages[key] as SignalingMessage;

               // Ignore own messages or messages without payload or if already ended/error
               if (message.senderId === currentUser?.uid || !message.payload || ['ended', 'error', 'idle'].includes(callStatusRef.current)) {
                   return;
               }

                // Initialize PC if needed (e.g., receiving offer when ready)
                let pc = peerConnectionRef.current;
                 if (!pc && message.type === 'offer' && callStatusRef.current === 'ready') {
                    console.log("Initializing PeerConnection as receiver upon receiving offer...");
                    pc = await initializePeerConnection(false); // Initialize as receiver
                    if (!pc) {
                        console.error("Failed to initialize PeerConnection as receiver.");
                        return; // Stop processing if initialization failed
                    }
                 } else if (!pc) {
                     console.warn(`Ignoring signaling message type ${message.type} because PeerConnection is not ready or call status is ${callStatusRef.current}.`);
                     return;
                 }

               try {
                   switch (message.type) {
                       case 'offer':
                            if (pc.signalingState !== 'stable') {
                                console.warn(`Received offer in non-stable state: ${pc.signalingState}. Potential glare.`);
                                // Handle glare if necessary (e.g., based on role)
                                return;
                            }
                            console.log("RTDB: Received offer");
                            updateStatus('receiving');
                            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                            console.log("WebRTC: Remote description (offer) set.");
                            const answer = await pc.createAnswer();
                            console.log("WebRTC: Answer created.");
                            await pc.setLocalDescription(answer);
                            console.log("WebRTC: Local description (answer) set.");
                            sendSignalingMessage({ type: 'answer', payload: pc.localDescription!.toJSON() });
                            // Status moved to 'connecting' or 'in_call' by ICE/ontrack
                            break;

                       case 'answer':
                           if (pc.signalingState !== 'have-local-offer') {
                                console.warn(`Received answer in unexpected state: ${pc.signalingState}. Ignoring.`);
                                return;
                           }
                            console.log("RTDB: Received answer");
                            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                            console.log("WebRTC: Remote description (answer) set.");
                            // Status moved to 'connecting' or 'in_call' by ICE/ontrack
                            break;

                       case 'candidate':
                            if (message.payload && pc.remoteDescription) {
                                await pc.addIceCandidate(new RTCIceCandidate(message.payload));
                            } else if (!message.payload) {
                                console.log("RTDB: Received end-of-candidates signal (null candidate).");
                            } else {
                                console.warn("RTDB: Received ICE candidate but remote description is not set yet. Buffering may be needed for robust handling.");
                            }
                            break;
                   }
               } catch (error) {
                   console.error(`Error handling signaling message type ${message.type}:`, error);
                   if (callStatusRef.current !== 'error' && callStatusRef.current !== 'ended') { // Avoid double toast/cleanup
                       updateStatus('error');
                       toast({ variant: "destructive", title: "WebRTC Error", description: `Failed to process ${message.type}.` });
                       handleEndCall();
                   }
               }
           });
       }, (error) => {
           console.error(`RTDB: Error listening for signaling messages at calls/${chatId}/messages:`, error);
           if (callStatusRef.current !== 'error' && callStatusRef.current !== 'ended') { // Avoid double toast/cleanup
               toast({ variant: "destructive", title: "Signaling Error", description: "Lost connection to signaling server." });
               handleEndCall();
           }
           detachListener();
       });

   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [chatId, currentUser?.uid, toast, handleEndCall, sendSignalingMessage, detachListener, initializePeerConnection, updateStatus]);


   // --- Main Effect for Modal Open/Close and Permissions ---
   useEffect(() => {
       let isMounted = true; // Flag to prevent state updates after unmount

       if (!isOpen) {
            // Get the status *before* cleanup starts
           const statusBeforeClose = callStatusRef.current;
            // Cleanup happens here, pass the status before closing
           cleanup(statusBeforeClose !== 'idle' && statusBeforeClose !== 'ended', statusBeforeClose);
           return;
       }

        // --- On Modal Open ---
        console.log("Video call modal opened. Requesting permissions...");
        updateStatus('checking_perms'); // Reset status on open

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                if (!isMounted) {
                    stream.getTracks().forEach(track => track.stop());
                    console.log("Permissions granted, but component unmounted. Stream stopped.");
                    return;
                }
                console.log("Media access granted.");
                setLocalStream(stream);
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                    localVideoRef.current.play().catch(e => console.error("Local video play failed:", e));
                }
                updateStatus('ready'); // Media ready
                setupSignalingListener(); // Setup listener *after* getting media
            })
            .catch(error => {
                if (!isMounted) return;
                console.error("Error accessing camera/mic:", error.name, error.message);
                updateStatus('perms_denied');
                toast({
                    variant: 'destructive',
                    title: 'Permissions Required',
                    description: `Could not access camera/microphone: ${error.message}. Please enable permissions.`,
                    duration: 7000,
                });
                // Automatically close if permissions denied after a delay
                if (callEndTimeoutRef.current) clearTimeout(callEndTimeoutRef.current);
                callEndTimeoutRef.current = setTimeout(() => {
                     if (isMounted) handleEndCall(); // Only call if still mounted
                }, 3000);
            });

       // --- Cleanup on Unmount or isOpen change ---
       return () => {
           isMounted = false;
           console.log("Video call modal effect cleanup triggered (unmount/close).");
            // Get the status *before* cleanup starts
           const statusBeforeCleanup = callStatusRef.current;
           // Determine if RTDB data needs removal based on the status *before* cleanup
           const shouldRemoveRtdb = statusBeforeCleanup !== 'idle' && statusBeforeCleanup !== 'ended';
           cleanup(shouldRemoveRtdb, statusBeforeCleanup);
       };
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [isOpen]); // Only trigger on isOpen change


  // --- Call Initiation ---
  const handleStartCall = async () => {
    if (callStatusRef.current !== 'ready' || !localStream) {
      toast({ variant: 'destructive', title: 'Cannot Start Call', description: 'Permissions denied or media stream not available.' });
      return;
    }

    updateStatus('calling'); // Update status optimistically
    console.log(`Initiating call in chat ${chatId} to ${partnerUser.uid}...`);

    // Ensure previous signaling data is cleared before starting a new call
    try {
        await removeCallSignalingData(chatId);
        console.log("Previous signaling data cleared (if any).");
    } catch (clearError) {
        console.warn("Could not clear previous signaling data:", clearError);
        // Proceed with caution, might lead to issues if old data lingers
    }
    // Re-setup listener after clearing data
    setupSignalingListener();


    const pc = await initializePeerConnection(true); // Initialize as initiator
    if (!pc) return; // Initialization failed, error handled within initializePeerConnection

     // --- WebRTC Offer Creation ---
     try {
         console.log("WebRTC: Creating offer...");
         const offer = await pc.createOffer();
         await pc.setLocalDescription(offer);
         console.log("WebRTC: Local description (offer) set.");
         // Send offer via RTDB
         sendSignalingMessage({ type: 'offer', payload: pc.localDescription!.toJSON() });
         // Status updated to 'calling' above
     } catch (error) {
         console.error("Error creating or sending offer:", error);
         toast({ variant: "destructive", title: "Call Error", description: "Failed to create call offer." });
         updateStatus('error');
         handleEndCall();
     }
  };

  // --- Media Toggles ---
  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsMicMuted(!track.enabled);
        console.log(`Microphone ${track.enabled ? 'unmuted' : 'muted'}`);
      });
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsCameraOff(!track.enabled);
        console.log(`Camera ${track.enabled ? 'on' : 'off'}`);
      });
    }
  };

  // --- UI Description Logic ---
  const getDialogDescription = () => {
    const currentStatus = callStatusRef.current; // Use ref for latest status
    switch (currentStatus) {
      case 'checking_perms':
        return <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Requesting permissions...</>;
      case 'perms_denied':
        return <><AlertCircle className="mr-1 h-4 w-4 text-destructive" /> Permissions denied. Allow access to proceed.</>;
      case 'ready':
        return 'Ready to call.';
      case 'calling':
        return <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Calling {partnerUser.displayName || 'User'}...</>;
       case 'receiving':
           // The accept button is shown in this state
           return `Incoming call from ${partnerUser.displayName || 'User'}...`;
       case 'connecting':
           return <><Loader2 className="mr-1 h-4 w-4 animate-spin"/> Connecting...</>;
      case 'in_call':
        return <span className="text-green-600 font-medium">Connected</span>;
       case 'ended':
           return showMissedCall ? `Call with ${partnerUser.displayName || 'User'} was missed.` : 'Call ended.';
      case 'error':
        return <span className="text-destructive">Call error occurred.</span>;
      case 'idle':
      default:
        return 'Initializing...';
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleEndCall()}>
      <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] xl:max-w-[50vw] p-0 overflow-hidden grid grid-rows-[auto_1fr_auto] h-[80vh]">
        <DialogHeader className="p-4 border-b bg-background">
          <DialogTitle className="text-lg flex items-center gap-2">
            Video Call with {partnerUser.displayName || 'User'}
          </DialogTitle>
          <DialogDescription className="flex items-center text-sm min-h-[20px]"> {/* Added min-height */}
            {getDialogDescription()}
          </DialogDescription>
        </DialogHeader>

        {/* Video Feeds Area */}
        <div className="relative grid grid-cols-1 bg-black overflow-hidden h-full">
          {/* Remote Video Feed */}
          <div className="relative flex items-center justify-center bg-muted/80 w-full h-full overflow-hidden">
             {remoteStream && ['in_call', 'connecting'].includes(callStatusRef.current) ? ( // Show video as soon as connecting starts
                <video
                   ref={remoteVideoRef}
                   autoPlay
                   playsInline
                   className="w-full h-full object-cover"
                   onLoadedMetadata={(e) => e.currentTarget.play().catch(err => console.warn("Remote play prevented:", err))}
                />
             ) : (
               <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gradient-to-b from-black/30 to-black/70">
                 <Avatar className="h-24 w-24 mb-2 border-4 border-background/50">
                   <AvatarImage src={partnerUser.photoURL || undefined} alt={partnerUser.displayName || 'User'} data-ai-hint="video call partner avatar" />
                   <AvatarFallback className="text-3xl">{getInitials(partnerUser.displayName)}</AvatarFallback>
                 </Avatar>
                 <p className="text-white/80 font-medium mt-2 bg-black/50 px-2 py-1 rounded">{partnerUser.displayName || 'User'}</p>
                  {/* Show specific status text */}
                  {callStatusRef.current === 'calling' && <p className="text-white/70 text-sm mt-1">Ringing...</p>}
                  {(callStatusRef.current === 'ended' && showMissedCall) && <p className="text-yellow-400 text-sm mt-1">Call Missed</p>}
                  {callStatusRef.current === 'receiving' && <p className="text-white/70 text-sm mt-1">Incoming call...</p>}
                  {callStatusRef.current === 'connecting' && <p className="text-white/70 text-sm mt-1">Connecting...</p>}
                  {callStatusRef.current === 'ended' && !showMissedCall && <p className="text-white/70 text-sm mt-1">Call Ended</p>}
                  {callStatusRef.current === 'error' && <p className="text-red-400 text-sm mt-1">Error</p>}
               </div>
             )}
          </div>

          {/* Local Video Feed */}
          <div className="absolute bottom-4 right-4 w-32 h-24 md:w-40 md:h-30 lg:w-48 lg:h-36 z-20 rounded-md overflow-hidden border-2 border-white/50 shadow-lg bg-black">
            {localStream && !isCameraOff ? (
              <video
                 ref={localVideoRef}
                 autoPlay
                 playsInline
                 muted
                 className="w-full h-full object-cover"
                 onLoadedMetadata={(e) => e.currentTarget.play().catch(err => console.warn("Local play prevented:", err))}
               />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                {callStatusRef.current === 'checking_perms' && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
                {callStatusRef.current === 'perms_denied' && <AlertCircle className="h-8 w-8 text-destructive" />}
                 {(['ready', 'calling', 'receiving', 'connecting', 'in_call'].includes(callStatusRef.current)) && isCameraOff && <VideoOff className="h-8 w-8 text-muted-foreground" />}
                 {/* Show avatar fallback in more states */}
                 {(!localStream || ['idle', 'ended', 'error', 'perms_denied'].includes(callStatusRef.current) || isCameraOff) && (
                    <Avatar className="h-12 w-12">
                         <AvatarImage src={currentUser.photoURL || undefined} />
                         <AvatarFallback>{getInitials(currentUser.displayName)}</AvatarFallback>
                    </Avatar>
                 )}
              </div>
            )}
          </div>
        </div>

        {/* Call Controls */}
        <DialogFooter className="p-4 border-t bg-background flex flex-row justify-center items-center gap-4 min-h-[72px]"> {/* Added min-height */}
           {/* Mic/Cam controls: Available once media is ready and call not ended/error */}
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

           {/* Start Call Button (only when 'ready') */}
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

            {/* Accept Call Button (only when 'receiving') */}
           {callStatusRef.current === 'receiving' && (
                 <Button
                     variant="default"
                     size="icon"
                     onClick={() => {
                        // Answer logic is handled by the signaling listener processing the offer.
                        // Clicking accept just changes UI state, maybe to 'connecting'.
                        console.log("User clicked Accept Call.");
                        updateStatus('connecting');
                     }}
                     className="rounded-full h-12 w-12 bg-green-600 hover:bg-green-700"
                     aria-label="Accept call"
                 >
                     <Phone className="h-6 w-6" />
                 </Button>
            )}


          {/* Calling / Connecting Indicator */}
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


          {/* End Call Button: Available in most active states */}
           {['ready', 'calling', 'receiving', 'connecting', 'in_call'].includes(callStatusRef.current) && (
            <Button variant="destructive" size="icon" onClick={handleEndCall} className="rounded-full h-12 w-12" aria-label="End call">
              <PhoneOff className="h-6 w-6" />
            </Button>
           )}

           {/* Close Button: Available in final/error states */}
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
```