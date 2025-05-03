
import type { PostSerializable } from '@/types'; // Import PostSerializable
import { formatDistanceToNowStrict, parseISO } from 'date-fns'; // Import parseISO
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

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
        return ''; // Return empty if no timestamp string
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
    <Card className="w-full mb-4 shadow-md overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-3 p-4 border-b bg-card">
        <Avatar className="h-9 w-9">
          <AvatarImage src={post.photoURL || undefined} alt={post.displayName || 'User Avatar'} data-ai-hint="user post avatar"/>
          <AvatarFallback>{getInitials(post.displayName)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-semibold text-sm text-card-foreground">{post.displayName || 'Anonymous User'}</span>
          {/* Use the updated formatTimestamp function */}
          <span className="text-xs text-muted-foreground">{formatTimestamp(post.timestamp)}</span>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
         {/* Post Text */}
         {post.text && (
           <p className="text-sm text-foreground whitespace-pre-wrap break-words">{post.text}</p>
         )}

         {/* Post Image */}
         {post.imageUrl && (
           <div className="relative aspect-video w-full rounded-lg overflow-hidden border">
             <Image
               src={post.imageUrl}
               alt="Post image"
               fill // Use fill layout
               style={{ objectFit: 'cover' }} // Cover the container
               className="bg-muted" // Background while loading
               data-ai-hint="user post image"
               // Optional: Add sizes for optimization if needed
               // sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
             />
           </div>
         )}

          {/* Post Video */}
         {post.videoUrl && (
            <div className="aspect-video w-full rounded-lg overflow-hidden border bg-black">
                 {/* Use standard video tag */}
                 <video
                    src={post.videoUrl}
                    controls // Add default controls
                    className="w-full h-full object-contain" // Contain video within bounds
                    preload="metadata" // Preload metadata for duration/dimensions
                    data-ai-hint="user post video"
                 >
                    Your browser does not support the video tag.
                </video>
            </div>
         )}

      </CardContent>

      {/* Optional Footer (e.g., for likes, comments count) */}
      {/* <CardFooter className="p-4 pt-0 border-t">
        <span className="text-xs text-muted-foreground">Likes | Comments</span>
      </CardFooter> */}
    </Card>
  );
}

