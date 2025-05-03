
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Image as ImageIcon, X, Mic, Square, Trash2, Play, Pause, AlertCircle } from 'lucide-react'; // Added Mic, Square, Trash2, Play, Pause, AlertCircle
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
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
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

  // Check browser support on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setBrowserSupportsMedia(false);
      setHasMicPermission(false);
      console.warn("Browser does not support MediaDevices API needed for audio recording.");
    } else {
        checkMicPermissionStatus(); // Check permission status on load
    }
     // Cleanup function
     return () => {
      stopStream(); // Ensure stream is stopped on unmount
    };
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
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      console.log("Audio stream stopped.");
    }
  }, []);


  // Function to check permission status without prompting
  const checkMicPermissionStatus = async () => {
    if (!browserSupportsMedia) return;
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setHasMicPermission(permissionStatus.state === 'granted');
       permissionStatus.onchange = () => {
          setHasMicPermission(permissionStatus.state === 'granted');
          if (permissionStatus.state !== 'granted' && isRecording) {
              stopRecording(true); // Force stop if permission revoked during recording
              toast({ variant: 'destructive', title: 'Permission Changed', description: 'Microphone access was revoked.' });
          }
      };
    } catch (error) {
       setHasMicPermission(null); // Indicate unknown status if query fails
       console.warn("Microphone permission query failed, will ask on first use.", error);
    }
  };


  // Request microphone permission and get stream
  const getMicStream = async (): Promise<MediaStream | null> => {
      if (!browserSupportsMedia) {
         toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Audio recording is not supported by your browser.' });
         return null;
      }
      if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Required', description: 'Please enable microphone permission in browser settings.'});
        return null;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicPermission(true); // Update state if permission was granted via prompt
        streamRef.current = stream; // Store the stream
        console.log("Microphone access granted, stream obtained.");
        return stream;
      } catch (error: any) {
        console.error('Error accessing microphone:', error);
        setHasMicPermission(false); // Explicitly set to false on error/denial
        toast({
          variant: 'destructive',
          title: error.name === 'NotAllowedError' ? 'Permission Denied' : 'Microphone Error',
          description: error.name === 'NotAllowedError' ? 'Microphone access denied. Please allow in browser settings.' : `Could not access microphone: ${error.message}`,
        });
        stopStream(); // Ensure any partial stream is stopped
        return null;
      }
  };


  const startRecording = async () => {
    discardRecording(); // Clear any previous recording/preview first
    stopStream(); // Ensure any existing stream is stopped

    const stream = await getMicStream();
    if (!stream) return; // Permission denied or error getting stream


    try {
        // Determine supported MIME type
        let mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/ogg; codecs=opus'; // Try ogg
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                 mimeType = 'audio/mp4'; // Try mp4 (less common for mic recording)
                 if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = ''; // Fallback, might record in browser default (often webm anyway)
                    console.warn("Could not find preferred MIME type (webm, ogg, mp4). Using browser default.");
                 }
            }
        }
        console.log("Using MIME type:", mimeType || "browser default");

        const options = mimeType ? { mimeType } : {};
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        recorder.onstop = () => {
            if (audioChunksRef.current.length === 0) {
                console.warn("Recording stopped with no data chunks.");
                discardRecording(); // Clean up if no data
                return;
            }
            // Use the determined mimeType or default if none was set
            const blobMimeType = mimeType || recorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunksRef.current, { type: blobMimeType });
            setAudioBlob(audioBlob);
            const url = URL.createObjectURL(audioBlob);
            setAudioPreviewUrl(url);
            console.log("Recording stopped, Blob created:", blobMimeType, audioBlob.size);
            // Stream tracks are stopped via streamRef cleanup or explicitly in stopRecording
        };

        recorder.onerror = (event: Event) => {
             console.error("MediaRecorder error:", event);
             toast({ variant: 'destructive', title: 'Recording Error', description: 'An error occurred during recording.' });
             stopRecording(true); // Force stop and cleanup
        };


        recorder.start();
        setIsRecording(true);
        console.log("Recording started...");

        // Stop any typing indicator
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
        sendTypingUpdate(false);

    } catch (error) {
        console.error("Error creating MediaRecorder:", error);
        toast({ variant: 'destructive', title: 'Recording Error', description: 'Could not start recording. Check browser compatibility or permissions.' });
        stopStream(); // Ensure stream tracks are stopped on error too
        setIsRecording(false); // Reset state
    }
  };

  // Modified stopRecording to accept a 'force' flag for error scenarios
  const stopRecording = useCallback((force = false) => {
    if (mediaRecorderRef.current && (isRecording || force)) {
      try {
          if (mediaRecorderRef.current.state === "recording") {
             mediaRecorderRef.current.stop(); // Triggers onstop handler
             console.log("MediaRecorder stopped.");
          }
      } catch (error) {
          console.error("Error stopping MediaRecorder:", error);
      }
      setIsRecording(false);
      stopStream(); // Stop the stream tracks now that recording is done
      mediaRecorderRef.current = null;
    } else if (!isRecording && !force) {
        console.warn("Stop recording called but not currently recording.");
    }
  }, [isRecording, stopStream]);

  const discardRecording = useCallback(() => {
    if (isRecording) {
        stopRecording(true); // Force stop if currently recording
    }
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl); // Clean up object URL
    }
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    audioChunksRef.current = [];
    setIsPreviewPlaying(false);
    console.log("Recording discarded.");
  }, [audioPreviewUrl, isRecording, stopRecording]);

  const togglePreview = () => {
      if (!audioRef.current) return;
      if (isPreviewPlaying) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0; // Reset to start on pause
      } else {
          audioRef.current.play().catch(err => console.error("Error playing audio preview:", err));
      }
  };

  const handleAudioEnded = () => {
    setIsPreviewPlaying(false);
   };

  useEffect(() => {
      const audioElement = audioRef.current;
      if (audioElement) {
          const handlePlay = () => setIsPreviewPlaying(true);
          const handlePause = () => setIsPreviewPlaying(false);

          audioElement.addEventListener('play', handlePlay);
          audioElement.addEventListener('pause', handlePause);
          audioElement.addEventListener('ended', handleAudioEnded);

          return () => {
              audioElement.removeEventListener('play', handlePlay);
              audioElement.removeEventListener('pause', handlePause);
              audioElement.removeEventListener('ended', handleAudioEnded);
              // Pause audio if unmounting while playing
              if (!audioElement.paused) {
                  audioElement.pause();
              }
          };
      }
  }, [audioPreviewUrl]); // Re-attach listeners if URL changes


  // Clean up Object URL when component unmounts or blob changes
  useEffect(() => {
    return () => {
      discardRecording(); // Use discardRecording for comprehensive cleanup
    };
  }, [discardRecording]); // Depend on the memoized discard function

  // --- End Audio Recording Logic ---

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedImageUrl = imageUrl.trim();
    // Prioritize audio if present
    const hasContent = trimmedMessage || trimmedImageUrl || audioBlob;

    if (!user || !chatId || !hasContent || isSending) return;

    setIsSending(true);
    setUploadProgress(null); // Reset progress
    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
       typingTimeoutRef.current = null;
       sendTypingUpdate(false);
    }

    const { uid, displayName, photoURL } = user;
    let finalAudioUrl: string | null = null;

    try {
      // 1. Upload audio if present
      if (audioBlob) {
         setUploadProgress(0); // Indicate start of upload
         const timestamp = Date.now();
         // Ensure MIME type is available, default to webm if needed
         const fileExtension = (audioBlob.type.split('/')[1] || 'webm').split(';')[0]; // Get extension like 'webm' or 'ogg'
         const audioPath = `chats/${chatId}/audio/${uid}_${timestamp}.${fileExtension}`; // Unique path with extension

         // Use a callback for progress updates if uploadAudio supports it
         // For now, simulate progress
         const updateProgress = (progress: number) => setUploadProgress(progress);

         try {
             finalAudioUrl = await uploadAudio(audioBlob, audioPath, updateProgress); // Pass progress callback
             setUploadProgress(100); // Ensure it reaches 100 on success
         } catch (uploadError: any) {
             console.error("Error uploading audio:", uploadError);
             toast({
                 title: "Audio Upload Failed",
                 description: uploadError.message || "Could not upload voice note.",
                 variant: "destructive"
             });
             setIsSending(false);
             setUploadProgress(null);
             return; // Stop message sending process
         }
      }

      // 2. Add message to Firestore
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      // Ensure we don't save both imageUrl and audioUrl (prefer audio if present)
      const messageData: Omit<Message, 'id' | 'timestamp'> & { timestamp: any } = {
        text: trimmedMessage || '',
        imageUrl: finalAudioUrl ? null : (trimmedImageUrl || null), // Image only if no audio
        audioUrl: finalAudioUrl, // Save the uploaded audio URL
        timestamp: serverTimestamp(),
        uid,
        displayName,
        photoURL,
        replyToMessageId: replyingTo?.id ?? null,
        replyToMessageText: replyingTo?.text ?? (replyingTo?.imageUrl ? 'Image' : (replyingTo?.audioUrl ? 'Voice note' : null)), // Include type for media replies
        replyToMessageAuthor: replyingTo?.displayName ?? null,
      };

      await addDoc(messagesRef, messageData);
      setMessage('');
      setImageUrl('');
      setShowImageUrlInput(false);
      discardRecording(); // Clear audio state after successful send
      onClearReply(); // Clear reply context after sending
    } catch (error) {
        console.error("Error sending message:", error);
        toast({
            title: "Send Error",
            description: "Could not send message. Please try again.",
            variant: "destructive"
        });
    } finally {
        setIsSending(false);
        setUploadProgress(null); // Ensure progress is cleared
    }
  };

  const toggleImageUrlInput = () => {
    setShowImageUrlInput(!showImageUrlInput);
    if (showImageUrlInput) {
      setImageUrl('');
    }
    discardRecording(); // Discard audio if user switches to image URL input
  };

  const handleMicButtonClick = () => {
      if (showImageUrlInput) setShowImageUrlInput(false); // Hide image input if mic is clicked
      if (isRecording) {
          stopRecording();
      } else {
          startRecording();
      }
  }

  const canSendMessage = user && chatId && (!!message.trim() || !!imageUrl.trim() || !!audioBlob) && !isSending;
  // Update canRecord logic based on permission and browser support
  const canRecord = browserSupportsMedia && user && chatId && !isSending && hasMicPermission !== false;
  const micButtonDisabledReason = !browserSupportsMedia ? "Audio recording not supported"
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
              {replyingTo.text || (replyingTo.imageUrl ? 'Image' : (replyingTo.audioUrl ? 'Voice note' : 'Original message'))}
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
      {(isRecording || audioBlob) && !showImageUrlInput && (
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
        {!isRecording && !audioBlob && (
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

        {/* Text Input (Hidden during recording/preview unless showImageUrlInput is true) */}
        {(!isRecording && !audioBlob) || showImageUrlInput ? (
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
                            disabled={!canRecord}
                            aria-label={isRecording ? "Stop recording" : (micButtonDisabledReason || "Start recording")}
                            className="flex-shrink-0"
                        >
                            {isRecording ? <Square className="h-5 w-5" /> : (hasMicPermission === false || !browserSupportsMedia ? <AlertCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />)}
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
