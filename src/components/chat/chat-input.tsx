

"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Image as ImageIcon, X, Mic, Square, Trash2, Play, Pause, AlertCircle, Video as VideoIcon, Paperclip, FileText, Link as LinkIcon, Smile } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { updateTypingStatus } from '@/lib/chat.service';
import { uploadAudio, uploadGenericFile } from '@/lib/storage.service';
import { useToast } from "@/hooks/use-toast";
import type { Message } from '@/types';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import EmojiPicker, { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "next-themes";

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

  // --- Audio Recording State ---
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null); // null = unknown, true = granted, false = denied/unavailable
  const [browserSupportsMedia, setBrowserSupportsMedia] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  // --- End Audio Recording State ---

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
        if (audioPreviewUrl) {
             console.log("Cleanup: Revoking previous audio preview URL:", audioPreviewUrl);
             URL.revokeObjectURL(audioPreviewUrl);
             setAudioPreviewUrl(null);
        }
        audioChunksRef.current = []; // Clear chunks on unmount
        setIsRecording(false);
        setAudioBlob(null);
        setIsPreviewPlaying(false);
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
    if (!chatId || !user?.uid || isRecording || attachedFile || audioBlob) return; // Don't send typing update while recording/attaching/previewing
    try {
        await updateTypingStatus(chatId, user.uid, isTyping);
    } catch (error) {
        console.error("Error sending typing update:", error);
    }
   }, [chatId, user?.uid, isRecording, attachedFile, audioBlob]);


  useEffect(() => {
     return () => {
       if (typingTimeoutRef.current) {
         clearTimeout(typingTimeoutRef.current);
       }
        // Check if still mounted before sending final update
       if (chatId && user?.uid && !isRecording && !attachedFile && !audioBlob) {
           sendTypingUpdate(false);
       }
     };
  }, [chatId, user?.uid, sendTypingUpdate, isRecording, attachedFile, audioBlob]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    if (!chatId || !user?.uid || isRecording || attachedFile || audioBlob) return; // Don't trigger typing updates

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
  }, [browserSupportsMedia, isRecording, toast]); // Added isRecording and toast


  // Request microphone permission and get stream
  const getMicStream = async (): Promise<MediaStream | null> => {
      console.log("Attempting to get microphone stream...");
      if (!browserSupportsMedia) {
         toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Audio recording is not supported by your browser.' });
         return null;
      }
      // No need to check hasMicPermission here, getUserMedia will prompt if needed

      try {
        // Ensure any previous stream is stopped before requesting a new one
        stopStream();

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
    // Ensure cleanup of other states before starting
    discardAttachedFile();
    setMessage('');
    setImageUrl('');
    setVideoUrl('');
    setFileUrl('');
    setShowImageUrlInput(false);
    setShowVideoUrlInput(false);
    setShowFileUrlInput(false);
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
        sendTypingUpdate(false);
    }

    const stream = await getMicStream();
    if (!stream) {
        console.error("Failed to get microphone stream. Cannot start recording.");
        setIsRecording(false); // Ensure recording state is false
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
        // Cleanup previous recorder if exists
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.ondataavailable = null;
            mediaRecorderRef.current.onstop = null;
            mediaRecorderRef.current.onerror = null;
        }
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = []; // Reset chunks for new recording

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
            // Stop the stream tracks *after* the recorder has finished processing data
            stopStream();
            if (audioChunksRef.current.length === 0) {
                console.error("Recording stopped but no audio data was captured. Discarding.");
                discardRecording(); // Clean up if no data
                toast({ variant: 'destructive', title: 'Recording Failed', description: 'No audio data was captured. Please try again.' });
                return;
            }
            // Use the determined mimeType or the recorder's actual mimeType
            const blobMimeType = supportedMimeType || recorder.mimeType || 'audio/webm';
            try {
                const combinedBlob = new Blob(audioChunksRef.current, { type: blobMimeType });
                 console.log("Audio Blob created:", blobMimeType, combinedBlob.size);
                // Only set blob and URL if size > 0
                 if (combinedBlob.size > 0) {
                     setAudioBlob(combinedBlob);
                     const url = URL.createObjectURL(combinedBlob);
                     console.log("Setting audio preview URL:", url);
                     setAudioPreviewUrl(url); // Set URL only after blob is confirmed
                 } else {
                      console.error("Combined audio blob size is 0. Discarding.");
                      discardRecording();
                      toast({ variant: 'destructive', title: 'Recording Failed', description: 'Captured audio was empty.' });
                 }
            } catch (blobError) {
                console.error("Error creating Blob:", blobError);
                 toast({ variant: 'destructive', title: 'Recording Error', description: 'Could not process recorded audio.' });
                 discardRecording();
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
          setIsRecording(false); // Set recording state to false regardless of success/failure
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
    setAudioPreviewUrl(null); // Clear preview URL state
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
          // Ensure audio is loaded before playing
          audioRef.current.load(); // Sometimes needed if src changed or wasn't loaded
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
          console.log("Audio event listeners attached for:", audioPreviewUrl);

          // Load the audio source when URL changes
          audioElement.load();

          return () => {
              audioElement.removeEventListener('play', handlePlay);
              audioElement.removeEventListener('pause', handlePause);
              audioElement.removeEventListener('ended', handleAudioEnded);
              // Pause audio if unmounting while playing
              if (!audioElement.paused) {
                  audioElement.pause();
              }
              console.log("Audio event listeners removed for:", audioPreviewUrl);
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

  // --- File Attachment Logic ---
  const handleFileAttachClick = () => {
      discardRecording(); // Clear audio recording state
      setShowImageUrlInput(false);
      setShowVideoUrlInput(false);
      setShowFileUrlInput(false);
      setMessage('');
      setImageUrl('');
      setVideoUrl('');
      setFileUrl('');
      fileInputRef.current?.click(); // Trigger hidden file input
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
              // Clear other inputs/states
              setMessage('');
              setImageUrl('');
              setVideoUrl('');
              setFileUrl('');
              discardRecording();
          }
      }
       // Reset file input value so the same file can be selected again
       if (e.target) {
           e.target.value = '';
       }
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
        // Clear all inputs and states before switching
        setMessage('');
        setImageUrl('');
        setVideoUrl('');
        setFileUrl('');
        discardRecording();
        discardAttachedFile();
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
            sendTypingUpdate(false);
        }

        // Set the visibility for the selected type
        setShowImageUrlInput(type === 'image');
        setShowVideoUrlInput(type === 'video');
        setShowFileUrlInput(type === 'file');

        // Focus the relevant input if showing one
        if (type !== 'none') {
            // Use setTimeout to allow the DOM to update before focusing
            setTimeout(() => {
                if (type === 'image' || type === 'video' || type === 'file') {
                    inputRef.current?.focus();
                }
            }, 0);
        }
   };
   // --- End URL Input Toggles ---


  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedImageUrl = imageUrl.trim();
    const trimmedVideoUrl = videoUrl.trim(); // Trim video URL
    const trimmedFileUrl = fileUrl.trim(); // Trim file URL

    // Determine what content exists: prioritize attached file, then audio, then file URL, then video, then image, then text
    const hasContent = !!attachedFile || !!audioBlob || !!trimmedFileUrl || !!trimmedVideoUrl || !!trimmedImageUrl || !!trimmedMessage;
    let mediaUrl: string | null = null;
    let mediaType: 'file' | 'audio' | 'video' | 'image' | null = null;
    let fileName: string | null = null; // For generic files or extracting from URL
    let fileType: string | null = null; // For generic files or inferring from URL
    let fileSize: number | null = null; // For file size


    if (!user || !chatId || !hasContent || isSending) {
        console.warn("Send message condition not met:", { user: !!user, chatId: !!chatId, hasContent, isSending });
        return;
    }

    console.log("Sending message...");
    setIsSending(true);
    setUploadProgress(null); // Reset progress
    setUploadStatusText(''); // Reset status text
    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
       typingTimeoutRef.current = null;
       sendTypingUpdate(false);
    }

    const { uid, displayName, photoURL } = user;

    try {
      // 1. Upload attached file if present (Highest Priority)
      if (attachedFile) {
            mediaType = 'file';
            fileName = attachedFile.name;
            fileType = attachedFile.type || 'application/octet-stream';
            fileSize = attachedFile.size; // Store file size
            console.log(`File attached: ${fileName} (${fileType}, ${fileSize} bytes), starting upload...`);
            setUploadProgress(0);
            setUploadStatusText(`Uploading ${fileName}...`);
            const timestamp = Date.now();
            // Create a unique path using user ID, timestamp, and original filename
            const filePath = `chats/${chatId}/files/${uid}_${timestamp}_${fileName}`;
            console.log(`Uploading file to path: ${filePath}`);

            // Use a callback for progress updates
            const updateProgress = (progress: number) => setUploadProgress(progress);

            try {
                mediaUrl = await uploadGenericFile(attachedFile, filePath, updateProgress);
                setUploadProgress(100); // Ensure it reaches 100 on success
                setUploadStatusText(`Uploaded ${fileName}`); // Update status text
                console.log("File upload successful, URL:", mediaUrl);
            } catch (uploadError: any) {
                 console.error("Error during file upload:", uploadError);
                 toast({
                     title: "File Upload Failed",
                     description: uploadError.message || `Could not upload ${fileName}.`,
                     variant: "destructive"
                 });
                 setIsSending(false);
                 discardAttachedFile(); // Clear file state on error
                 return; // Stop message sending process
            }
      }
      // 2. Upload audio if present (Second Priority)
      else if (audioBlob) {
         console.log("Audio blob detected, starting upload...");
         mediaType = 'audio';
         fileSize = audioBlob.size; // Store audio blob size
         setUploadProgress(0); // Indicate start of upload
         setUploadStatusText('Uploading voice note...');
         const timestamp = Date.now();
         // Ensure MIME type is available, default to webm if needed
          const fileExtension = (audioBlob.type.split('/')[1] || 'webm').split(';')[0] || 'webm'; // Robust extension extraction
         const audioPath = `chats/${chatId}/audio/${uid}_${timestamp}.${fileExtension}`; // Unique path with extension
         console.log(`Uploading audio to path: ${audioPath} (Type: ${audioBlob.type}, Size: ${fileSize} bytes)`);

         // Use a callback for progress updates
         const updateProgress = (progress: number) => setUploadProgress(progress);

         try {
             mediaUrl = await uploadAudio(audioBlob, audioPath, updateProgress); // Pass progress callback
             setUploadProgress(100); // Ensure it reaches 100 on success
             setUploadStatusText('Uploaded voice note');
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
             setUploadStatusText('');
             discardRecording(); // Discard local blob on upload failure
             return; // Stop message sending process
         }
      }
      // 3. Check for File URL if no attached file or audio (Third Priority)
      else if (trimmedFileUrl) {
          mediaType = 'file';
          mediaUrl = trimmedFileUrl;
          fileSize = null; // Size unknown for URL files
          // Try to extract filename from URL
          try {
              const url = new URL(trimmedFileUrl);
              const pathnameParts = url.pathname.split('/');
              fileName = decodeURIComponent(pathnameParts[pathnameParts.length - 1] || `file_${Date.now()}`);
          } catch {
              fileName = `file_${Date.now()}`; // Fallback filename
          }
          // File type can be inferred on the client side when displaying, or left null
          fileType = null;
          console.log("File URL provided:", mediaUrl, "Extracted filename:", fileName);
      }
      else if (trimmedVideoUrl) { // 4. Check for Video URL
          mediaType = 'video';
          mediaUrl = trimmedVideoUrl;
          fileName = null; // No filename for simple video URLs
          fileSize = null;
          console.log("Video URL provided:", mediaUrl);
      } else if (trimmedImageUrl) { // 5. Check for Image URL
          mediaType = 'image';
          mediaUrl = trimmedImageUrl;
          fileName = null; // No filename for simple image URLs
          fileSize = null;
          console.log("Image URL provided:", mediaUrl);
      }


      // 6. Add message to Firestore
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      const messageData: Omit<Message, 'id' | 'timestamp'> & { timestamp: any } = {
        text: trimmedMessage || '',
        imageUrl: mediaType === 'image' ? mediaUrl : null,
        audioUrl: mediaType === 'audio' ? mediaUrl : null,
        videoUrl: mediaType === 'video' ? mediaUrl : null,
        fileUrl: mediaType === 'file' ? mediaUrl : null,
        fileName: mediaType === 'file' ? fileName : null,
        fileType: mediaType === 'file' ? fileType : null,
        fileSize: fileSize, // Save the file size
        timestamp: serverTimestamp(),
        uid,
        displayName: displayName ?? null, // Use null if undefined
        photoURL: photoURL ?? null, // Use null if undefined
        replyToMessageId: replyingTo?.id ?? null,
        replyToMessageText: replyingTo?.text ?? (replyingTo?.imageUrl ? 'Image' : (replyingTo?.audioUrl ? 'Voice note' : (replyingTo?.videoUrl ? 'Video' : (replyingTo?.fileUrl ? 'File' : null)))), // Include type for media replies
        replyToMessageAuthor: replyingTo?.displayName ?? null,
      };
      console.log("Adding message to Firestore:", messageData);

      await addDoc(messagesRef, messageData);
      console.log("Message added successfully to Firestore.");

      // Clear inputs *after* successful send
      setMessage('');
      setImageUrl('');
      setVideoUrl('');
      setFileUrl('');
      setShowImageUrlInput(false);
      setShowVideoUrlInput(false);
      setShowFileUrlInput(false);
      discardRecording(); // Clear audio state
      discardAttachedFile(); // Clear file state
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
        setUploadStatusText(''); // Clear status text
    }
  };

  const handleMicButtonClick = () => {
      console.log("Mic button clicked. Current state:", { isRecording, hasMicPermission, browserSupportsMedia });
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

  const canSendMessage = user && chatId && (!!message.trim() || !!imageUrl.trim() || !!videoUrl.trim() || !!fileUrl.trim() || !!audioBlob || !!attachedFile) && !isSending;
  // Update canRecord logic based on permission and browser support
  const canRecord = browserSupportsMedia && user && chatId && !isSending && !isCheckingPermission && !attachedFile && !showFileUrlInput && !showImageUrlInput && !showVideoUrlInput; // Disable mic if file/URL input shown
  const micButtonDisabled = isCheckingPermission || !canRecord; // Check browser support and that permission check is done, also disable if attaching file/URL
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
      {attachedFile && (
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

      {/* Audio Recording/Preview UI */}
      {(isRecording || audioBlob) && !showImageUrlInput && !showVideoUrlInput && !attachedFile && !showFileUrlInput && (
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
           {/* Audio Preview */}
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
               <audio ref={audioRef} src={audioPreviewUrl} preload="metadata" className="hidden" />
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

       {/* URL Input Field (conditionally shown based on show***UrlInput states) */}
       {(showImageUrlInput || showVideoUrlInput || showFileUrlInput) && (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef} // Can reuse the same ref if only one is active at a time
              type="url"
              value={showImageUrlInput ? imageUrl : (showVideoUrlInput ? videoUrl : fileUrl)}
              onChange={(e) => {
                if (showImageUrlInput) setImageUrl(e.target.value);
                else if (showVideoUrlInput) setVideoUrl(e.target.value);
                else if (showFileUrlInput) setFileUrl(e.target.value);
              }}
              placeholder={
                 showImageUrlInput ? "Enter image URL..." :
                 (showVideoUrlInput ? "Enter video URL (e.g., YouTube)..." :
                 "Enter file URL (e.g., Drive)...")
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
              onClick={() => toggleInputType('none')} // Use toggleInputType to reset
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
         <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
         />

         {/* Emoji Picker Popover */}
        <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!user || !chatId || isSending || isRecording || !!audioBlob} // Disable if recording or has preview
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
              lazyLoadEmojis={true}
              height={350}
              searchDisabled
            />
          </PopoverContent>
        </Popover>

        {/* File Attach Button */}
        {/* Show only if not recording and no audio preview exists */}
        {!isRecording && !audioBlob && (
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleFileAttachClick}
                disabled={!user || !chatId || isSending}
                aria-label="Attach file"
                className={cn(
                    attachedFile ? 'bg-accent text-accent-foreground' : '',
                    "flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary"
                )}
            >
                <Paperclip className="h-5 w-5" />
            </Button>
        )}

         {/* File URL Button */}
         {/* Show only if not recording and no audio preview exists */}
         {!isRecording && !audioBlob && (
            <Button
               type="button"
               variant="ghost"
               size="icon"
               onClick={() => toggleInputType(showFileUrlInput ? 'none' : 'file')}
               disabled={!user || !chatId || isSending}
               aria-label="Toggle file URL input"
               className={cn(
                   showFileUrlInput ? 'bg-accent text-accent-foreground' : '',
                   "flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary"
               )}
            >
               <LinkIcon className="h-5 w-5" />
            </Button>
         )}


        {/* Image Button */}
        {/* Show only if not recording and no audio preview exists */}
        {!isRecording && !audioBlob && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => toggleInputType(showImageUrlInput ? 'none' : 'image')}
            disabled={!user || !chatId || isSending}
            aria-label="Toggle image URL input"
            className={cn(
                showImageUrlInput ? 'bg-accent text-accent-foreground' : '',
                "flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary"
            )}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
        )}

        {/* Video Button */}
         {/* Show only if not recording and no audio preview exists */}
        {!isRecording && !audioBlob && (
           <Button
               type="button"
               variant="ghost"
               size="icon"
               onClick={() => toggleInputType(showVideoUrlInput ? 'none' : 'video')}
               disabled={!user || !chatId || isSending}
               aria-label="Toggle video URL input"
               className={cn(
                   showVideoUrlInput ? 'bg-accent text-accent-foreground' : '',
                   "flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary"
                )}
           >
               <VideoIcon className="h-5 w-5" />
           </Button>
        )}


        {/* Text Input (Show if no URL inputs are active AND not recording AND no audio preview) */}
        {(!showImageUrlInput && !showVideoUrlInput && !showFileUrlInput && !isRecording && !audioBlob) && (
          <Input
            ref={inputRef}
            type="text"
            value={message}
            onChange={handleInputChange}
            placeholder={chatId ? (replyingTo ? "Write your reply..." : "Type a message...") : "Select a chat to start"}
            className="flex-1 h-9"
            disabled={!user || !chatId || isSending}
            aria-label="Chat message input"
          />
        )}
        {/* Placeholder to maintain layout if text input is hidden but other inputs aren't */}
         {((showImageUrlInput || showVideoUrlInput || showFileUrlInput) || isRecording || audioBlob) && (
            <div className="flex-1 h-9"></div>
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
                            className={cn(
                                "flex-shrink-0 h-9 w-9",
                                !micButtonDisabled && "text-muted-foreground hover:text-primary"
                            )}
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
          className="flex-shrink-0 h-9 w-9"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>




      {/* Upload Progress Bar and Status */}
      {uploadProgress !== null && (
        <div className="pt-1 px-10 sm:px-12 flex flex-col items-center"> {/* Responsive padding */}
           <Progress value={uploadProgress} className="h-1 w-full mb-1" />
           <p className="text-xs text-muted-foreground">{uploadStatusText || `Uploading... ${Math.round(uploadProgress)}%`}</p>
        </div>
      )}
    </div>
  );
}

