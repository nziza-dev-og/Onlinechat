import type { Message } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ChatMessageProps {
  message: Message;
}

// Helper function to get initials from display name
const getInitials = (name: string | null): string => {
    if (!name) return '';
    const nameParts = name.split(' ');
    if (nameParts.length > 1 && nameParts[0].length > 0 && nameParts[1].length > 0) {
      return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '?'; // Fallback for missing or single-letter names
};

export function ChatMessage({ message }: ChatMessageProps) {
  const { user } = useAuth();
  const isSender = user?.uid === message.uid;

  // Function to safely format timestamp
  const formatTimestamp = (timestamp: any): string => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      try {
        return format(timestamp.toDate(), 'p'); // 'p' for short time format like 1:30 PM
      } catch (error) {
        console.error("Error formatting timestamp:", error, timestamp);
        return 'Invalid date'; // Fallback for invalid date objects
      }
    }
    return ''; // Return empty string if timestamp is null, undefined, or invalid
  };


  return (
    <div className={cn("flex items-end gap-2 my-2", isSender ? "justify-end" : "justify-start")}>
      {!isSender && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'User'} data-ai-hint="user profile avatar" />
          <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[70%] rounded-lg p-3 shadow-sm", // Use percentage for better responsiveness
          isSender
            ? "bg-accent text-accent-foreground rounded-br-none"
            : "bg-card text-card-foreground rounded-bl-none"
        )}
      >
        {!isSender && message.displayName && ( // Only show display name if not sender and name exists
           <p className="text-xs font-medium text-muted-foreground mb-1">{message.displayName}</p>
        )}
        <p className="text-sm break-words whitespace-pre-wrap">{message.text}</p>
         <p className={cn(
            "text-xs mt-1 opacity-70", // Use opacity for subtlety
            isSender ? "text-right" : "text-left"
           )}>
            {formatTimestamp(message.timestamp)}
          </p>
      </div>
       {isSender && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'User'} data-ai-hint="user profile avatar" />
           <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
