
import type { Message } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Import Tooltip components

interface ChatMessageProps {
  message: Message;
}

// Consistent Helper function to get initials from display name
const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?';
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '?'; // Fallback
};

export function ChatMessage({ message }: ChatMessageProps) {
  const { user } = useAuth();
  const isSender = user?.uid === message.uid;

  // Function to safely format timestamp into a readable string (e.g., "1:30 PM" or "Invalid Date")
  const formatShortTimestamp = (timestamp: any): string => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      try {
        return format(timestamp.toDate(), 'p'); // 'p' for short time format like 1:30 PM
      } catch (error) {
        console.error("Error formatting short timestamp:", error, timestamp);
        return 'Invalid date'; // Fallback for invalid date objects
      }
    }
    return ''; // Return empty string if timestamp is null, undefined, or invalid
  };

   // Function to safely format timestamp into a full date/time string for tooltip
   const formatFullTimestamp = (timestamp: any): string => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      try {
        const date = timestamp.toDate();
        // Example format: "Jun 15, 2024, 1:30 PM"
        return format(date, 'PPpp');
      } catch (error) {
        console.error("Error formatting full timestamp:", error, timestamp);
        return 'Invalid date';
      }
    }
    return '';
  };


  return (
    <div className={cn(
        "flex items-end gap-2 my-2 w-full", // Ensure full width context for alignment
        isSender ? "justify-end" : "justify-start"
    )}>
      {/* Receiver's Avatar (Show on left) */}
      {!isSender && (
        <Avatar className="h-8 w-8 flex-shrink-0 self-start mt-1"> {/* Align top */}
          <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'User Avatar'} data-ai-hint="receiver user profile avatar"/>
          <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}

      {/* Message Bubble */}
      <div
        className={cn(
          "max-w-[70%] rounded-xl px-3.5 py-2.5 shadow-sm text-sm", // Slightly larger padding and rounding
          isSender
            ? "bg-accent text-accent-foreground rounded-br-sm" // Sharper corner for sender
            : "bg-card text-card-foreground rounded-bl-sm" // Sharper corner for receiver
        )}
      >
         {/* Receiver's Display Name (Optional) */}
        {!isSender && message.displayName && (
           <p className="text-xs font-medium text-muted-foreground mb-1">{message.displayName}</p>
        )}
        {/* Message Text */}
        <p className="break-words whitespace-pre-wrap">{message.text}</p>
         {/* Timestamp with Tooltip */}
         <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                   <p className={cn(
                      "text-xs mt-1.5 opacity-60 cursor-default", // Slightly more subtle, indicate interactivity
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

       {/* Sender's Avatar (Show on right) */}
       {isSender && (
        <Avatar className="h-8 w-8 flex-shrink-0 self-start mt-1"> {/* Align top */}
           <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'My Avatar'} data-ai-hint="sender user profile avatar"/>
           <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
