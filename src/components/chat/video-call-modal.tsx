
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, User } from '@/types';
// Import RTDB functions
import { getDatabase, ref as rtdbRef, push, onValue, off, remove, serverTimestamp, type DatabaseReference, DataSnapshot, Unsubscribe } from "firebase/database";
import { rtdb } from '@/lib/firebase'; // Import the initialized RTDB instance

// --- RTDB Signaling Message Types ---
interface SignalingOffer {
  senderId: string;
  type: 'offer';
  payload: RTCSessionDescriptionInit;
  timestamp?: object; // Use serverTimestamp() for RTDB
}

interface SignalingAnswer {
  senderId: string;
  type: 'answer';
  payload: RTCSessionDescriptionInit;
  timestamp?: object;
}

interface SignalingCandidate {
  senderId: string;
  type: 'candidate';
  payload: RTCIceCandidateInit | null; // Allow null candidate for end-of-candidates signal
  timestamp?: object;
}

type SignalingMessage = SignalingOffer | SignalingAnswer | SignalingCandidate;
// --- End RTDB Signaling Message Types ---

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
        // Consider adding TURN servers for better connectivity in restricted networks
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

export function VideoCallModal({ chatId, currentUser, partnerUser, isOpen, onClose }: VideoCallModalProps) {
  const [callStatus, setCallStatus] = useState<'idle' | 'checking_perms' | 'perms_denied' | 'ready' | 'calling' | 'receiving' | 'connecting' | 'in_call' | 'error'>('idle');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCaller, setIsCaller] = useState(false); // Track if current user initiated the call

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callSignalingRef = useRef<DatabaseReference | null>(null); // Ref for the RTDB signaling path
  const messagesListenerUnsubscribe = useRef<Unsubscribe | null>(null); // Ref for RTDB listener cleanup

  const { toast } = useToast();

  // --- Cleanup Functions ---
  const stopLocalStream = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      console.log("Local stream stopped.");
    }
  }, [localStream]);

  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log("Peer connection closed.");
    }
  }, []);

   const removeSignalingData = useCallback(() => {
        if (callSignalingRef.current) {
            remove(callSignalingRef.current)
                .then(() => console.log(`RTDB: Signaling data removed for call ${chatId}`))
                .catch((err) => console.error(`RTDB: Error removing signaling data for call ${chatId}:`, err));
            callSignalingRef.current = null; // Clear the ref after removal attempt
        }
    }, [chatId]);


  const cleanup = useCallback(() => {
    console.log("Running video call cleanup...");
    stopLocalStream();
    closePeerConnection();
    setRemoteStream(null);
    if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
    }
     // Detach RTDB listener
     if (messagesListenerUnsubscribe.current) {
        messagesListenerUnsubscribe.current();
        messagesListenerUnsubscribe.current = null;
        console.log("RTDB messages listener detached.");
     }
     // Remove signaling data only if the user was the caller or if the call was established/connecting
     if (isCaller || callStatus === 'in_call' || callStatus === 'connecting') {
        removeSignalingData();
     } else {
         callSignalingRef.current = null; // Clear ref anyway if not removing data
     }

    setCallStatus('idle');
    setIsCaller(false);
  }, [stopLocalStream, closePeerConnection, removeSignalingData, isCaller, callStatus]);
  // --- End Cleanup Functions ---


  // --- RTDB Signaling Functions ---
  const sendSignalingMessage = useCallback(async (message: Omit<SignalingMessage, 'senderId' | 'timestamp'>) => {
    if (!callSignalingRef.current || !currentUser?.uid) {
        console.error("Cannot send signaling message: RTDB ref or user ID missing.");
        return;
    }
    const messageWithSender: SignalingMessage = {
        ...message,
        senderId: currentUser.uid,
        timestamp: serverTimestamp() // Let RTDB set the timestamp
    };
     try {
        await push(callSignalingRef.current, messageWithSender); // push() generates a unique key
        // console.log(`RTDB: Sent ${message.type} message.`);
     } catch (error) {
        console.error(`RTDB: Error sending ${message.type} message:`, error);
        toast({ variant: "destructive", title: "Signaling Error", description: `Could not send ${message.type}.` });
        // Consider ending the call on signaling failure
        handleEndCall();
     }
  }, [callSignalingRef, currentUser?.uid, toast, handleEndCall]);

   const setupSignalingListener = useCallback(() => {
       if (!callSignalingRef.current || messagesListenerUnsubscribe.current) {
           console.warn("RTDB: Signaling ref not ready or listener already exists.");
           return;
       }

       console.log(`RTDB: Setting up listener for messages at ${callSignalingRef.current.key}`);

       messagesListenerUnsubscribe.current = onValue(callSignalingRef.current, (snapshot: DataSnapshot) => {
           if (!snapshot.exists()) {
               console.log(`RTDB: No signaling data found for call ${chatId} or data removed.`);
               // If data is removed and we are in call, it might mean the other user hung up
               if (callStatus === 'in_call' || callStatus === 'connecting' || callStatus === 'calling' ) {
                   console.log("RTDB: Signaling data removed, assuming call ended by other party.");
                   toast({ title: "Call Ended", description: "The other user left the call." });
                   handleEndCall();
               }
               return;
           }

           const messages = snapshot.val();
           // Iterate over messages using object keys (Firebase auto-generated keys)
           Object.keys(messages).forEach(async key => {
               const message = messages[key] as SignalingMessage;

               // Ignore own messages or messages without payload
               if (message.senderId === currentUser?.uid || !message.payload) {
                   return;
               }
                // console.log(`RTDB: Received message type: ${message.type} from ${message.senderId}`);

               if (!peerConnectionRef.current) {
                   console.warn("Received signaling message but peer connection is not initialized.");
                   // If receiving an offer, initialize connection here
                   if (message.type === 'offer') {
                       await initializePeerConnection(false); // Initialize as receiver
                   } else {
                       return; // Cannot process other messages without peer connection
                   }
               }
               // Ensure peerConnection exists now
               const pc = peerConnectionRef.current;
               if (!pc) {
                  console.error("Peer connection still null after potential initialization.");
                  return;
               }


               try {
                   switch (message.type) {
                       case 'offer':
                            if (pc.signalingState !== 'stable') {
                                console.warn(`Received offer in non-stable state: ${pc.signalingState}. Ignoring.`);
                                return;
                            }
                            console.log("RTDB: Received offer");
                            setCallStatus('receiving'); // Show UI indicating incoming call
                            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                            console.log("WebRTC: Remote description (offer) set.");
                            setCallStatus('connecting'); // Update status
                            const answer = await pc.createAnswer();
                            console.log("WebRTC: Answer created.");
                            await pc.setLocalDescription(answer);
                            console.log("WebRTC: Local description (answer) set.");
                            sendSignalingMessage({ type: 'answer', payload: pc.localDescription!.toJSON() });
                            break;

                       case 'answer':
                           if (pc.signalingState !== 'have-local-offer') {
                                console.warn(`Received answer in unexpected state: ${pc.signalingState}. Ignoring.`);
                                return;
                           }
                            console.log("RTDB: Received answer");
                            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                            console.log("WebRTC: Remote description (answer) set.");
                            // Connection should establish after ICE candidates are exchanged
                            break;

                       case 'candidate':
                            if (message.payload && pc.remoteDescription) { // Only add candidate if remote description is set
                                // console.log("RTDB: Received ICE candidate");
                                await pc.addIceCandidate(new RTCIceCandidate(message.payload));
                                // console.log("WebRTC: ICE candidate added.");
                            } else if (!message.payload) {
                                console.log("RTDB: Received end-of-candidates signal.");
                                // Handle potential end-of-candidates signal if needed
                            } else {
                                console.warn("RTDB: Received ICE candidate but remote description is not set yet. Ignoring.");
                            }
                            break;
                   }
               } catch (error) {
                   console.error(`Error handling signaling message type ${message.type}:`, error);
                   setCallStatus('error');
                   toast({ variant: "destructive", title: "WebRTC Error", description: `Failed to process ${message.type}.` });
                   handleEndCall();
               }
           });
       }, (error) => {
           console.error(`RTDB: Error listening for signaling messages at ${callSignalingRef.current?.key}:`, error);
           toast({ variant: "destructive", title: "Signaling Error", description: "Lost connection to signaling server." });
           handleEndCall();
           messagesListenerUnsubscribe.current = null; // Clear ref on error
       });

   }, [callSignalingRef, chatId, currentUser?.uid, callStatus, toast, handleEndCall, sendSignalingMessage]);
   // --- End RTDB Signaling Functions ---


  // --- WebRTC Peer Connection Setup ---
   const initializePeerConnection = useCallback(async (caller: boolean) => {
       console.log(`Initializing PeerConnection. Is caller: ${caller}`);
        if (!localStream) {
            console.error("Cannot initialize PeerConnection: Local stream not available.");
            setCallStatus('error');
            toast({ variant: "destructive", title: "Call Error", description: "Camera/Mic stream failed." });
            handleEndCall();
            return null;
        }
       if (peerConnectionRef.current) {
           console.warn("PeerConnection already exists. Closing previous one.");
           closePeerConnection();
       }

       try {
           const pc = new RTCPeerConnection(configuration);
           peerConnectionRef.current = pc;
           setIsCaller(caller);

           // Add local stream tracks
           localStream.getTracks().forEach(track => {
               pc.addTrack(track, localStream);
               console.log(`WebRTC: Added local ${track.kind} track.`);
           });

           // Handle incoming remote tracks
           pc.ontrack = (event) => {
               console.log(`WebRTC: Received remote track (${event.track.kind}).`);
               if (event.streams && event.streams[0]) {
                   console.log("WebRTC: Assigning remote stream.");
                   setRemoteStream(event.streams[0]);
                   if (remoteVideoRef.current) {
                       remoteVideoRef.current.srcObject = event.streams[0];
                   }
                   // Move to 'in_call' status once remote track is received
                    if (callStatus !== 'in_call') {
                       setCallStatus('in_call');
                       toast({ title: 'Call Connected', description: `Connected with ${partnerUser.displayName || 'User'}` });
                    }
               } else {
                   // Handle cases where track is added without a stream? (Less common)
                   console.warn("WebRTC: Remote track received but no stream associated.");
               }
           };

           // Handle ICE candidates
           pc.onicecandidate = (event) => {
               if (event.candidate) {
                   // console.log("WebRTC: Generated ICE candidate:", event.candidate.type);
                   sendSignalingMessage({ type: 'candidate', payload: event.candidate.toJSON() });
               } else {
                   console.log("WebRTC: All ICE candidates generated.");
                   // Optionally send a null candidate to signal end
                   sendSignalingMessage({ type: 'candidate', payload: null });
               }
           };

           // Handle connection state changes
           pc.oniceconnectionstatechange = () => {
               console.log(`WebRTC: ICE Connection State: ${pc.iceConnectionState}`);
               switch (pc.iceConnectionState) {
                   case 'connected':
                        // This state indicates connectivity check succeeded, often considered 'in_call'
                        if (callStatus !== 'in_call') {
                            // setCallStatus('in_call'); // Redundant if ontrack handles it
                            // toast({ title: 'Call Connected', description: `Connected with ${partnerUser.displayName || 'User'}` });
                        }
                        break;
                   case 'disconnected':
                        // Connection lost, might recover
                        console.warn("WebRTC: ICE Disconnected. Attempting to reconnect...");
                        // Could add a timeout here to declare call failed if it doesn't reconnect
                        break;
                   case 'failed':
                        console.error("WebRTC: ICE Connection Failed.");
                        setCallStatus('error');
                        toast({ variant: "destructive", title: "Connection Failed", description: "Could not establish connection." });
                        handleEndCall();
                        break;
                   case 'closed':
                        console.log("WebRTC: ICE Connection Closed.");
                         // Can be triggered by pc.close() or network issues
                        if (callStatus !== 'idle') { // Avoid triggering on manual close
                             handleEndCall();
                        }
                        break;
               }
           };

             // Setup the RTDB signaling listener *after* creating the PeerConnection
             if (!rtdb) {
                throw new Error("Realtime Database service not available.");
             }
             // Define the specific path for this call's signaling messages
             callSignalingRef.current = rtdbRef(rtdb, `calls/${chatId}/messages`);
             setupSignalingListener();


           return pc; // Return the created connection

       } catch (error) {
           console.error("Error initializing PeerConnection:", error);
           setCallStatus('error');
           toast({ variant: "destructive", title: "WebRTC Error", description: "Failed to initialize call connection." });
           handleEndCall();
           return null;
       }
   }, [localStream, toast, handleEndCall, closePeerConnection, sendSignalingMessage, setupSignalingListener, callStatus, partnerUser.displayName, chatId]);
   // --- End WebRTC Peer Connection Setup ---


  // Get Media Permissions when modal opens
  useEffect(() => {
    if (!isOpen) {
      cleanup(); // Use the main cleanup function
      return;
    }

    let isMounted = true;

    const requestMedia = async () => {
      if (callStatus !== 'idle' && callStatus !== 'error') return;

      console.log("Requesting media permissions...");
      setCallStatus('checking_perms');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!isMounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        console.log("Media access granted.");
        setLocalStream(stream);
        setCallStatus('ready');
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
        }
      } catch (error: any) {
        console.error("Error accessing camera/mic:", error.name, error.message);
        if (!isMounted) return;
        setCallStatus('perms_denied');
        toast({
          variant: 'destructive',
          title: 'Permissions Required',
          description: `Could not access camera/microphone: ${error.message}. Please enable permissions.`,
          duration: 7000,
        });
      }
    };

    requestMedia();

    return () => {
      isMounted = false;
      cleanup(); // Ensure cleanup runs on unmount *after* setup
      console.log("Video call modal effect cleanup on unmount/close.");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, toast]); // `cleanup` is memoized, no need to list its dependencies here


  const handleStartCall = async () => {
    if (callStatus !== 'ready' || !localStream) {
      toast({ variant: 'destructive', title: 'Cannot Start Call', description: 'Permissions denied or media stream not available.' });
      return;
    }

    const pc = await initializePeerConnection(true); // Initialize as caller
    if (!pc) return; // Initialization failed

    setCallStatus('calling');
    console.log(`Initiating call in chat ${chatId} to ${partnerUser.uid}...`);

     // --- WebRTC Offer Creation ---
     try {
         console.log("WebRTC: Creating offer...");
         const offer = await pc.createOffer();
         await pc.setLocalDescription(offer);
         console.log("WebRTC: Local description (offer) set.");
         // Send offer via RTDB
         sendSignalingMessage({ type: 'offer', payload: pc.localDescription!.toJSON() });
     } catch (error) {
         console.error("Error creating or sending offer:", error);
         setCallStatus('error');
         toast({ variant: "destructive", title: "Call Error", description: "Failed to create call offer." });
         handleEndCall();
     }
  };

  // Renamed to make distinct from onClose prop
  const handleHangUp = useCallback(() => {
    console.log("Hang up button clicked.");
    handleEndCall(); // Use the main cleanup and state reset logic
    onClose(); // Close the modal
    // Toast is handled within handleEndCall now based on status
  }, [handleEndCall, onClose]);


  // Close modal if call status becomes error or denied while open
  useEffect(() => {
    if (isOpen && (callStatus === 'perms_denied' || callStatus === 'error')) {
      const timer = setTimeout(() => {
        if (isOpen) handleHangUp(); // Use hangup to ensure modal closes too
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [callStatus, isOpen, handleHangUp]);


  const toggleMic = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
        setIsMicMuted(!audioTracks[0].enabled);
        console.log(`Microphone ${audioTracks[0].enabled ? 'unmuted' : 'muted'}`);
      }
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].enabled = !videoTracks[0].enabled;
        setIsCameraOff(!videoTracks[0].enabled);
        console.log(`Camera ${videoTracks[0].enabled ? 'on' : 'off'}`);
      }
    }
  };

  const getDialogDescription = () => {
    switch (callStatus) {
      case 'checking_perms':
        return <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Requesting permissions...</>;
      case 'perms_denied':
        return <><AlertCircle className="mr-1 h-4 w-4 text-destructive" /> Permissions denied.</>;
      case 'ready':
        return 'Ready to call.';
      case 'calling':
        return <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Calling {partnerUser.displayName || 'User'}...</>;
       case 'receiving': // Added state for receiver side
           return `Receiving call from ${partnerUser.displayName || 'User'}...`;
       case 'connecting': // State while ICE/SDP exchange happens
           return <><Loader2 className="mr-1 h-4 w-4 animate-spin"/> Connecting...</>;
      case 'in_call':
        return <span className="text-green-600">Connected</span>;
      case 'error':
        return <span className="text-destructive">Call error.</span>;
      case 'idle':
      default:
        return 'Preparing call...';
    }
  };


  return (
    // Use handleHangUp for onOpenChange when closing via overlay click or escape key
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleHangUp()}>
      <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] xl:max-w-[50vw] p-0 overflow-hidden grid grid-rows-[auto_1fr_auto] h-[80vh]">
        <DialogHeader className="p-4 border-b bg-background">
          <DialogTitle className="text-lg flex items-center gap-2">
            Video Call with {partnerUser.displayName || 'User'}
          </DialogTitle>
          <DialogDescription className="flex items-center text-sm">
            {getDialogDescription()}
          </DialogDescription>
        </DialogHeader>

        {/* Video Feeds Area */}
        <div className="relative grid grid-cols-1 bg-black overflow-hidden h-full">
          {/* Remote Video Feed */}
          <div className="relative flex items-center justify-center bg-muted/80 w-full h-full overflow-hidden">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {/* Show partner avatar if remote video is off or not yet connected */}
            {( !remoteStream ) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gradient-to-b from-black/30 to-black/70">
                <Avatar className="h-24 w-24 mb-2 border-4 border-background/50">
                  <AvatarImage src={partnerUser.photoURL || undefined} alt={partnerUser.displayName || 'User'} data-ai-hint="video call partner avatar" />
                  <AvatarFallback className="text-3xl">{getInitials(partnerUser.displayName)}</AvatarFallback>
                </Avatar>
                <p className="text-white/80 font-medium mt-2 bg-black/50 px-2 py-1 rounded">{partnerUser.displayName || 'User'}</p>
              </div>
            )}
          </div>

          {/* Local Video Feed */}
          <div className="absolute bottom-4 right-4 w-32 h-24 md:w-40 md:h-30 lg:w-48 lg:h-36 z-20 rounded-md overflow-hidden border-2 border-white/50 shadow-lg bg-black">
            {localStream && !isCameraOff ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                {callStatus === 'checking_perms' && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
                {callStatus === 'perms_denied' && <AlertCircle className="h-8 w-8 text-destructive" />}
                {(callStatus === 'ready' || callStatus === 'calling' || callStatus === 'in_call' || callStatus === 'receiving' || callStatus === 'connecting') && isCameraOff && <VideoOff className="h-8 w-8 text-muted-foreground" />}
                 {/* Show avatar initially */}
                 {(callStatus === 'idle' || callStatus === 'ready' && !isCameraOff) && (
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
        <DialogFooter className="p-4 border-t bg-background flex flex-row justify-center gap-4">
           {/* Mic/Cam controls available once stream is ready */}
          {(callStatus === 'ready' || callStatus === 'calling' || callStatus === 'receiving' || callStatus === 'connecting' || callStatus === 'in_call') && localStream && (
            <>
              <Button variant={isMicMuted ? "destructive" : "secondary"} size="icon" onClick={toggleMic} aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"} className="rounded-full h-12 w-12">
                {isMicMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>
              <Button variant={isCameraOff ? "destructive" : "secondary"} size="icon" onClick={toggleCamera} aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"} className="rounded-full h-12 w-12">
                {isCameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </Button>
            </>
          )}

          {/* Start Call / Accept Call Button */}
          {(callStatus === 'ready' || callStatus === 'receiving') && ( // Show green button if ready OR receiving
                <Button
                    variant="default"
                    size="icon"
                    onClick={callStatus === 'ready' ? handleStartCall : () => { /* TODO: Accept call logic - likely involves setting descriptions */ console.warn("Accept call logic not implemented"); setCallStatus('connecting'); /* Temporary */ }}
                    className="rounded-full h-12 w-12 bg-green-600 hover:bg-green-700"
                    aria-label={callStatus === 'ready' ? "Start call" : "Accept call"}
                >
                    <Phone className="h-6 w-6" />
                </Button>
           )}

          {/* Calling / Connecting Indicator Button */}
          {(callStatus === 'calling' || callStatus === 'connecting') && (
            <Button
              variant="default"
              size="icon"
              disabled
              className="rounded-full h-12 w-12 bg-yellow-500 hover:bg-yellow-600 cursor-not-allowed"
              aria-label={callStatus === 'calling' ? "Calling" : "Connecting"}
            >
              <Loader2 className="h-6 w-6 animate-spin" />
            </Button>
          )}


          {/* End Call Button */}
           {/* Show hang up unless idle, checking perms, perms denied or error */}
           {callStatus !== 'idle' && callStatus !== 'checking_perms' && callStatus !== 'perms_denied' && callStatus !== 'error' && (
            <Button variant="destructive" size="icon" onClick={handleHangUp} className="rounded-full h-12 w-12" aria-label="End call">
              <PhoneOff className="h-6 w-6" />
            </Button>
           )}


          {/* Placeholder/Disabled buttons for other states */}
          {(callStatus === 'idle' || callStatus === 'checking_perms') && (
            <Button variant="secondary" size="icon" disabled className="rounded-full h-12 w-12" aria-label="Initializing call">
              <Loader2 className="h-6 w-6 animate-spin" />
            </Button>
          )}
           {(callStatus === 'perms_denied' || callStatus === 'error') && (
             <Button variant="destructive" size="icon" onClick={handleHangUp} className="rounded-full h-12 w-12" aria-label="Close">
                  <PhoneOff className="h-6 w-6" /> {/* Still allow closing */}
             </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

