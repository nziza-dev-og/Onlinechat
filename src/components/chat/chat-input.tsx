
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Image as ImageIcon, X, Mic, Square, Trash2, Play, Pause, AlertCircle, Video as VideoIcon } from 'lucide-react'; // Added VideoIcon
import { useAuth } from '@/hooks/use-auth';
import { updateTypingStatus } from '@/lib/chat.service';
import { uploadAudio } from '@/lib/storage.service'; // Import the audio upload service
import { useToast } from "@/hooks/use-toast";
import type { Message } from '@/types'; // Import Message type
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress'; // Import Progress for upload indication
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Import Tooltip

interface ChatInputProps {
  chatId: string | null;
  replyingTo: Message | null; // Message being replied to
  onClearReply: () => void; // Function to clear reply state
}

export function ChatInput({ chatId, replyingTo, onClearReply }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState(''); // State for video URL
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [showVideoUrlInput, setShowVideoUrlInput] = useState(false); // State for showing video input
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null); // Ref for the message input

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null); // null = unknown, true = granted, false = denied/unavailable
  const [browserSupportsMedia, setBrowserSupportsMedia] = useState(true); // Assume support initially
  const audioRef = useRef<HTMLAudioElement>(null); // Ref for audio preview player
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const streamRef = useRef<MediaStream | null>(null); // Ref to hold the current audio stream
  const [isCheckingPermission, setIsCheckingPermission] = useState(true); // State for initial permission check

  // Check browser support and initial permission status on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("Browser does not support MediaDevices API needed for audio recording.");
      setBrowserSupportsMedia(false);
      setHasMicPermission(false);
      setIsCheckingPermission(false);
    } else {
      checkMicPermissionStatus().finally(() => setIsCheckingPermission(false));
    }
     // Cleanup function
     return () => {
      stopStream(); // Ensure stream is stopped on unmount
      // Clean up recorder refs and listeners
      if (mediaRecorderRef.current) {
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.onerror = null;
          if (mediaRecorderRef.current.state === "recording") {
             try { mediaRecorderRef.current.stop(); } catch (e) { console.warn("Cleanup: Error stopping recorder", e); }
          }
          mediaRecorderRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Focus input when reply context appears
  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  // --- Typing Indicator Logic ---
  const sendTypingUpdate = useCallback(async (isTyping: boolean) => {
    if (!chatId || !user?.uid || isRecording) return; // Don't send typing update while recording
    try {
        await updateTypingStatus(chatId, user.uid, isTyping);
    } catch (error) {
        console.error("Error sending typing update:", error);
    }
   }, [chatId, user?.uid, isRecording]);


  useEffect(() => {
     return () => {
       if (typingTimeoutRef.current) {
         clearTimeout(typingTimeoutRef.current);
       }
       if (chatId && user?.uid && !isRecording) { // Only stop typing if not currently recording
           sendTypingUpdate(false);
       }
     };
  }, [chatId, user?.uid, sendTypingUpdate, isRecording]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    if (!chatId || !user?.uid || isRecording) return; // Don't trigger typing updates while recording

    if (newMessage.trim() && !typingTimeoutRef.current) {
       sendTypingUpdate(true);
    }

    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
       sendTypingUpdate(false);
       typingTimeoutRef.current = null;
    }, 3000);
  };
  // --- End Typing Indicator Logic ---

  // --- Audio Recording Logic ---

  // Function to stop the current audio stream and release the mic
   const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Audio track ${track.id} stopped.`);
      });
      streamRef.current = null;
      console.log("Audio stream stopped and released.");
    }
  }, []);


  // Function to check permission status without prompting
  const checkMicPermissionStatus = useCallback(async () => {
    if (!browserSupportsMedia || !navigator.permissions) return;
    console.log("Checking microphone permission status...");
    setIsCheckingPermission(true);
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log("Microphone permission status:", permissionStatus.state);
      setHasMicPermission(permissionStatus.state === 'granted');
       permissionStatus.onchange = () => {
          console.log("Microphone permission status changed to:", permissionStatus.state);
          setHasMicPermission(permissionStatus.state === 'granted');
          if (permissionStatus.state !== 'granted' && isRecording) {
              stopRecording(true); // Force stop if permission revoked during recording
              toast({ variant: 'destructive', title: 'Permission Changed', description: 'Microphone access was revoked.' });
          }
      };
    } catch (error) {
       setHasMicPermission(null); // Indicate unknown status if query fails
       console.warn("Microphone permission query failed, will ask on first use.", error);
    } finally {
        setIsCheckingPermission(false);
    }
  }, [browserSupportsMedia, isRecording, toast]);


  // Request microphone permission and get stream
  const getMicStream = async (): Promise<MediaStream | null> => {
      console.log("Attempting to get microphone stream...");
      if (!browserSupportsMedia) {
         toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Audio recording is not supported by your browser.' });
         return null;
      }
      if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Required', description: 'Please enable microphone permission in browser settings.'});
        return null;
      }

      try {
        // Ensure any previous stream is stopped before requesting a new one
        stopStream();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicPermission(true); // Update state if permission was granted via prompt
        streamRef.current = stream; // Store the stream
        console.log("Microphone access granted, stream obtained.", stream.id);
        return stream;
      } catch (error: any) {
        console.error('Error accessing microphone:', error.name, error.message, error);
        setHasMicPermission(false); // Explicitly set to false on error/denial
        toast({
          variant: 'destructive',
          title: error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' ? 'Permission Denied' : 'Microphone Error',
          description: error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' ? 'Microphone access denied. Please allow in browser settings.' : `Could not access microphone: ${error.message}`,
        });
        stopStream(); // Ensure any partial stream is stopped
        return null;
      }
  };


  const startRecording = async () => {
    console.log("Start recording requested.");
    discardRecording(); // Clear any previous recording/preview first
    setShowImageUrlInput(false); // Hide other inputs
    setShowVideoUrlInput(false);
    setImageUrl('');
    setVideoUrl('');

    const stream = await getMicStream();
    if (!stream) {
        console.error("Failed to get microphone stream. Cannot start recording.");
        return; // Permission denied or error getting stream
    }


    try {
        // Determine supported MIME type
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
        let supportedMimeType = '';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                supportedMimeType = type;
                break;
            }
        }
        if (!supportedMimeType) {
            console.warn(`Could not find preferred MIME type. Using browser default. Recording might fail or have unexpected format.`);
        }
        console.log("Using MIME type:", supportedMimeType || "browser default");

        const options = supportedMimeType ? { mimeType: supportedMimeType } : {};
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                console.log(`Audio data available: ${event.data.size} bytes`);
                audioChunksRef.current.push(event.data);
            } else {
                 console.warn("Audio data available event fired with 0 size chunk.");
            }
        };

        recorder.onstop = () => {
            console.log("MediaRecorder stopped.");
            if (audioChunksRef.current.length === 0) {
                console.error("Recording stopped but no audio data was captured. Discarding.");
                discardRecording(); // Clean up if no data
                toast({ variant: 'destructive', title: 'Recording Failed', description: 'No audio data was captured. Please try again.' });
                return;
            }
            // Use the determined mimeType or the recorder's actual mimeType
            const blobMimeType = supportedMimeType || recorder.mimeType || 'audio/webm';
            try {
                const audioBlob = new Blob(audioChunksRef.current, { type: blobMimeType });
                setAudioBlob(audioBlob);
                const url = URL.createObjectURL(audioBlob);
                setAudioPreviewUrl(url);
                console.log("Audio Blob created:", blobMimeType, audioBlob.size);
            } catch (blobError) {
                console.error("Error creating Blob:", blobError);
                 toast({ variant: 'destructive', title: 'Recording Error', description: 'Could not process recorded audio.' });
                 discardRecording();
            } finally {
                // Ensure stream is stopped *after* recorder is stopped and blob is processed
                 stopStream();
            }
        };

        recorder.onerror = (event: Event & { error?: DOMException }) => {
             const error = (event as any).error || new Error('Unknown MediaRecorder error');
             console.error("MediaRecorder error:", error.name, error.message, event);
             toast({ variant: 'destructive', title: 'Recording Error', description: `An error occurred: ${error.message}` });
             stopRecording(true); // Force stop and cleanup
        };


        recorder.start();
        setIsRecording(true);
        console.log("Recording started successfully.");

        // Stop any typing indicator
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
        sendTypingUpdate(false);

    } catch (error) {
        console.error("Error setting up or starting MediaRecorder:", error);
        toast({ variant: 'destructive', title: 'Recording Start Error', description: 'Could not start recording. Check browser compatibility or permissions.' });
        stopStream(); // Ensure stream tracks are stopped on error too
        setIsRecording(false); // Reset state
    }
  };

  // Modified stopRecording to accept a 'force' flag for error scenarios
  const stopRecording = useCallback((force = false) => {
    if (mediaRecorderRef.current && (isRecording || force)) {
       console.log(`Stopping recording (Force: ${force}, State: ${mediaRecorderRef.current.state})...`);
      try {
          if (mediaRecorderRef.current.state === "recording") {
             mediaRecorderRef.current.stop(); // Triggers onstop handler
          } else if (force) {
             console.warn("Forcing stop on non-recording recorder.");
              // If forced, manually stop stream as onstop might not fire correctly
             stopStream();
          }
      } catch (error) {
          console.error("Error stopping MediaRecorder:", error);
           // Attempt to stop stream anyway if recorder fails
          stopStream();
      } finally {
          setIsRecording(false);
          // Stream stopping is now handled within onstop or explicitly above if forced stop on non-recording
      }
    } else if (!isRecording && !force) {
        console.warn("Stop recording called but not currently recording.");
    }
  }, [isRecording, stopStream]);

  const discardRecording = useCallback(() => {
    console.log("Discarding recording...");
    if (isRecording) {
        console.log("Currently recording, stopping first.");
        stopRecording(true); // Force stop if currently recording
    }
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    if (audioPreviewUrl) {
      console.log("Revoking object URL:", audioPreviewUrl);
      URL.revokeObjectURL(audioPreviewUrl); // Clean up object URL
    }
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    audioChunksRef.current = [];
    setIsPreviewPlaying(false);
    console.log("Recording discarded.");
  }, [audioPreviewUrl, isRecording, stopRecording]);

  const togglePreview = () => {
      if (!audioRef.current) {
        console.error("Audio preview element ref not available.");
        return;
      }
      if (isPreviewPlaying) {
          console.log("Pausing audio preview.");
          audioRef.current.pause();
      } else {
          console.log("Playing audio preview.");
          audioRef.current.play().catch(err => console.error("Error playing audio preview:", err));
      }
  };

  // Moved ended handler here to use useCallback
  const handleAudioEnded = useCallback(() => {
    console.log("Audio preview ended.");
    setIsPreviewPlaying(false);
    if (audioRef.current) {
        audioRef.current.currentTime = 0; // Reset to start when ended
    }
   }, []);

  useEffect(() => {
      const audioElement = audioRef.current;
      if (audioElement && audioPreviewUrl) { // Only attach if URL exists
          const handlePlay = () => setIsPreviewPlaying(true);
          const handlePause = () => setIsPreviewPlaying(false);

          // Use the memoized handleAudioEnded
          audioElement.addEventListener('play', handlePlay);
          audioElement.addEventListener('pause', handlePause);
          audioElement.addEventListener('ended', handleAudioEnded);
          console.log("Audio event listeners attached.");

          return () => {
              audioElement.removeEventListener('play', handlePlay);
              audioElement.removeEventListener('pause', handlePause);
              audioElement.removeEventListener('ended', handleAudioEnded);
              // Pause audio if unmounting while playing
              if (!audioElement.paused) {
                  audioElement.pause();
              }
              console.log("Audio event listeners removed.");
          };
      }
  }, [audioPreviewUrl, handleAudioEnded]); // Depend on URL and the stable callback


  // Clean up Object URL when component unmounts or blob changes
  useEffect(() => {
    return () => {
      // Ensure cleanup runs on unmount
       discardRecording();
    };
  }, [discardRecording]); // Depend on the memoized discard function

  // --- End Audio Recording Logic ---

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedImageUrl = imageUrl.trim();
    const trimmedVideoUrl = videoUrl.trim(); // Trim video URL

    // Prioritize audio if present, then video, then image
    const hasContent = trimmedMessage || audioBlob || trimmedVideoUrl || trimmedImageUrl;
    let mediaUrl: string | null = null;
    let mediaType: 'audio' | 'video' | 'image' | null = null;


    if (!user || !chatId || !hasContent || isSending) {
        console.warn("Send message condition not met:", { user: !!user, chatId: !!chatId, hasContent, isSending });
        return;
    }

    console.log("Sending message...");
    setIsSending(true);
    setUploadProgress(null); // Reset progress
    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
       typingTimeoutRef.current = null;
       sendTypingUpdate(false);
    }

    const { uid, displayName, photoURL } = user;

    try {
      // 1. Upload audio if present (Highest Priority)
      if (audioBlob) {
         console.log("Audio blob detected, starting upload...");
         mediaType = 'audio';
         setUploadProgress(0); // Indicate start of upload
         const timestamp = Date.now();
         // Ensure MIME type is available, default to webm if needed
          const fileExtension = (audioBlob.type.split('/')[1] || 'webm').split(';')[0] || 'webm'; // Robust extension extraction
         const audioPath = `chats/${chatId}/audio/${uid}_${timestamp}.${fileExtension}`; // Unique path with extension
         console.log(`Uploading audio to path: ${audioPath} (Type: ${audioBlob.type}, Size: ${audioBlob.size})`);

         // Use a callback for progress updates
         const updateProgress = (progress: number) => setUploadProgress(progress);

         try {
             mediaUrl = await uploadAudio(audioBlob, audioPath, updateProgress); // Pass progress callback
             setUploadProgress(100); // Ensure it reaches 100 on success
             console.log("Audio upload successful, URL:", mediaUrl);
         } catch (uploadError: any) {
             console.error("Error during audio upload:", uploadError);
             toast({
                 title: "Audio Upload Failed",
                 description: uploadError.message || "Could not upload voice note.",
                 variant: "destructive"
             });
             setIsSending(false);
             setUploadProgress(null);
             return; // Stop message sending process
         }
      } else if (trimmedVideoUrl) { // 2. Check for Video URL if no audio
          mediaType = 'video';
          mediaUrl = trimmedVideoUrl;
          console.log("Video URL provided:", mediaUrl);
          // TODO: Potentially add validation or thumbnail generation here if needed
      } else if (trimmedImageUrl) { // 3. Check for Image URL if no audio or video
          mediaType = 'image';
          mediaUrl = trimmedImageUrl;
          console.log("Image URL provided:", mediaUrl);
          // TODO: Potentially add validation here
      }


      // 4. Add message to Firestore
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      const messageData: Omit<Message, 'id' | 'timestamp'> & { timestamp: any } = {
        text: trimmedMessage || '',
        imageUrl: mediaType === 'image' ? mediaUrl : null,
        audioUrl: mediaType === 'audio' ? mediaUrl : null,
        videoUrl: mediaType === 'video' ? mediaUrl : null, // Add videoUrl
        timestamp: serverTimestamp(),
        uid,
        displayName: displayName ?? null, // Use null if undefined
        photoURL: photoURL ?? null, // Use null if undefined
        replyToMessageId: replyingTo?.id ?? null,
        replyToMessageText: replyingTo?.text ?? (replyingTo?.imageUrl ? 'Image' : (replyingTo?.audioUrl ? 'Voice note' : (replyingTo?.videoUrl ? 'Video' : null))), // Include type for media replies
        replyToMessageAuthor: replyingTo?.displayName ?? null,
      };
      console.log("Adding message to Firestore:", messageData);

      await addDoc(messagesRef, messageData);
      console.log("Message added successfully to Firestore.");
      setMessage('');
      setImageUrl('');
      setVideoUrl(''); // Clear video URL input
      setShowImageUrlInput(false);
      setShowVideoUrlInput(false); // Hide video URL input
      discardRecording(); // Clear audio state after successful send
      onClearReply(); // Clear reply context after sending
    } catch (error) {
        console.error("Error sending message (Firestore or general):", error);
        toast({
            title: "Send Error",
            description: "Could not send message. Please try again.",
            variant: "destructive"
        });
    } finally {
        console.log("Finished sending message process.");
        setIsSending(false);
        setUploadProgress(null); // Ensure progress is cleared
    }
  };

  const toggleImageUrlInput = () => {
    const nextShowState = !showImageUrlInput;
    console.log("Toggling image URL input to:", nextShowState);
    setShowImageUrlInput(nextShowState);
    setShowVideoUrlInput(false); // Ensure video input is hidden
    discardRecording(); // Discard audio
    setVideoUrl(''); // Clear video url
    if (!nextShowState) {
      setImageUrl(''); // Clear image url if hiding
    }
  };

  const toggleVideoUrlInput = () => {
      const nextShowState = !showVideoUrlInput;
      console.log("Toggling video URL input to:", nextShowState);
      setShowVideoUrlInput(nextShowState);
      setShowImageUrlInput(false); // Ensure image input is hidden
      discardRecording(); // Discard audio
      setImageUrl(''); // Clear image url
      if (!nextShowState) {
          setVideoUrl(''); // Clear video url if hiding
      }
  };

  const handleMicButtonClick = () => {
      console.log("Mic button clicked. Current state:", { isRecording, hasMicPermission, browserSupportsMedia });
      if (showImageUrlInput || showVideoUrlInput) {
        console.log("Hiding image/video input because mic was clicked.");
        setShowImageUrlInput(false);
        setShowVideoUrlInput(false);
        setImageUrl('');
        setVideoUrl('');
      }
      if (isRecording) {
          stopRecording();
      } else {
          // Check permission again just before starting, in case it changed
          checkMicPermissionStatus().then(() => {
              // Use the latest permission state after checking
              if (hasMicPermission === false) {
                  toast({ variant: 'destructive', title: 'Microphone Required', description: 'Please enable microphone permission in browser settings.'});
              } else if (browserSupportsMedia) {
                   startRecording();
              } else {
                  toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Audio recording is not supported.' });
              }
          });
      }
  }

  const canSendMessage = user && chatId && (!!message.trim() || !!imageUrl.trim() || !!videoUrl.trim() || !!audioBlob) && !isSending;
  // Update canRecord logic based on permission and browser support
  const canRecord = browserSupportsMedia && user && chatId && !isSending && !isCheckingPermission; // Check browser support and that permission check is done
  const micButtonDisabled = isCheckingPermission || !canRecord; // Disable while checking permission or if cannot record
  const micButtonDisabledReason = isCheckingPermission ? "Checking permissions..."
                                 : !browserSupportsMedia ? "Audio recording not supported"
                                 : !user ? "Login required"
                                 : !chatId ? "Select a chat"
                                 : isSending ? "Sending message..."
                                 : hasMicPermission === false ? "Microphone permission denied"
                                 : null;


  return (
    <div className="p-4 border-t bg-background space-y-2">
      {/* Reply Context Display */}
      {replyingTo && (
        <div className="flex items-center justify-between p-2 mb-2 text-sm bg-muted/50 rounded-md border-l-4 border-primary">
          <div className="flex-1 overflow-hidden mr-2">
            <p className="font-medium text-primary truncate">
              Replying to {replyingTo.displayName || 'Unknown'}
            </p>
            <p className="text-muted-foreground truncate italic">
              {replyingTo.text || (replyingTo.imageUrl ? 'Image' : (replyingTo.audioUrl ? 'Voice note' : (replyingTo.videoUrl ? 'Video' : 'Original message')))}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearReply}
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Audio Recording/Preview UI */}
      {(isRecording || audioBlob) && !showImageUrlInput && !showVideoUrlInput && (
        <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-md h-14">
          {isRecording && (
            <>
              <Mic className="h-5 w-5 text-destructive animate-pulse flex-shrink-0" />
              <span className="text-sm text-muted-foreground flex-1">Recording...</span>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => stopRecording()}
                aria-label="Stop recording"
                className="flex-shrink-0"
              >
                <Square className="h-5 w-5" />
              </Button>
            </>
          )}
          {audioBlob && audioPreviewUrl && !isRecording && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={togglePreview}
                aria-label={isPreviewPlaying ? "Pause preview" : "Play preview"}
                className="text-primary flex-shrink-0"
              >
                {isPreviewPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <audio ref={audioRef} src={audioPreviewUrl} preload="metadata" className="hidden" onEnded={handleAudioEnded} />
              <span className="text-sm text-muted-foreground flex-1">Voice note ready</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={discardRecording}
                className="text-muted-foreground hover:text-destructive flex-shrink-0"
                aria-label="Discard recording"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      )}

      <form onSubmit={sendMessage} className="flex items-center gap-2">
        {/* Image Button */}
        {!isRecording && !audioBlob && !showVideoUrlInput && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleImageUrlInput}
            disabled={!user || !chatId || isSending}
            aria-label="Toggle image URL input"
            className={cn(showImageUrlInput ? 'bg-accent text-accent-foreground' : '', "flex-shrink-0")}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
        )}

        {/* Video Button */}
        {!isRecording && !audioBlob && !showImageUrlInput && (
           <Button
               type="button"
               variant="ghost"
               size="icon"
               onClick={toggleVideoUrlInput}
               disabled={!user || !chatId || isSending}
               aria-label="Toggle video URL input"
               className={cn(showVideoUrlInput ? 'bg-accent text-accent-foreground' : '', "flex-shrink-0")}
           >
               <VideoIcon className="h-5 w-5" />
           </Button>
        )}


        {/* Text Input (Hidden during recording/preview unless image/video input is active) */}
        {(!isRecording && !audioBlob) || showImageUrlInput || showVideoUrlInput ? (
          <Input
            ref={inputRef}
            type="text"
            value={message}
            onChange={handleInputChange}
            placeholder={chatId ? (replyingTo ? "Write your reply..." : "Type a message...") : "Select a chat to start"}
            className="flex-1"
            disabled={!user || !chatId || isSending || isRecording} // Disable while recording
            aria-label="Chat message input"
          />
        ) : (
          <div className="flex-1 h-10"></div> // Placeholder to maintain layout
        )}

        {/* Microphone/Stop Button with Tooltip */}
         <TooltipProvider delayDuration={300}>
            <Tooltip>
                 <TooltipTrigger asChild>
                     {/* Wrap the button in a span for tooltip when disabled */}
                     <span tabIndex={micButtonDisabledReason ? 0 : -1}>
                         <Button
                            type="button"
                            variant={isRecording ? "destructive" : "ghost"}
                            size="icon"
                            onClick={handleMicButtonClick}
                            disabled={micButtonDisabled} // Use combined disabled state
                            aria-label={isRecording ? "Stop recording" : (micButtonDisabledReason || "Start recording")}
                            className="flex-shrink-0"
                        >
                            {isRecording
                               ? <Square className="h-5 w-5" />
                               : (hasMicPermission === false || !browserSupportsMedia
                                    ? <AlertCircle className="h-5 w-5 text-destructive" />
                                    : <Mic className="h-5 w-5" />
                                  )
                             }
                        </Button>
                     </span>
                 </TooltipTrigger>
                 {micButtonDisabledReason && (
                     <TooltipContent side="top">
                         <p>{micButtonDisabledReason}</p>
                     </TooltipContent>
                 )}
             </Tooltip>
         </TooltipProvider>


        {/* Send Button */}
        <Button
          type="submit"
          size="icon"
          disabled={!canSendMessage}
          aria-label="Send message"
          className="flex-shrink-0"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>

      {/* Image URL Input (conditionally shown) */}
      {showImageUrlInput && (
        <div className="flex items-center gap-2 pl-12 pr-12"> {/* Adjust padding to align roughly */}
          <Input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Enter image URL..."
            className="flex-1 h-9 text-sm"
            disabled={!user || !chatId || isSending || isRecording}
            aria-label="Image URL input"
          />
        </div>
      )}

      {/* Video URL Input (conditionally shown) */}
       {showVideoUrlInput && (
         <div className="flex items-center gap-2 pl-12 pr-12"> {/* Adjust padding */}
           <Input
             type="url"
             value={videoUrl}
             onChange={(e) => setVideoUrl(e.target.value)}
             placeholder="Enter video URL (e.g., YouTube, Vimeo)..."
             className="flex-1 h-9 text-sm"
             disabled={!user || !chatId || isSending || isRecording}
             aria-label="Video URL input"
           />
         </div>
       )}

      {/* Upload Progress Bar */}
      {uploadProgress !== null && (
        <div className="pt-1 px-12">
          <Progress value={uploadProgress} className="h-1 w-full" />
          {uploadProgress < 100 && <p className="text-xs text-muted-foreground text-center mt-1">Uploading voice note...</p>}
        </div>
      )}
    </div>
  );
}

