

"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, storage } from '@/lib/firebase'; // Import storage
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Image as ImageIcon, X, Mic, Square, Trash2, Play, Pause, AlertCircle, Video as VideoIcon, Paperclip, FileText, Link as LinkIcon, Smile } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { updateTypingStatus } from '@/lib/chat.service';
import { uploadAudio, uploadGenericFile } from '@/lib/storage.service'; // Keep existing service for upload
import { useToast } from "@/hooks/use-toast";
import type { Message } from '@/types';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import EmojiPicker, { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "next-themes";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"; // Import specific storage functions if needed for direct use

interface ChatInputProps {
  chatId: string | null;
  replyingTo: Message | null;
  onClearReply: () => void;
}

export function ChatInput({ chatId, replyingTo, onClearReply }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [showVideoUrlInput, setShowVideoUrlInput] = useState(false);
  const [showFileUrlInput, setShowFileUrlInput] = useState(false);
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  // --- New Audio Recording State ---
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null); // Keep stream ref for cleanup
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null); // null = unknown, true = granted, false = denied/unavailable
  const [browserSupportsMedia, setBrowserSupportsMedia] = useState(true);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  const audioBlobToUploadRef = useRef<Blob | null>(null); // Ref to hold blob after recording stops
  // --- End New Audio Recording State ---

   // Check browser support and initial permission status on mount
   useEffect(() => {
    // Check for browser support
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        console.warn("Browser does not support MediaDevices API or MediaRecorder needed for audio recording.");
        setBrowserSupportsMedia(false);
        setHasMicPermission(false);
        setIsCheckingPermission(false);
        return; // Exit early if not supported
    }

    // Check permission status if supported
    checkMicPermissionStatus().finally(() => setIsCheckingPermission(false));

    // Cleanup function
    return () => {
        stopStream(); // Ensure stream is stopped on unmount
        if (mediaRecorder?.state === 'recording') {
           try { mediaRecorder.stop(); } catch (e) {}
        }
        setMediaRecorder(null);
        setAudioChunks([]);
        audioBlobToUploadRef.current = null;
    };
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []); // Empty dependency array ensures this runs only once on mount


  // Focus input when reply context appears
  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  // --- Typing Indicator Logic ---
  const sendTypingUpdate = useCallback(async (isTyping: boolean) => {
    if (!chatId || !user?.uid || recording || attachedFile || audioBlobToUploadRef.current) return; // Don't send typing update while recording/attaching/previewing
    try {
        await updateTypingStatus(chatId, user.uid, isTyping);
    } catch (error) {
        console.error("Error sending typing update:", error);
    }
   }, [chatId, user?.uid, recording, attachedFile]);


  useEffect(() => {
     return () => {
       if (typingTimeoutRef.current) {
         clearTimeout(typingTimeoutRef.current);
       }
        // Check if still mounted before sending final update
       if (chatId && user?.uid && !recording && !attachedFile && !audioBlobToUploadRef.current) {
           sendTypingUpdate(false);
       }
     };
  }, [chatId, user?.uid, sendTypingUpdate, recording, attachedFile]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    if (!chatId || !user?.uid || recording || attachedFile || audioBlobToUploadRef.current) return; // Don't trigger typing updates

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

  // --- Emoji Picker Logic ---
  const onEmojiClick = (emojiData: EmojiClickData) => {
    console.log("Emoji clicked:", emojiData);
    setMessage(prevMessage => prevMessage + emojiData.emoji);
    setIsEmojiPickerOpen(false); // Close picker after selection
    inputRef.current?.focus(); // Focus back on input
  };
  // --- End Emoji Picker Logic ---

  // --- New Audio Recording Logic ---

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      console.log("Audio stream stopped and released.");
    }
  }, []);

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
          if (permissionStatus.state !== 'granted' && recording) {
              stopRecording(); // Force stop if permission revoked during recording
              toast({ variant: 'destructive', title: 'Permission Changed', description: 'Microphone access was revoked.' });
          }
      };
    } catch (error) {
       setHasMicPermission(null); // Indicate unknown status if query fails
       console.warn("Microphone permission query failed, will ask on first use.", error);
    } finally {
        setIsCheckingPermission(false);
    }
  }, [browserSupportsMedia, recording, toast]); // Added recording and toast

  // Request microphone permission and get stream
  const getMicStream = async (): Promise<MediaStream | null> => {
      console.log("Attempting to get microphone stream...");
      if (!browserSupportsMedia) {
         toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Audio recording is not supported by your browser.' });
         return null;
      }

      try {
        stopStream(); // Ensure previous stream is stopped
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicPermission(true); // Update state, permission granted
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
    // Clear other inputs
    discardAttachedFile();
    setMessage(''); setImageUrl(''); setVideoUrl(''); setFileUrl('');
    setShowImageUrlInput(false); setShowVideoUrlInput(false); setShowFileUrlInput(false);
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
        sendTypingUpdate(false);
    }

    const stream = await getMicStream();
    if (!stream) {
        console.error("Failed to get microphone stream. Cannot start recording.");
        setRecording(false);
        return;
    }

    try {
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
      let supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      console.log("Using MIME type:", supportedMimeType || "browser default");

      const recorder = new MediaRecorder(stream, supportedMimeType ? { mimeType: supportedMimeType } : {});
      setMediaRecorder(recorder);
      setAudioChunks([]); // Reset chunks for new recording
      audioBlobToUploadRef.current = null; // Clear previous blob

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          // console.log(`Audio data available: ${e.data.size} bytes`);
          setAudioChunks((prev) => [...prev, e.data]);
        } else {
           console.warn("Audio data available event fired with 0 size chunk.");
        }
      };

      // Modify onstop to prepare blob for upload
       recorder.onstop = () => {
           console.log("MediaRecorder stopped.");
           stopStream(); // Stop the stream *after* recorder finishes

           if (audioChunks.length === 0) {
               console.error("Recording stopped but no audio data was captured. Discarding.");
               discardRecording(); // Clean up if no data
               toast({ variant: 'destructive', title: 'Recording Failed', description: 'No audio data was captured.' });
               return;
           }

           const blobMimeType = supportedMimeType || recorder.mimeType || 'audio/webm';
           try {
                const audioBlob = new Blob(audioChunks, { type: blobMimeType });
                console.log("Audio Blob created:", blobMimeType, audioBlob.size);
                if (audioBlob.size > 0) {
                     audioBlobToUploadRef.current = audioBlob; // Store blob in ref for sending
                     // Trigger send message automatically after stopping (or add a preview step if needed)
                     // For now, let's just set the ref, send will check it.
                     // Consider adding a visual indicator that audio is ready to send
                     setMessage("Voice note recorded"); // Set placeholder text
                } else {
                     console.error("Combined audio blob size is 0. Discarding.");
                     discardRecording();
                     toast({ variant: 'destructive', title: 'Recording Failed', description: 'Captured audio was empty.' });
                }
           } catch (blobError) {
               console.error("Error creating Blob:", blobError);
               toast({ variant: 'destructive', title: 'Recording Error', description: 'Could not process recorded audio.' });
               discardRecording();
           } finally {
                setAudioChunks([]); // Clear chunks after processing
           }
       };


      recorder.onerror = (event: Event & { error?: DOMException }) => {
           const error = (event as any).error || new Error('Unknown MediaRecorder error');
           console.error("MediaRecorder error:", error.name, error.message, event);
           toast({ variant: 'destructive', title: 'Recording Error', description: `An error occurred: ${error.message}` });
           discardRecording(); // Use discard which handles stopping
      };

      recorder.start();
      setRecording(true);
      console.log("Recording started successfully.");

    } catch (error) {
      console.error("Error setting up or starting MediaRecorder:", error);
      toast({ variant: 'destructive', title: 'Recording Start Error', description: 'Could not start recording.' });
      stopStream();
      setRecording(false);
    }
  };

  const stopRecording = useCallback(() => {
      if (mediaRecorder?.state === "recording") {
          console.log(`Stopping recording...`);
          try {
              mediaRecorder.stop(); // Triggers onstop handler
          } catch (error) {
              console.error("Error stopping MediaRecorder:", error);
              stopStream(); // Attempt to stop stream anyway
          } finally {
              setRecording(false);
          }
      } else if (!recording) {
          console.warn("Stop recording called but not currently recording.");
      }
  }, [mediaRecorder, recording, stopStream]);

  const discardRecording = useCallback(() => {
    console.log("Discarding recording...");
    if (recording) {
        console.log("Currently recording, stopping first.");
        stopRecording(); // Calls the stopRecording function
    }
    setAudioChunks([]);
    audioBlobToUploadRef.current = null; // Clear the ref
    setMessage(''); // Clear placeholder text if set
    console.log("Recording discarded.");
  }, [recording, stopRecording]);

  // Clean up Object URL when component unmounts or blob changes
  useEffect(() => {
    return () => {
      discardRecording(); // Ensure cleanup runs on unmount
    };
  }, [discardRecording]);

  // --- End New Audio Recording Logic ---

  // --- File Attachment Logic ---
  const handleFileAttachClick = () => {
      discardRecording(); // Clear audio recording state
      setShowImageUrlInput(false);
      setShowVideoUrlInput(false);
      setShowFileUrlInput(false);
      setMessage(''); setImageUrl(''); setVideoUrl(''); setFileUrl('');
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          console.log("File selected:", file.name, file.size, file.type);
          if (file.size > 10 * 1024 * 1024) { // Example limit: 10MB
               toast({ variant: 'destructive', title: 'File Too Large', description: 'Please select a file smaller than 10MB.' });
               setAttachedFile(null);
          } else {
              setAttachedFile(file);
              setMessage(''); setImageUrl(''); setVideoUrl(''); setFileUrl('');
              discardRecording();
          }
      }
       if (e.target) { e.target.value = ''; }
  };

   const discardAttachedFile = () => {
       setAttachedFile(null);
       setUploadProgress(null);
       setUploadStatusText('');
       console.log("Attached file discarded.");
   };
   // --- End File Attachment Logic ---


   // --- URL Input Toggles ---
   const toggleInputType = (type: 'image' | 'video' | 'file' | 'none') => {
        setMessage(''); setImageUrl(''); setVideoUrl(''); setFileUrl('');
        discardRecording();
        discardAttachedFile();
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
            sendTypingUpdate(false);
        }
        setShowImageUrlInput(type === 'image');
        setShowVideoUrlInput(type === 'video');
        setShowFileUrlInput(type === 'file');
        if (type !== 'none') {
            setTimeout(() => { inputRef.current?.focus(); }, 0);
        }
   };
   // --- End URL Input Toggles ---

  // Combined Send Message Logic
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedImageUrl = imageUrl.trim();
    const trimmedVideoUrl = videoUrl.trim();
    const trimmedFileUrl = fileUrl.trim();
    const audioBlob = audioBlobToUploadRef.current; // Get blob from ref

    const hasContent = !!attachedFile || !!audioBlob || !!trimmedFileUrl || !!trimmedVideoUrl || !!trimmedImageUrl || !!trimmedMessage;

    if (!user || !chatId || !hasContent || isSending) {
        console.warn("Send message condition not met:", { user: !!user, chatId: !!chatId, hasContent, isSending });
        return;
    }

    console.log("Sending message...");
    setIsSending(true);
    setUploadProgress(null);
    setUploadStatusText('');
    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
       typingTimeoutRef.current = null;
       sendTypingUpdate(false);
    }

    const { uid, displayName, photoURL } = user;
    let mediaUrl: string | null = null;
    let mediaType: 'file' | 'audio' | 'video' | 'image' | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;
    let fileSize: number | null = null;

    try {
        // --- Upload Logic (Prioritized: attachedFile > audioBlob > URLs) ---
        if (attachedFile) {
            mediaType = 'file';
            fileName = attachedFile.name;
            fileType = attachedFile.type || 'application/octet-stream';
            fileSize = attachedFile.size;
            console.log(`File attached: ${fileName}, starting upload...`);
            setUploadProgress(0);
            setUploadStatusText(`Uploading ${fileName}...`);
            const timestamp = Date.now();
            const filePath = `chats/${chatId}/files/${uid}_${timestamp}_${fileName}`;
            mediaUrl = await uploadGenericFile(attachedFile, filePath, setUploadProgress);
            setUploadStatusText(`Uploaded ${fileName}`);
            console.log("File upload successful, URL:", mediaUrl);
        } else if (audioBlob) {
            mediaType = 'audio';
            fileSize = audioBlob.size;
            console.log("Audio blob detected, starting upload...");
            setUploadProgress(0);
            setUploadStatusText('Uploading voice note...');
            const timestamp = Date.now();
            const fileExtension = (audioBlob.type.split('/')[1] || 'webm').split(';')[0] || 'webm';
            const audioPath = `chats/${chatId}/audio/${uid}_${timestamp}.${fileExtension}`;
            // Use the existing uploadAudio service which handles progress
            mediaUrl = await uploadAudio(audioBlob, audioPath, setUploadProgress); // Pass setUploadProgress callback
            setUploadStatusText('Uploaded voice note');
            console.log("Audio upload successful, URL:", mediaUrl);
            audioBlobToUploadRef.current = null; // Clear ref after successful upload
        } else if (trimmedFileUrl) {
            mediaType = 'file';
            mediaUrl = trimmedFileUrl;
            try {
                const url = new URL(trimmedFileUrl);
                fileName = decodeURIComponent(url.pathname.split('/').pop() || `file_${Date.now()}`);
            } catch { fileName = `file_${Date.now()}`; }
            console.log("File URL provided:", mediaUrl, "Extracted filename:", fileName);
        } else if (trimmedVideoUrl) {
            mediaType = 'video';
            mediaUrl = trimmedVideoUrl;
            console.log("Video URL provided:", mediaUrl);
        } else if (trimmedImageUrl) {
            mediaType = 'image';
            mediaUrl = trimmedImageUrl;
            console.log("Image URL provided:", mediaUrl);
        }
        // --- End Upload Logic ---

        // --- Save Message to Firestore ---
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const messageData: Omit<Message, 'id' | 'timestamp'> & { timestamp: any } = {
            text: (mediaType === 'audio') ? '' : trimmedMessage, // Clear text if it was just placeholder for audio
            imageUrl: mediaType === 'image' ? mediaUrl : null,
            audioUrl: mediaType === 'audio' ? mediaUrl : null,
            videoUrl: mediaType === 'video' ? mediaUrl : null,
            fileUrl: mediaType === 'file' ? mediaUrl : null,
            fileName: mediaType === 'file' ? fileName : null,
            fileType: mediaType === 'file' ? fileType : null,
            fileSize: fileSize,
            timestamp: serverTimestamp(),
            uid,
            displayName: displayName ?? null,
            photoURL: photoURL ?? null,
            replyToMessageId: replyingTo?.id ?? null,
            replyToMessageText: replyingTo?.text ?? (replyingTo?.imageUrl ? 'Image' : (replyingTo?.audioUrl ? 'Voice note' : (replyingTo?.videoUrl ? 'Video' : (replyingTo?.fileUrl ? 'File' : null)))),
            replyToMessageAuthor: replyingTo?.displayName ?? null,
        };

        await addDoc(messagesRef, messageData);
        console.log("Message added successfully to Firestore.");

        // --- Clear Inputs ---
        setMessage(''); setImageUrl(''); setVideoUrl(''); setFileUrl('');
        setShowImageUrlInput(false); setShowVideoUrlInput(false); setShowFileUrlInput(false);
        discardRecording(); // This now also clears audioBlobToUploadRef
        discardAttachedFile();
        onClearReply();

    } catch (error) {
        console.error("Error sending message (Upload or Firestore):", error);
        toast({ title: "Send Error", description: "Could not send message. Please try again.", variant: "destructive" });
        // Don't discard blobs/files on error so user can retry
    } finally {
        console.log("Finished sending message process.");
        setIsSending(false);
        // Delay clearing progress bar
        if (uploadProgress === 100) {
           setTimeout(() => {
              setUploadProgress(null);
              setUploadStatusText('');
           }, 1500);
        } else {
            setUploadProgress(null);
            setUploadStatusText('');
        }
    }
  };


  const handleMicButtonClick = () => {
      console.log("Mic button clicked. Current state:", { recording, hasMicPermission, browserSupportsMedia });
      if (recording) {
          stopRecording();
      } else {
          checkMicPermissionStatus().then(() => {
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

  // Determine if send button should be enabled
  const canSendMessage = user && chatId && !isSending && (
      !!message.trim() ||
      !!imageUrl.trim() ||
      !!videoUrl.trim() ||
      !!fileUrl.trim() ||
      !!audioBlobToUploadRef.current || // Check ref for ready audio blob
      !!attachedFile
  );

  const canRecord = browserSupportsMedia && user && chatId && !isSending && !isCheckingPermission && !attachedFile && !showFileUrlInput && !showImageUrlInput && !showVideoUrlInput;
  const micButtonDisabled = isCheckingPermission || !canRecord;
  const micButtonDisabledReason = isCheckingPermission ? "Checking permissions..."
                                 : !browserSupportsMedia ? "Audio recording not supported"
                                 : (attachedFile || showFileUrlInput || showImageUrlInput || showVideoUrlInput) ? "Cannot record while other input is active"
                                 : !user ? "Login required"
                                 : !chatId ? "Select a chat"
                                 : isSending ? "Sending message..."
                                 : hasMicPermission === false ? "Microphone permission denied"
                                 : null;


  return (
    // Adjusted padding for responsiveness
    <div className="p-3 sm:p-4 border-t bg-background space-y-2">
      {/* Reply Context Display */}
      {replyingTo && (
        <div className="flex items-center justify-between p-2 mb-2 text-sm bg-muted/50 rounded-md border-l-4 border-primary">
          <div className="flex-1 overflow-hidden mr-2">
            <p className="font-medium text-primary truncate">
              Replying to {replyingTo.displayName || 'Unknown'}
            </p>
            <p className="text-muted-foreground truncate italic">
              {replyingTo.text || (replyingTo.imageUrl ? 'Image' : (replyingTo.audioUrl ? 'Voice note' : (replyingTo.videoUrl ? 'Video' : (replyingTo.fileUrl ? 'File' : 'Original message'))))}
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

      {/* File Attachment Preview UI */}
      {attachedFile && !recording && (
          <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-md h-14">
              <FileText className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="text-sm text-muted-foreground flex-1 truncate">{attachedFile.name}</span>
              <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={discardAttachedFile}
                  className="text-muted-foreground hover:text-destructive flex-shrink-0"
                  aria-label="Discard file"
                  disabled={isSending}
              >
                  <Trash2 className="h-5 w-5" />
              </Button>
          </div>
      )}

       {/* Audio Recording/Ready UI */}
       {(recording || audioBlobToUploadRef.current) && !showImageUrlInput && !showVideoUrlInput && !attachedFile && !showFileUrlInput && (
         <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-md h-14">
           {recording && (
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
           {audioBlobToUploadRef.current && !recording && (
             <>
                <Play className="h-5 w-5 text-primary flex-shrink-0" /> {/* Just show play icon as indicator */}
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

       {/* URL Input Field */}
       {(showImageUrlInput || showVideoUrlInput || showFileUrlInput) && !recording && !audioBlobToUploadRef.current && !attachedFile && (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              type="url"
              value={showImageUrlInput ? imageUrl : (showVideoUrlInput ? videoUrl : fileUrl)}
              onChange={(e) => {
                if (showImageUrlInput) setImageUrl(e.target.value);
                else if (showVideoUrlInput) setVideoUrl(e.target.value);
                else if (showFileUrlInput) setFileUrl(e.target.value);
              }}
              placeholder={
                 showImageUrlInput ? "Enter image URL..." :
                 (showVideoUrlInput ? "Enter video URL..." :
                 "Enter file URL...")
              }
              className="flex-1 h-9 text-sm"
              disabled={!user || !chatId || isSending}
              aria-label={
                  showImageUrlInput ? "Image URL input" :
                  (showVideoUrlInput ? "Video URL input" : "File URL input")
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => toggleInputType('none')}
              className="text-muted-foreground hover:text-destructive flex-shrink-0 h-9 w-9"
              aria-label="Cancel URL input"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
       )}

        {/* Responsive form layout */}
      <form onSubmit={sendMessage} className="flex items-center gap-1.5 sm:gap-2">

        {/* Hidden File Input */}
         <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" aria-hidden="true" />

         {/* Emoji Picker Popover */}
        <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!user || !chatId || isSending || recording || !!audioBlobToUploadRef.current} // Disable if recording or has ready audio
                aria-label="Open emoji picker"
                className="flex-shrink-0 text-muted-foreground hover:text-primary h-9 w-9"
            >
                <Smile className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 border-0" align="start" side="top">
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              autoFocusSearch={false}
              theme={resolvedTheme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
              lazyLoadEmojis={true} height={350} searchDisabled
            />
          </PopoverContent>
        </Popover>

        {/* File Attach Button */}
        {!recording && !audioBlobToUploadRef.current && (
            <Button type="button" variant="ghost" size="icon" onClick={handleFileAttachClick} disabled={!user || !chatId || isSending} aria-label="Attach file"
                className={cn( attachedFile ? 'bg-accent text-accent-foreground' : '', "flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary" )}
            > <Paperclip className="h-5 w-5" /> </Button>
        )}

         {/* File URL Button */}
         {!recording && !audioBlobToUploadRef.current && (
            <Button type="button" variant="ghost" size="icon" onClick={() => toggleInputType(showFileUrlInput ? 'none' : 'file')} disabled={!user || !chatId || isSending} aria-label="Toggle file URL input"
               className={cn( showFileUrlInput ? 'bg-accent text-accent-foreground' : '', "flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary" )}
            > <LinkIcon className="h-5 w-5" /> </Button>
         )}

        {/* Image Button */}
        {!recording && !audioBlobToUploadRef.current && (
          <Button type="button" variant="ghost" size="icon" onClick={() => toggleInputType(showImageUrlInput ? 'none' : 'image')} disabled={!user || !chatId || isSending} aria-label="Toggle image URL input"
            className={cn( showImageUrlInput ? 'bg-accent text-accent-foreground' : '', "flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary" )}
          > <ImageIcon className="h-5 w-5" /> </Button>
        )}

        {/* Video Button */}
        {!recording && !audioBlobToUploadRef.current && (
           <Button type="button" variant="ghost" size="icon" onClick={() => toggleInputType(showVideoUrlInput ? 'none' : 'video')} disabled={!user || !chatId || isSending} aria-label="Toggle video URL input"
               className={cn( showVideoUrlInput ? 'bg-accent text-accent-foreground' : '', "flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary" )}
           > <VideoIcon className="h-5 w-5" /> </Button>
        )}

        {/* Text Input (Show if no URL inputs, not recording, and no ready audio) */}
        {!showImageUrlInput && !showVideoUrlInput && !showFileUrlInput && !recording && !audioBlobToUploadRef.current && !attachedFile && (
          <Input
            ref={inputRef} type="text" value={message} onChange={handleInputChange}
            placeholder={chatId ? (replyingTo ? "Write your reply..." : "Type a message...") : "Select a chat to start"}
            className="flex-1 h-9" disabled={!user || !chatId || isSending} aria-label="Chat message input"
          />
        )}
        {/* Placeholder to maintain layout */}
         {((showImageUrlInput || showVideoUrlInput || showFileUrlInput) || recording || audioBlobToUploadRef.current || attachedFile) && (
            <div className="flex-1 h-9"></div>
         )}

        {/* Microphone/Stop Button with Tooltip */}
         <TooltipProvider delayDuration={300}>
            <Tooltip>
                 <TooltipTrigger asChild>
                     <span tabIndex={micButtonDisabledReason ? 0 : -1}>
                         <Button type="button" variant={recording ? "destructive" : "ghost"} size="icon" onClick={handleMicButtonClick} disabled={micButtonDisabled} aria-label={recording ? "Stop recording" : (micButtonDisabledReason || "Start recording")}
                            className={cn( "flex-shrink-0 h-9 w-9", !micButtonDisabled && "text-muted-foreground hover:text-primary" )}
                         >
                            {recording ? <Square className="h-5 w-5" /> : (hasMicPermission === false || !browserSupportsMedia ? <AlertCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />)}
                        </Button>
                     </span>
                 </TooltipTrigger>
                 {micButtonDisabledReason && (
                     <TooltipContent side="top"> <p>{micButtonDisabledReason}</p> </TooltipContent>
                 )}
             </Tooltip>
         </TooltipProvider>

        {/* Send Button */}
        <Button type="submit" size="icon" disabled={!canSendMessage} aria-label="Send message" className="flex-shrink-0 h-9 w-9">
          <Send className="h-5 w-5" />
        </Button>
      </form>

      {/* Upload Progress Bar and Status */}
      {uploadProgress !== null && (
        <div className="pt-1 px-10 sm:px-12 flex flex-col items-center">
           <Progress value={uploadProgress} className="h-1 w-full mb-1" />
           <p className="text-xs text-muted-foreground">{uploadStatusText || `Uploading... ${Math.round(uploadProgress)}%`}</p>
        </div>
      )}
    </div>
  );
}

