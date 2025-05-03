
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Loader2 } from 'lucide-react';
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
  const [isCalling, setIsCalling] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null); // null: checking, true: granted, false: denied

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // TODO: Add WebRTC connection logic refs (peerConnection, dataChannel etc.)

  const { toast } = useToast();

  // Request Camera and Mic Permissions on Mount/Open
  useEffect(() => {
    if (!isOpen) {
        // Clean up stream when modal closes
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
            console.log("Video call stream stopped on modal close.");
        }
        setHasCameraPermission(null); // Reset permission status
        setIsCalling(false); // Reset call status
        setIsInCall(false);
        return;
    }

    const getMediaPermissions = async () => {
       setHasCameraPermission(null); // Start in checking state
       try {
           const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
           setStream(mediaStream);
           setHasCameraPermission(true);
            if (localVideoRef.current) {
                 localVideoRef.current.srcObject = mediaStream;
                 localVideoRef.current.muted = true; // Mute self-view
            }
           console.log("Camera and Mic access granted.");
       } catch (error: any) {
           console.error("Error accessing camera/mic:", error.name, error.message);
           setHasCameraPermission(false);
           toast({
               variant: 'destructive',
               title: 'Permissions Required',
               description: `Could not access camera/microphone: ${error.message}. Please enable permissions in browser settings.`,
           });
           onClose(); // Close modal if permissions denied
       }
    };

    getMediaPermissions();

     // Cleanup function for when modal closes or component unmounts while open
     return () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
            console.log("Video call stream stopped on effect cleanup.");
        }
     };

  }, [isOpen, onClose, stream, toast]); // Rerun when isOpen changes

  const handleStartCall = async () => {
    if (!hasCameraPermission || !stream) {
        toast({ variant: 'destructive', title: 'Permissions Error', description: 'Cannot start call without camera/mic access.' });
        return;
    }
    setIsCalling(true);
    console.log(`Initiating call in chat ${chatId} to ${partnerUser.uid}...`);
    // TODO: Implement WebRTC signaling to initiate call with partnerUser
    // This involves sending an 'offer' via Firestore or another signaling server

    // Placeholder: Simulate call acceptance after a delay
    setTimeout(() => {
       if (isOpen) { // Check if modal is still open
          setIsCalling(false);
          setIsInCall(true);
          toast({ title: 'Call Connected', description: `Connected with ${partnerUser.displayName || 'User'}` });
          // TODO: Set up the WebRTC peer connection here after offer/answer exchange
          // Example: If remote stream is received, set it to remoteVideoRef
          // if (remoteVideoRef.current && remoteStream) {
          //    remoteVideoRef.current.srcObject = remoteStream;
          // }
       }
    }, 3000);
  };

  const handleEndCall = () => {
    console.log("Ending call...");
    // TODO: Implement WebRTC cleanup (close peer connection, data channels)
    // TODO: Send 'hangup' signal to partnerUser

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
    }
    setIsInCall(false);
    setIsCalling(false);
    onClose(); // Close the modal
    toast({ title: 'Call Ended' });
  };

  const toggleMic = () => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
        setIsMicMuted(!audioTracks[0].enabled);
        console.log(`Microphone ${audioTracks[0].enabled ? 'unmuted' : 'muted'}`);
      }
    }
  };

  const toggleCamera = () => {
     if (stream) {
       const videoTracks = stream.getVideoTracks();
       if (videoTracks.length > 0) {
         videoTracks[0].enabled = !videoTracks[0].enabled;
         setIsCameraOff(!videoTracks[0].enabled);
         console.log(`Camera ${videoTracks[0].enabled ? 'on' : 'off'}`);
       }
     }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleEndCall()}>
      <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] xl:max-w-[50vw] p-0 overflow-hidden grid grid-rows-[auto_1fr_auto] h-[80vh]">
        <DialogHeader className="p-4 border-b bg-background">
          <DialogTitle className="text-lg flex items-center gap-2">
             Video Call with {partnerUser.displayName || 'User'}
          </DialogTitle>
          {!isInCall && !isCalling && hasCameraPermission === null && (
              <DialogDescription className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Requesting permissions...</DialogDescription>
          )}
          {!isInCall && isCalling && (
              <DialogDescription className="flex items-center gap-1 text-primary"><Loader2 className="h-4 w-4 animate-spin"/> Calling...</DialogDescription>
          )}
           {isInCall && (
               <DialogDescription className="text-green-600">Connected</DialogDescription>
           )}
           {hasCameraPermission === false && (
                <DialogDescription className="text-destructive">Camera/Mic access denied.</DialogDescription>
           )}
        </DialogHeader>

        {/* Video Feeds Area */}
        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-1 bg-black overflow-hidden h-full">
            {/* Remote Video Feed */}
             <div className="relative flex items-center justify-center bg-muted/80 w-full h-full overflow-hidden aspect-video">
                 <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                 {!isInCall && ( // Show partner avatar before call connects
                     <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                         <Avatar className="h-24 w-24 mb-2 border-4 border-background/50">
                             <AvatarImage src={partnerUser.photoURL || undefined} alt={partnerUser.displayName || 'User'} data-ai-hint="video call partner avatar" />
                             <AvatarFallback className="text-3xl">{getInitials(partnerUser.displayName)}</AvatarFallback>
                         </Avatar>
                          <p className="text-white/80 font-medium mt-2 bg-black/50 px-2 py-1 rounded">{partnerUser.displayName || 'User'}</p>
                     </div>
                 )}
                 {/* Placeholder/Indicator if remote video is off */}
                 {isInCall && remoteVideoRef.current?.paused && ( // Check actual video state if possible
                      <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/70">
                          <VideoOff className="h-16 w-16 text-white/50"/>
                      </div>
                 )}
             </div>

            {/* Local Video Feed (Smaller, Picture-in-Picture style) */}
             <div className="absolute bottom-4 right-4 w-32 h-24 md:w-40 md:h-30 lg:w-48 lg:h-36 z-20 rounded-md overflow-hidden border-2 border-white/50 shadow-lg bg-black">
                {hasCameraPermission === true && !isCameraOff ? (
                     <video ref={localVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                ): (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                        <VideoOff className="h-8 w-8 text-muted-foreground"/>
                    </div>
                )}

             </div>
        </div>

        {/* Call Controls */}
        <DialogFooter className="p-4 border-t bg-background flex flex-row justify-center gap-4">
          {hasCameraPermission === true && (
              <>
              <Button variant={isMicMuted ? "destructive" : "secondary"} size="icon" onClick={toggleMic} aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"} className="rounded-full h-12 w-12">
                  {isMicMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>
              <Button variant={isCameraOff ? "destructive" : "secondary"} size="icon" onClick={toggleCamera} aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"} className="rounded-full h-12 w-12">
                  {isCameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </Button>
              </>
          )}

          {!isInCall && (
              <Button
                  variant="default"
                  size="icon"
                  onClick={handleStartCall}
                  disabled={!hasCameraPermission || isCalling || !stream}
                  className="rounded-full h-12 w-12 bg-green-600 hover:bg-green-700"
                  aria-label="Start call"
              >
                   {isCalling ? <Loader2 className="h-6 w-6 animate-spin"/> : <Phone className="h-6 w-6" />}
              </Button>
          )}

          {isInCall && (
             <Button variant="destructive" size="icon" onClick={handleEndCall} className="rounded-full h-12 w-12" aria-label="End call">
                 <PhoneOff className="h-6 w-6" />
             </Button>
          )}
          {/* Display placeholder button if permissions are denied/checking */}
           {hasCameraPermission === false && (
               <Button variant="destructive" size="icon" disabled className="rounded-full h-12 w-12" aria-label="Permissions denied">
                   <PhoneOff className="h-6 w-6" />
               </Button>
           )}
           {hasCameraPermission === null && !isCalling && (
               <Button variant="secondary" size="icon" disabled className="rounded-full h-12 w-12" aria-label="Checking permissions">
                   <Loader2 className="h-6 w-6 animate-spin"/>
               </Button>
           )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
