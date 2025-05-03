
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Image as ImageIcon, X, Mic, Square, Trash2, Play, Pause } from 'lucide-react'; // Added Mic, Square, Trash2, Play, Pause
import { useAuth } from '@/hooks/use-auth';
import { updateTypingStatus } from '@/lib/chat.service';
import { uploadAudio } from '@/lib/storage.service'; // Import the audio upload service
import { useToast } from "@/hooks/use-toast";
import type { Message } from '@/types'; // Import Message type
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress'; // Import Progress for upload indication

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
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null); // Ref for audio preview player
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);


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
  const requestMicPermission = async (): Promise<MediaStream | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicPermission(true);
        return stream;
      } catch (error) {
        console.error('Error accessing microphone:', error);
        setHasMicPermission(false);
        toast({
          variant: 'destructive',
          title: 'Microphone Access Denied',
          description: 'Please enable microphone permissions in your browser settings to record audio.',
        });
        return null;
      }
  };

  // Check permission on component mount or when user changes
  useEffect(() => {
    const checkPermission = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setHasMicPermission(false);
            console.warn("getUserMedia not supported in this browser.");
            return;
        }
        // Check current permission status without prompting (if supported)
        try {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            setHasMicPermission(permissionStatus.state === 'granted');
             permissionStatus.onchange = () => {
                setHasMicPermission(permissionStatus.state === 'granted');
            };
        } catch (error) {
             // If query fails, assume we need to ask later
             setHasMicPermission(null); // Indicate unknown status
             console.warn("Microphone permission query failed, will ask on first use.");
        }
    };
     checkPermission();
  }, []);


  const startRecording = async () => {
    let stream = null;
    if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Required', description: 'Microphone permission is denied.'});
        return;
    }
    if (hasMicPermission === null || hasMicPermission === undefined) {
         stream = await requestMicPermission();
         if (!stream) return; // Permission denied or error
    } else {
         // Already have permission, get the stream directly
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
             console.error("Error getting audio stream even with permission:", error);
            toast({ variant: 'destructive', title: 'Audio Error', description: 'Could not start audio stream.'});
            return;
        }
    }


    if (!stream) {
      // Fallback check, should not happen if logic above is correct
       console.error("No audio stream available to start recording.");
       return;
    }


    try {
        const options = { mimeType: 'audio/webm' }; // Specify webm format
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        recorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
            setAudioBlob(audioBlob);
            const url = URL.createObjectURL(audioBlob);
            setAudioPreviewUrl(url);
             // Stop the tracks to release the microphone
             stream?.getTracks().forEach(track => track.stop());
        };

        recorder.start();
        setIsRecording(true);
        setAudioBlob(null); // Clear previous recording
        setAudioPreviewUrl(null);
        // Stop any typing indicator
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
        sendTypingUpdate(false);

    } catch (error) {
        console.error("Error creating MediaRecorder:", error);
        toast({ variant: 'destructive', title: 'Recording Error', description: 'Could not start recording. Check browser compatibility.' });
         // Ensure stream tracks are stopped on error too
         stream?.getTracks().forEach(track => track.stop());
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    audioChunksRef.current = [];
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl); // Clean up object URL
    }
    setIsPreviewPlaying(false);
  };

  const togglePreview = () => {
      if (!audioRef.current) return;
      if (isPreviewPlaying) {
          audioRef.current.pause();
      } else {
          audioRef.current.play();
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
          };
      }
  }, [audioPreviewUrl]);


  // Clean up Object URL when component unmounts or blob changes
  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
    };
  }, [audioPreviewUrl]);
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
         const audioPath = `chats/${chatId}/audio/${uid}_${timestamp}.webm`; // Unique path
         try {
             finalAudioUrl = await uploadAudio(audioBlob, audioPath);
              // Simulate progress for now, replace with actual progress tracking if available
              await new Promise(resolve => setTimeout(resolve, 500)); // Simulate upload time
              setUploadProgress(100);
         } catch (uploadError) {
             console.error("Error uploading audio:", uploadError);
             toast({
                 title: "Audio Upload Failed",
                 description: "Could not upload voice note. Please try again.",
                 variant: "destructive"
             });
             setIsSending(false);
             setUploadProgress(null);
             return; // Stop message sending process
         }
      }

      // 2. Add message to Firestore
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      const messageData: Omit<Message, 'id' | 'timestamp'> & { timestamp: any } = {
        text: trimmedMessage || '',
        imageUrl: !finalAudioUrl ? (trimmedImageUrl || null) : null, // Don't save image if audio is present
        audioUrl: finalAudioUrl, // Save the uploaded audio URL
        timestamp: serverTimestamp(),
        uid,
        displayName,
        photoURL,
        // Include reply information if replyingTo is set
        replyToMessageId: replyingTo?.id ?? null,
        replyToMessageText: replyingTo?.text ?? null,
        replyToMessageAuthor: replyingTo?.displayName ?? null,
      };

      await addDoc(messagesRef, messageData);
      setMessage('');
      setImageUrl('');
      setShowImageUrlInput(false);
      discardRecording(); // Clear audio state
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
    discardRecording(); // Discard audio if user switches to image URL
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
  const canRecord = user && chatId && !isSending && hasMicPermission !== false;

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
                        <Mic className="h-5 w-5 text-destructive animate-pulse" />
                        <span className="text-sm text-muted-foreground flex-1">Recording...</span>
                         <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={stopRecording}
                            aria-label="Stop recording"
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
                           className="text-primary"
                         >
                            {isPreviewPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                         </Button>
                         <audio ref={audioRef} src={audioPreviewUrl} preload="metadata" className="hidden" onEnded={handleAudioEnded}/>
                         <span className="text-sm text-muted-foreground flex-1">Voice note ready</span>
                         <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={discardRecording}
                            className="text-muted-foreground hover:text-destructive"
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

         {/* Microphone/Stop Button */}
         {!showImageUrlInput && (
             <Button
                type="button"
                variant={isRecording ? "destructive" : "ghost"}
                size="icon"
                onClick={handleMicButtonClick}
                disabled={!canRecord}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
                className="flex-shrink-0"
            >
                {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
         )}

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
         </div>
      )}
    </div>
  );
}
