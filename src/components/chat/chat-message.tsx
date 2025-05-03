
import type { Message } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Image from 'next/image';
import { Reply, Mic } from 'lucide-react'; // Import Reply icon and Mic icon
import { Button } from '@/components/ui/button'; // Import Button for reply action

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

export function ChatMessage({ message, onReply }: ChatMessageProps) {
  const { user } = useAuth();
  const isSender = user?.uid === message.uid;

  const formatShortTimestamp = (timestamp: any): string => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      try {
        return format(timestamp.toDate(), 'p');
      } catch (error) {
        console.error("Error formatting short timestamp:", error, timestamp);
        return 'Invalid date';
      }
    }
    return '';
  };

   const formatFullTimestamp = (timestamp: any): string => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      try {
        const date = timestamp.toDate();
        return format(date, 'PPpp');
      } catch (error) {
        console.error("Error formatting full timestamp:", error, timestamp);
        return 'Invalid date';
      }
    }
    return '';
  };

  const handleReplyClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering other click events if needed
      onReply(message);
  };

  return (
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
          "max-w-[70%] rounded-xl px-3.5 py-2.5 shadow-sm",
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
            <div className="mb-2 p-2 border-l-2 border-primary/50 bg-primary/10 rounded-r-md text-xs">
                 <p className="font-medium text-primary-foreground/80 truncate">
                    Replying to {message.replyToMessageAuthor || 'Unknown'}
                 </p>
                 <p className="text-muted-foreground truncate italic">
                    {message.replyToMessageText || (message.imageUrl ? 'Image' : (message.audioUrl ? 'Voice note' : 'Original message'))}
                 </p>
            </div>
         )}

         {/* Display Audio Player if audioUrl exists */}
         {message.audioUrl && (
            <div className={cn(
                "my-2 p-2 rounded-md flex items-center gap-2",
                 isSender ? "bg-accent/80" : "bg-muted/60" // Slightly different background
            )}>
                 <Mic className="h-4 w-4 flex-shrink-0 text-foreground/70" />
                <audio controls src={message.audioUrl} preload="metadata" className="w-full max-w-xs h-9"> {/* Adjusted height */}
                  Your browser does not support the audio element.
                </audio>
            </div>
         )}

        {message.imageUrl && !message.audioUrl && ( // Don't show image if audio is present (or decide based on preference)
          <div className="relative aspect-square w-48 max-w-full my-2 rounded-md overflow-hidden border">
            <Image
              src={message.imageUrl}
              alt="Chat image"
              fill
              style={{ objectFit: 'cover' }}
              className="bg-muted"
              data-ai-hint="chat message image"
              sizes="(max-width: 768px) 70vw, 30vw"
            />
          </div>
        )}

        {message.text && (
            <p className="text-sm break-words whitespace-pre-wrap">{message.text}</p>
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
  );
}
