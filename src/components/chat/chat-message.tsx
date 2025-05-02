import type { Message } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { user } = useAuth();
  const isSender = user?.uid === message.uid;

  // Function to get initials from display name
  const getInitials = (name: string | null): string => {
    if (!name) return '';
    const nameParts = name.split(' ');
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '';
  };

  return (
    <div className={cn("flex items-start gap-3 my-3", isSender ? "justify-end" : "justify-start")}>
      {!isSender && (
        <Avatar className="h-8 w-8">
          <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'User'} data-ai-hint="user profile avatar" />
          <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-xs md:max-w-md lg:max-w-lg rounded-lg p-3 shadow-md",
          isSender ? "bg-accent text-accent-foreground rounded-br-none" : "bg-card text-card-foreground rounded-bl-none"
        )}
      >
        {!isSender && (
           <p className="text-xs font-medium text-muted-foreground mb-1">{message.displayName || 'Anonymous'}</p>
        )}
        <p className="text-sm break-words">{message.text}</p>
        <p className={cn("text-xs mt-1", isSender ? "text-accent-foreground/70 text-right" : "text-muted-foreground text-left")}>
          {message.timestamp ? format(message.timestamp.toDate(), 'p') : ''}
        </p>
      </div>
       {isSender && (
        <Avatar className="h-8 w-8">
          <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'User'} data-ai-hint="user profile avatar" />
           <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
