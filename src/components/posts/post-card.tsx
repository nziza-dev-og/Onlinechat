
import type { PostSerializable } from '@/types'; // Import PostSerializable
import { formatDistanceToNowStrict, parseISO } from 'date-fns'; // Import parseISO
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { User, Image as ImageIcon, Video } from 'lucide-react'; // Add icons

interface PostCardProps {
  post: PostSerializable; // Expect PostSerializable with string timestamp
}

// Consistent Helper function to get initials
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

// Function to safely format timestamp from ISO string
const formatTimestamp = (timestampISO: string | null | undefined): string => {
    if (!timestampISO) {
        return 'just now'; // Fallback if no timestamp string
    }
    try {
        // Parse the ISO string into a Date object
        const date = parseISO(timestampISO);
        // Format the distance
        return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch (error) {
        console.error("Error formatting ISO timestamp:", error, timestampISO);
        return 'Invalid date'; // Fallback for invalid date strings
    }
};

export function PostCard({ post }: PostCardProps) {
  return (
    <Card className="w-full shadow-lg rounded-lg overflow-hidden border border-border/50 bg-card"> {/* Added border and shadow */}
      <CardHeader className="flex flex-row items-center gap-3 p-4 border-b bg-muted/20"> {/* Slightly different header bg */}
        <Avatar className="h-10 w-10 border"> {/* Slightly larger avatar */}
          <AvatarImage src={post.photoURL || undefined} alt={post.displayName || 'User Avatar'} data-ai-hint="user post avatar"/>
          <AvatarFallback className="bg-background text-muted-foreground">
             {getInitials(post.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-semibold text-sm text-card-foreground leading-tight">{post.displayName || 'Anonymous User'}</span>
          {/* Use the updated formatTimestamp function */}
          <span className="text-xs text-muted-foreground leading-tight">{formatTimestamp(post.timestamp)}</span>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-4"> {/* Increased padding and spacing */}
         {/* Post Text */}
         {post.text && (
           <p className="text-base text-foreground whitespace-pre-wrap break-words">{post.text}</p> // Slightly larger text
         )}

         {/* Post Image */}
         {post.imageUrl && (
           <div className="relative aspect-video w-full rounded-lg overflow-hidden border shadow-inner"> {/* Added inner shadow */}
             <Image
               src={post.imageUrl}
               alt={post.text ? `Image for post: ${post.text.substring(0,30)}...` : "Post image"}
               fill // Use fill layout
               style={{ objectFit: 'cover' }} // Cover the container
               className="bg-muted" // Background while loading
               data-ai-hint="user post image"
               sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 60vw" // Adjusted sizes
             />
           </div>
         )}

          {/* Post Video */}
         {post.videoUrl && (
            <div className="aspect-video w-full rounded-lg overflow-hidden border bg-black shadow-inner"> {/* Added inner shadow */}
                 {/* Use standard video tag */}
                 <video
                    src={post.videoUrl}
                    controls // Add default controls
                    className="w-full h-full object-contain bg-black" // Contain video, ensure black bg
                    preload="metadata" // Preload metadata for duration/dimensions
                    data-ai-hint="user post video"
                    title={post.text ? `Video for post: ${post.text.substring(0,30)}...` : "Post video"}
                 >
                    Your browser does not support the video tag. <a href={post.videoUrl} target="_blank" rel="noopener noreferrer">Watch video</a>
                </video>
            </div>
         )}

         {/* Display placeholder if no content (should ideally be filtered out before rendering) */}
          {!post.text && !post.imageUrl && !post.videoUrl && (
              <p className="text-sm text-muted-foreground italic">[Empty post]</p>
          )}

      </CardContent>

      {/* Optional Footer (e.g., indicating media type if text is short) */}
       {((post.imageUrl && !post.text) || (post.videoUrl && !post.text)) && (
           <CardFooter className="p-4 pt-0 border-t text-muted-foreground text-xs flex items-center gap-1.5">
                {post.imageUrl && <ImageIcon className="h-3.5 w-3.5"/>}
                {post.videoUrl && <Video className="h-3.5 w-3.5"/>}
               <span>{post.imageUrl ? 'Image post' : 'Video post'}</span>
           </CardFooter>
       )}
    </Card>
  );
}
