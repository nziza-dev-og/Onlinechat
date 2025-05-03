
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Loader2, AlertCircle } from 'lucide-react'; // Added AlertCircle
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, User } from '@/types'; // Import User type as well

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

interface VideoCallModalProps {
  chatId: string;
  currentUser: User; // Use User type from types/index.ts
  partnerUser: UserProfile;
  isOpen: boolean;
  onClose: () => void;
}

export function VideoCallModal({ chatId, currentUser, partnerUser, isOpen, onClose }: VideoCallModalProps) {
  const [callStatus, setCallStatus] = useState<'idle' | 'checking_perms' | 'perms_denied' | 'ready' | 'calling' | 'in_call' | 'error'>('idle');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  // const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null); // TODO: Add state for remote stream via WebRTC

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // TODO: Add WebRTC connection logic refs (peerConnection, dataChannel etc.)

  const { toast } = useToast();

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

  // Get Media Permissions when modal opens
   useEffect(() => {
        if (!isOpen) {
            stopLocalStream();
            setCallStatus('idle'); // Reset status when closed
            return;
        }

        let isMounted = true; // Track mount status

        const requestMedia = async () => {
             if (callStatus !== 'idle' && callStatus !== 'error') return; // Avoid re-requesting if already checking/ready

             console.log("Requesting media permissions...");
             setCallStatus('checking_perms');
             try {
                 const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                 if (!isMounted) { // Check if component is still mounted
                     stream.getTracks().forEach(track => track.stop());
                     return;
                 }
                 console.log("Media access granted.");
                 setLocalStream(stream);
                 setCallStatus('ready'); // Ready to initiate call
                 if (localVideoRef.current) {
                     localVideoRef.current.srcObject = stream;
                     localVideoRef.current.muted = true; // Mute self-view
                 }
             } catch (error: any) {
                 console.error("Error accessing camera/mic:", error.name, error.message);
                 if (!isMounted) return; // Check mount status on error
                 setCallStatus('perms_denied');
                 toast({
                     variant: 'destructive',
                     title: 'Permissions Required',
                     description: `Could not access camera/microphone: ${error.message}. Please enable permissions.`,
                     duration: 7000,
                 });
                  // Optionally close modal on permission denial after a short delay
                  // setTimeout(onClose, 3000);
             }
         };

         requestMedia();

         // Cleanup function
         return () => {
             isMounted = false; // Mark as unmounted
             stopLocalStream();
             console.log("Video call modal effect cleanup.");
         };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, stopLocalStream, toast]); // Add toast here, remove onClose


  const handleStartCall = async () => {
    if (callStatus !== 'ready' || !localStream) {
        toast({ variant: 'destructive', title: 'Cannot Start Call', description: 'Permissions denied or media stream not available.' });
        return;
    }
    setCallStatus('calling');
    console.log(`Initiating call in chat ${chatId} to ${partnerUser.uid}...`);
    // --- TODO: Implement WebRTC Signaling ---
    // 1. Create PeerConnection
    // 2. Add localStream tracks to PeerConnection
    // 3. Create Offer
    // 4. Set Local Description
    // 5. Send Offer to partnerUser via Firestore (e.g., update chat doc or use a dedicated signaling collection)

    // Placeholder: Simulate connection
    console.warn("WebRTC Signaling not implemented. Simulating connection.");
    toast({ title: 'Calling...', description: 'WebRTC Signaling not implemented yet.' });
    setTimeout(() => {
       if (isOpen && callStatus === 'calling') { // Check if still calling and modal open
          setCallStatus('in_call');
          toast({ title: 'Call Connected (Simulated)', description: `Connected with ${partnerUser.displayName || 'User'}` });
          // TODO: When actual offer/answer/ICE exchange happens and connection is established:
          // - Set remote stream: setRemoteStream(event.streams[0]);
          // - Assign to video element: if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
       }
    }, 3000);
  };

  const handleEndCall = useCallback(() => {
    console.log("Ending call...");
    // --- TODO: Implement WebRTC Cleanup ---
    // 1. Close PeerConnection
    // 2. Close Data Channels
    // 3. Send 'hangup' signal to partnerUser via signaling mechanism

    stopLocalStream();
    setCallStatus('idle');
    onClose(); // Close the modal
    // Only toast if they were actually in a call
    if (callStatus === 'in_call') {
        toast({ title: 'Call Ended' });
    }
  }, [stopLocalStream, onClose, callStatus, toast]); // Dependencies for end call


  // Close modal if call status becomes error or denied while open
  useEffect(() => {
      if (isOpen && (callStatus === 'perms_denied' || callStatus === 'error')) {
          const timer = setTimeout(() => {
             if (isOpen) handleEndCall(); // Use handleEndCall for cleanup
          }, 3000); // Close after 3 seconds
          return () => clearTimeout(timer);
      }
  }, [callStatus, isOpen, handleEndCall]);


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
                return <><Loader2 className="mr-1 h-4 w-4 animate-spin"/> Requesting permissions...</>;
            case 'perms_denied':
                 return <><AlertCircle className="mr-1 h-4 w-4 text-destructive"/> Permissions denied.</>;
            case 'ready':
                return 'Ready to call.';
            case 'calling':
                 return <><Loader2 className="mr-1 h-4 w-4 animate-spin"/> Calling {partnerUser.displayName || 'User'}...</>;
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
    // Use handleEndCall for onOpenChange when closing via overlay click or escape key
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleEndCall()}>
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
            {/* Remote Video Feed (Placeholder/Actual) */}
             <div className="relative flex items-center justify-center bg-muted/80 w-full h-full overflow-hidden">
                 <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                 {/* Show partner avatar when not in call or if remote video is off */}
                 {(!callStatus || callStatus !== 'in_call' /* || !remoteStream */) && (
                     <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gradient-to-b from-black/30 to-black/70">
                         <Avatar className="h-24 w-24 mb-2 border-4 border-background/50">
                             <AvatarImage src={partnerUser.photoURL || undefined} alt={partnerUser.displayName || 'User'} data-ai-hint="video call partner avatar" />
                             <AvatarFallback className="text-3xl">{getInitials(partnerUser.displayName)}</AvatarFallback>
                         </Avatar>
                          <p className="text-white/80 font-medium mt-2 bg-black/50 px-2 py-1 rounded">{partnerUser.displayName || 'User'}</p>
                     </div>
                 )}
                 {/* TODO: Add placeholder if remote user turns off camera */}
             </div>

            {/* Local Video Feed (Smaller, Picture-in-Picture style) */}
             <div className="absolute bottom-4 right-4 w-32 h-24 md:w-40 md:h-30 lg:w-48 lg:h-36 z-20 rounded-md overflow-hidden border-2 border-white/50 shadow-lg bg-black">
                {localStream && !isCameraOff ? (
                     <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ): (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                         {callStatus === 'checking_perms' && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/>}
                         {callStatus === 'perms_denied' && <AlertCircle className="h-8 w-8 text-destructive"/>}
                         {(callStatus === 'ready' || callStatus === 'calling' || callStatus === 'in_call') && isCameraOff && <VideoOff className="h-8 w-8 text-muted-foreground"/>}
                    </div>
                )}
             </div>
        </div>

        {/* Call Controls */}
        <DialogFooter className="p-4 border-t bg-background flex flex-row justify-center gap-4">
          {/* Mic/Cam controls only available when stream is ready/in call */}
          {(callStatus === 'ready' || callStatus === 'calling' || callStatus === 'in_call') && localStream && (
              <>
              <Button variant={isMicMuted ? "destructive" : "secondary"} size="icon" onClick={toggleMic} aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"} className="rounded-full h-12 w-12">
                  {isMicMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>
              <Button variant={isCameraOff ? "destructive" : "secondary"} size="icon" onClick={toggleCamera} aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"} className="rounded-full h-12 w-12">
                  {isCameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </Button>
              </>
          )}

          {/* Start Call Button */}
          {callStatus === 'ready' && (
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

           {/* Calling Indicator Button */}
          {callStatus === 'calling' && (
               <Button
                   variant="default"
                   size="icon"
                   disabled
                   className="rounded-full h-12 w-12 bg-green-600 hover:bg-green-700 cursor-not-allowed"
                   aria-label="Calling"
               >
                   <Loader2 className="h-6 w-6 animate-spin"/>
               </Button>
           )}


          {/* End Call Button */}
          {(callStatus === 'calling' || callStatus === 'in_call') && (
             <Button variant="destructive" size="icon" onClick={handleEndCall} className="rounded-full h-12 w-12" aria-label="End call">
                 <PhoneOff className="h-6 w-6" />
             </Button>
          )}

          {/* Placeholder/Disabled buttons for other states */}
           {(callStatus === 'idle' || callStatus === 'checking_perms') && (
               <Button variant="secondary" size="icon" disabled className="rounded-full h-12 w-12" aria-label="Initializing call">
                   <Loader2 className="h-6 w-6 animate-spin"/>
               </Button>
           )}
           {(callStatus === 'perms_denied' || callStatus === 'error') && (
                <Button variant="destructive" size="icon" disabled className="rounded-full h-12 w-12" aria-label="Call unavailable">
                   <PhoneOff className="h-6 w-6" />
               </Button>
           )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

