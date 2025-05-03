
import type { Message } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Image from 'next/image';
import { Reply, Mic, Play, Pause, Video as VideoIcon, FileText, Download, Copy, Check } from 'lucide-react'; // Added Copy, Check
import { Button } from '@/components/ui/button';
import * as React from 'react';
import { FullScreenImageViewer } from './full-screen-image-viewer';
import { useToast } from '@/hooks/use-toast'; // Import useToast

interface ChatMessageProps {
  message: Message;
  onReply: (message: Message) => void;
}

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

// Helper to safely format Firestore Timestamp or ISO string
const formatTimestamp = (timestamp: any, formatString: string): string => {
    if (!timestamp) return '';
    let date: Date | null = null;
    try {
        if (timestamp instanceof Date) {
            date = timestamp;
        } else if (timestamp && typeof timestamp.toDate === 'function') { // Firestore Timestamp
            date = timestamp.toDate();
        } else if (typeof timestamp === 'string') { // ISO string
            date = parseISO(timestamp);
        } else if (typeof timestamp === 'number') { // Unix timestamp (seconds or ms)
             date = new Date(timestamp > 100000000000 ? timestamp : timestamp * 1000); // Heuristic for ms vs s
        }

        if (date && !isNaN(date.getTime())) {
            return format(date, formatString);
        } else {
            console.warn("Could not parse timestamp:", timestamp);
            return 'Invalid date';
        }
    } catch (error) {
        console.error("Error formatting timestamp:", error, timestamp);
        return 'Invalid date';
    }
};

// Helper to format file size
const formatFileSize = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined || bytes < 0) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};


const formatShortTimestamp = (timestamp: any): string => formatTimestamp(timestamp, 'p'); // Format like 1:23 PM
const formatFullTimestamp = (timestamp: any): string => formatTimestamp(timestamp, 'PPpp'); // Format like 'Jun 15th, 2024 at 1:23:45 PM'

// Regex to detect Markdown code blocks (```language\ncode\n```)
// Handles optional language and captures content including newlines
const codeBlockRegex = /```(\w+)?\s*?\n([\s\S]*?)\n```/;

