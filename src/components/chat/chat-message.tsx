
import type { Message } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Image from 'next/image';
import { Reply, Mic, Play, Pause, Video as VideoIcon } from 'lucide-react'; // Added VideoIcon
import { Button } from '@/components/ui/button'; // Import Button for reply action
import * as React from 'react'; // Import React for audio handling and state
import { FullScreenImageViewer } from './full-screen-image-viewer'; // Import the modal

interface ChatMessageProps {
  message: Message;
  onReply: (message: Message) => void; // Callback function to initiate reply
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

const formatShortTimestamp = (timestamp: any): string => formatTimestamp(timestamp, 'p'); // Format like 1:23 PM
const formatFullTimestamp = (timestamp: any): string => formatTimestamp(timestamp, 'PPpp'); // Format like 'Jun 15th, 2024 at 1:23:45 PM'

export function ChatMessage({ message, onReply }: ChatMessageProps) {
  const { user } = useAuth();
  const isSender = user?.uid === message.uid;
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [audioDuration, setAudioDuration] = React.useState<number | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isImageViewerOpen, setIsImageViewerOpen] = React.useState(false); // State for image viewer


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
        setCurrentTime(audioElement.currentTime);
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

  // Determine reply context text
  const getReplyTextPreview = (msg: Message): string => {
      if (msg.text) return msg.text;
      if (msg.imageUrl) return 'Image';
      if (msg.audioUrl) return 'Voice note';
      if (msg.videoUrl) return 'Video'; // Add video case
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
          "max-w-[70%] rounded-xl px-3.5 py-2.5 shadow-sm break-words", // Added break-words
          isSender
            ? "bg-accent text-accent-foreground rounded-br-sm"
            : "bg-card text-card-foreground rounded-bl-sm"
        )}
      >
        {!isSender && message.displayName && (
           <p className="text-xs font-medium text-muted-foreground mb-1">{message.displayName}</p>
        )}

         {/* Display Reply Context */}
         {message.replyToMessageId && (
            <div className="mb-2 p-2 border-l-2 border-primary/50 bg-primary/10 rounded-r-md text-xs opacity-80">
                 <p className="font-medium text-primary-foreground/80 truncate">
                    Replying to {message.replyToMessageAuthor || 'Unknown'}
                 </p>
                 <p className="text-muted-foreground truncate italic">
                    {getReplyTextPreview(message)}
                 </p>
            </div>
         )}

         {/* Display Audio Player if audioUrl exists */}
         {message.audioUrl && (
             <div className={cn(
                 "my-2 p-2 rounded-md flex items-center gap-3", // Increased gap
                 isSender ? "bg-accent/80" : "bg-muted/60" // Slightly different background
             )}>
                 <Button
                     variant="ghost"
                     size="icon"
                     onClick={togglePlay}
                     className="h-9 w-9 text-foreground/80 hover:text-foreground flex-shrink-0" // Slightly larger button
                     aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
                     disabled={!audioDuration && message.audioUrl} // Disable play if URL exists but duration is not loaded yet
                 >
                     {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                 </Button>
                 {/* Hidden audio element */}
                 <audio ref={audioRef} src={message.audioUrl} preload="metadata" className="hidden">
                     Your browser does not support the audio element.
                 </audio>
                 {/* Display Time */}
                 <span className="text-xs text-muted-foreground font-mono w-16 text-right flex-shrink-0">
                     {audioDuration !== null ? `${formatAudioTime(currentTime)} / ${formatAudioTime(audioDuration)}` : (message.audioUrl ? 'Loading...' : 'No audio')}
                 </span>
             </div>
         )}

        {/* Display Image - Wrapped in Button */}
         {message.imageUrl && !message.audioUrl && !message.videoUrl && (
          <Button
              variant="ghost"
              className="relative aspect-video w-48 max-w-full my-2 p-0 h-auto rounded-md overflow-hidden border block cursor-pointer" // Make it a block, remove default padding
              onClick={handleImageClick}
          >
             <Image
                 src={message.imageUrl}
                 alt="Chat image"
                 fill
                 style={{ objectFit: 'cover' }}
                 className="bg-muted"
                 data-ai-hint="chat message image"
                 sizes="(max-width: 768px) 70vw, 30vw"
             />
          </Button>
         )}

         {/* Display Video */}
          {message.videoUrl && !message.audioUrl && !message.imageUrl && (
             <div className="relative aspect-video w-full max-w-md my-2 rounded-lg overflow-hidden border shadow-inner">
                 {/* Basic HTML5 Video Player */}
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
                 {/* Consider adding a more robust video player component later if needed */}
             </div>
          )}


        {message.text && (
            <p className="text-sm whitespace-pre-wrap">{message.text}</p>
        )}

         <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                   <p className={cn(
                      "text-xs mt-1.5 opacity-60 cursor-default",
                      isSender ? "text-right" : "text-left"
                    )}>
                      {formatShortTimestamp(message.timestamp)}
                    </p>
                </TooltipTrigger>
                <TooltipContent side={isSender ? "left" : "right"}>
                    <p>{formatFullTimestamp(message.timestamp)}</p>
                </TooltipContent>
            </Tooltip>
         </TooltipProvider>
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