export function ChatMessage({ message, onReply }: ChatMessageProps) {
  const { user } = useAuth();
  const { toast } = useToast(); // Get toast function
  const isSender = user?.uid === message.uid;
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [audioDuration, setAudioDuration] = React.useState<number | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isImageViewerOpen, setIsImageViewerOpen] = React.useState(false); // State for image viewer
  const [isCopied, setIsCopied] = React.useState(false); // State for copy button

  const handleReplyClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering other click events if needed
      onReply(message);
  };

  const handleImageClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering reply etc.
      if (message.imageUrl) {
          setIsImageViewerOpen(true);
      }
  };

  // --- Audio Playback Handling ---
  const togglePlay = () => {
    const audioElement = audioRef.current;
    if (!audioElement) {
        console.error("Audio element ref not found.");
        return;
    }

    if (isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play().catch(err => {
          console.error("Error playing audio:", err);
          setIsPlaying(false); // Reset state on play error
      });
    }
    // Note: isPlaying state is primarily controlled by the event listeners now
  };

   // Format time in MM:SS
   const formatAudioTime = (timeInSeconds: number): string => {
     if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return '0:00'; // Handle invalid duration
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };


  // Event listeners for audio state changes
  React.useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !message.audioUrl) return; // Only run if audio exists

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0); // Reset time on end
    };
    const handleLoadedMetadata = () => {
        console.log("Audio metadata loaded. Duration:", audioElement.duration);
        if (isFinite(audioElement.duration)) { // Check if duration is a valid number
            setAudioDuration(audioElement.duration);
        } else {
            console.warn("Audio duration is infinite or NaN.");
            setAudioDuration(null); // Set to null if invalid
        }
        setCurrentTime(0); // Reset time when metadata loads
    };
     const handleTimeUpdate = () => {
         if (!isNaN(audioElement.currentTime)) { // Ensure currentTime is valid
            setCurrentTime(audioElement.currentTime);
         }
     };
     const handleError = (e: Event) => {
         console.error("Audio playback error:", (e.target as HTMLAudioElement).error);
         setIsPlaying(false); // Ensure playing state is false on error
         setAudioDuration(null);
         setCurrentTime(0);
     };


    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('error', handleError);

    // If the src changes, ensure we reset state and listeners
     audioElement.load(); // Explicitly load metadata when src might change

    console.log(`Audio listeners attached for message ${message.id}`);

    return () => {
        console.log(`Cleaning up audio listeners for message ${message.id}`);
        audioElement.removeEventListener('play', handlePlay);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
        audioElement.removeEventListener('error', handleError);
        // Pause audio if unmounting while playing
        if (audioElement && !audioElement.paused) {
            audioElement.pause();
        }
        // Reset state on cleanup related to this specific message/audioUrl
        setIsPlaying(false);
        setAudioDuration(null);
        setCurrentTime(0);
    };
  }, [message.id, message.audioUrl]); // Re-run effect if message ID or audio URL changes
  // --- End Audio Playback Handling ---

  // --- Code Block Handling ---
  const codeMatch = message.text?.match(codeBlockRegex);
  const codeContent = codeMatch ? codeMatch[2].trim() : null; // Trim whitespace from captured code
  const codeLanguage = codeMatch ? codeMatch[1] : null;
  // Text excluding the code block (if any)
  const nonCodeText = message.text && codeMatch ? message.text.replace(codeBlockRegex, '').trim() : (message.text && !codeMatch ? message.text.trim() : null);


  const handleCopyToClipboard = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      toast({ title: "Copied to clipboard!" });
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy text: ", err);
      toast({ title: "Copy Failed", description: "Could not copy code to clipboard.", variant: "destructive" });
    }
  };
  // --- End Code Block Handling ---

  // Determine reply context text
  const getReplyTextPreview = (msg: Message): string => {
      if (msg.text) return msg.text;
      if (msg.imageUrl) return 'Image';
      if (msg.audioUrl) return 'Voice note';
      if (msg.videoUrl) return 'Video';
      if (msg.fileUrl) return msg.fileName || 'File'; // Use filename if available for files
      return 'Original message';
  }

  return (
    <>
    <div className={cn(
        "group flex items-end gap-2 my-2 w-full relative", // Added group and relative for reply button positioning
        isSender ? "justify-end" : "justify-start"
    )}>
      {!isSender && (
        <Avatar className="h-8 w-8 flex-shrink-0 self-start mt-1">
          <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'User Avatar'} data-ai-hint="receiver user profile avatar"/>
          <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "max-w-[75%] sm:max-w-[70%] rounded-xl shadow-sm break-words", // Base styles without padding
          isSender
            ? "bg-accent text-accent-foreground rounded-br-sm"
            : "bg-card text-card-foreground rounded-bl-sm",
           // Apply padding only if it's NOT just a code block without other content
           !(codeContent && !nonCodeText && !message.imageUrl && !message.audioUrl && !message.videoUrl && !message.fileUrl)
             ? 'px-3 py-2 sm:px-3.5 sm:py-2.5'
             : 'p-0 overflow-hidden' // Remove padding if it's only a code block
        )}
      >
        {/* Show sender name only if not sender and NOT just a code block */}
        {!isSender && message.displayName && !(codeContent && !nonCodeText && !message.imageUrl && !message.audioUrl && !message.videoUrl && !message.fileUrl) && (
           <p className="text-xs font-medium text-muted-foreground mb-1">{message.displayName}</p>
        )}

         {/* Display Reply Context */}
         {message.replyToMessageId && (
            <div className="mb-2 p-2 border-l-2 border-primary/50 bg-primary/10 rounded-r-md text-xs opacity-80">
                 <p className="font-medium text-primary-foreground/80 truncate">
                    Replying to {message.replyToMessageAuthor || 'Unknown'}
                 </p>
                 <p className="text-muted-foreground truncate italic">
                     {getReplyTextPreview(message)} {/* Use updated preview function */}
                 </p>
            </div>
         )}

         {/* Display Audio Player if audioUrl exists */}
         {message.audioUrl && (
             <div className={cn(
                 "my-2 p-2 rounded-md flex items-center gap-2 sm:gap-3", // Responsive gap
                 isSender ? "bg-accent/80" : "bg-muted/60" // Slightly different background
             )}>
                 <Button
                     variant="ghost"
                     size="icon"
                     onClick={togglePlay}
                     className="h-8 w-8 sm:h-9 sm:w-9 text-foreground/80 hover:text-foreground flex-shrink-0" // Responsive button size
                     aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
                     disabled={!message.audioUrl} // Disable only if URL is missing
                 >
                      {/* Show loading state? */}
                     {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5" />}
                 </Button>
                 {/* Hidden audio element */}
                 <audio ref={audioRef} src={message.audioUrl} preload="metadata" className="hidden">
                     Your browser does not support the audio element.
                 </audio>
                 {/* Display Time */}
                 <span className="text-xs text-muted-foreground font-mono w-14 sm:w-16 text-right flex-shrink-0"> {/* Responsive width */}
                      {formatAudioTime(currentTime)} / {audioDuration !== null ? formatAudioTime(audioDuration) : '?:??'} {/* Show duration or placeholder */}
                 </span>
             </div>
         )}

        {/* Display Image - Wrapped in Button */}
         {message.imageUrl && (
          <Button
              variant="ghost"
              className="relative aspect-video w-40 sm:w-48 max-w-full my-2 p-0 h-auto rounded-md overflow-hidden border block cursor-pointer" // Responsive width
              onClick={handleImageClick}
          >
             <Image
                 src={message.imageUrl}
                 alt="Chat image"
                 fill
                 style={{ objectFit: 'cover' }}
                 className="bg-muted"
                 data-ai-hint="chat message image"
                 sizes="(max-width: 640px) 75vw, (max-width: 1024px) 50vw, 30vw" // Adjusted sizes for better performance
             />
          </Button>
         )}

         {/* Display Video */}
          {message.videoUrl && (
             <div className="relative aspect-video w-full max-w-sm sm:max-w-md my-2 rounded-lg overflow-hidden border shadow-inner"> {/* Responsive max-width */}
                 <video
                     src={message.videoUrl}
                     controls
                     preload="metadata" // Load metadata to get duration/dimensions if possible
                     className="w-full h-full object-contain bg-black" // contain ensures the whole video fits
                     data-ai-hint="chat message video"
                     title={message.text ? `Video: ${message.text.substring(0, 30)}...` : "Chat video"}
                 >
                     Your browser does not support the video tag.
                     <a href={message.videoUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline p-2 block">
                         Watch video
                     </a>
                 </video>
             </div>
          )}

          {/* Display Generic File */}
           {message.fileUrl && (
                <div className={cn(
                    "my-2 p-3 rounded-md flex items-center gap-2 sm:gap-3 border", // Responsive gap
                    isSender ? "bg-accent/70 border-accent/80" : "bg-muted/50 border-muted/60"
                )}>
                    <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-foreground/70 flex-shrink-0" /> {/* Responsive icon */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" title={message.fileName || 'Attached file'}>
                            {message.fileName || 'Attached file'}
                        </p>
                         {/* Display file size and type if available */}
                        <p className="text-xs text-muted-foreground truncate">
                            {formatFileSize(message.fileSize)} {message.fileType ? `(${message.fileType.split('/')[1]})` : ''}
                        </p>
                    </div>
                     <Button
                         variant="ghost"
                         size="icon"
                         asChild // Use asChild to make it a link
                         className="h-8 w-8 text-primary flex-shrink-0"
                     >
                         <a href={message.fileUrl} target="_blank" rel="noopener noreferrer" download={message.fileName || true} aria-label="Download file">
                             <Download className="h-4 w-4 sm:h-5 sm:w-5" />
                         </a>
                     </Button>
                </div>
           )}

        {/* Display Text (if any exists outside the code block) */}
        {nonCodeText && (
          <p className="text-sm sm:text-base whitespace-pre-wrap break-words">{nonCodeText}</p>
        )}

        {/* Display Code Block */}
         {codeContent && (
           <div className="relative group/codeblock my-1 bg-gray-900 dark:bg-gray-800 rounded-md overflow-hidden font-mono text-sm">
               <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 dark:bg-gray-700 text-gray-400">
                   <span className="text-xs">{codeLanguage || 'code'}</span>
                   <Button
                       variant="ghost"
                       size="icon"
                       className="h-6 w-6 text-gray-400 hover:text-white opacity-50 group-hover/codeblock:opacity-100 transition-opacity"
                       onClick={() => handleCopyToClipboard(codeContent)}
                   >
                       {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                       <span className="sr-only">Copy code</span>
                   </Button>
               </div>
               <pre className="p-3 overflow-x-auto text-gray-200 dark:text-gray-100">
                   <code>
                       {codeContent}
                   </code>
               </pre>
           </div>
         )}

         {/* Show timestamp only if it's NOT just a code block without other content */}
         {!(codeContent && !nonCodeText && !message.imageUrl && !message.audioUrl && !message.videoUrl && !message.fileUrl) && (
           <TooltipProvider delayDuration={300}>
              <Tooltip>
                  <TooltipTrigger asChild>
                     <p className={cn(
                        "text-xs mt-1.5 opacity-60 cursor-default",
                        isSender ? "text-right" : "text-left",
                      )}>
                        {formatShortTimestamp(message.timestamp)}
                      </p>
                  </TooltipTrigger>
                  <TooltipContent side={isSender ? "left" : "right"}>
                      <p>{formatFullTimestamp(message.timestamp)}</p>
                  </TooltipContent>
              </Tooltip>
           </TooltipProvider>
         )}
      </div>

       {isSender && (
        <Avatar className="h-8 w-8 flex-shrink-0 self-start mt-1">
           <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'My Avatar'} data-ai-hint="sender user profile avatar"/>
           <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}

       {/* Reply Button - Show on hover */}
       <Button
           variant="ghost"
           size="icon"
           className={cn(
               "absolute -top-2 h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150",
               isSender ? "-left-1" : "-right-1" // Position based on sender/receiver
           )}
           onClick={handleReplyClick}
           aria-label="Reply to message"
       >
           <Reply className="h-4 w-4" />
       </Button>

    </div>
    {/* Full Screen Image Viewer Modal */}
     {isImageViewerOpen && message.imageUrl && (
         <FullScreenImageViewer
             imageUrl={message.imageUrl}
             altText={message.text || 'Chat image'}
             onClose={() => setIsImageViewerOpen(false)}
         />
     )}
    </>
  );
}

