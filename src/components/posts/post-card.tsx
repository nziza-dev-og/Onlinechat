
'use client'; // Need client component for state and interactions

import * as React from 'react';
import type { PostSerializable, CommentSerializable } from '@/types'; // Import CommentSerializable
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { User, Image as ImageIcon, Video, Heart, MessageCircle, Trash2, AlertTriangle, Loader2 } from 'lucide-react'; // Add Heart, MessageCircle, Trash2, AlertTriangle, Loader2
import { Button, buttonVariants } from '@/components/ui/button'; // Import buttonVariants
import { useAuth } from '@/hooks/use-auth';
import { likePost, unlikePost, deletePost } from '@/lib/posts.service'; // Import like/unlike/delete functions
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from "framer-motion"; // Import animation library
import { CommentSection } from './comment-section'; // Import CommentSection
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Import AlertDialog components


interface PostCardProps {
  post: PostSerializable; // Expect PostSerializable with string timestamp
  // Optimistic update callbacks
  onLikeChange?: (postId: string, liked: boolean, newLikeCount: number) => void;
  onCommentAdded?: (postId: string, newCommentCount: number) => void;
  onPostDeleted?: (postId: string) => void; // Callback for deletion
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
        const date = parseISO(timestampISO);
        return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch (error) {
        console.error("Error formatting ISO timestamp:", error, timestampISO);
        return 'Invalid date'; // Fallback for invalid date strings
    }
};

export function PostCard({ post, onLikeChange, onCommentAdded, onPostDeleted }: PostCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLiked, setIsLiked] = React.useState(post.likedBy?.includes(user?.uid ?? '') ?? false);
  const [likeCount, setLikeCount] = React.useState(post.likeCount ?? 0);
  const [isLiking, setIsLiking] = React.useState(false); // Prevent double clicks
  const [isDeleting, setIsDeleting] = React.useState(false); // State for delete operation
  const [showComments, setShowComments] = React.useState(false); // State to toggle comments
  const isOwner = user?.uid === post.uid; // Check if the current user owns the post

  // Update local state if the likedBy prop changes externally
  React.useEffect(() => {
     setIsLiked(post.likedBy?.includes(user?.uid ?? '') ?? false);
     setLikeCount(post.likeCount ?? 0);
  }, [post.likedBy, post.likeCount, user?.uid]);

  const handleLikeToggle = async () => {
    if (!user || isLiking) return;

    setIsLiking(true);
    const currentlyLiked = isLiked;
    const newLikeState = !currentlyLiked;
    const newLikeCount = currentlyLiked ? likeCount - 1 : likeCount + 1;

    // Optimistic UI update
    setIsLiked(newLikeState);
    setLikeCount(newLikeCount);
    onLikeChange?.(post.id, newLikeState, newLikeCount); // Notify parent

    try {
      if (newLikeState) {
        await likePost(post.id, user.uid);
      } else {
        await unlikePost(post.id, user.uid);
      }
      // Optional: Success toast (can be noisy)
      // toast({ title: newLikeState ? "Post Liked" : "Post Unliked" });
    } catch (error: any) {
      console.error("Error liking/unliking post:", error);
      toast({
        title: "Error",
        description: `Could not ${currentlyLiked ? 'unlike' : 'like'} post. ${error.message}`,
        variant: "destructive",
      });
      // Revert optimistic update on error
      setIsLiked(currentlyLiked);
      setLikeCount(currentlyLiked ? newLikeCount + 1 : newLikeCount - 1);
       onLikeChange?.(post.id, currentlyLiked, currentlyLiked ? newLikeCount + 1 : newLikeCount - 1);
    } finally {
      setIsLiking(false);
    }
  };

  const handleDelete = async () => {
     if (!isOwner || isDeleting) return;

     setIsDeleting(true);
     // Optimistic UI update - notify parent immediately
     onPostDeleted?.(post.id);

     try {
         await deletePost(post.id, user.uid); // Call the delete service
         toast({ title: "Post Deleted", description: "Your post has been successfully removed." });
         // No need to revert on success, parent already removed it
     } catch (error: any) {
         console.error("Error deleting post:", error);
         toast({
             title: "Deletion Failed",
             description: error.message || "Could not delete the post. Please try again.",
             variant: "destructive",
         });
         // Note: Reverting optimistic delete is tricky as the parent state holds the list.
         // A full refresh might be simpler, or the parent needs a way to re-add the post.
         // For now, we'll just show the error. A manual refresh might be needed on failure.
         setIsDeleting(false); // Reset deleting state on failure
     }
      // No finally block needed to set isDeleting to false here, as the component will unmount on success.
  };


  const toggleCommentSection = () => {
     setShowComments(prev => !prev);
  };

  return (
     <motion.div
         initial={{ opacity: 0, y: 20 }}
         animate={{ opacity: 1, y: 0 }}
         exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }} // Faster exit animation
         transition={{ duration: 0.3 }}
         layout // Animate layout changes (like removal)
     >
        <Card className="w-full shadow-lg rounded-lg overflow-hidden border border-border/50 bg-card transition-shadow duration-300 hover:shadow-xl"> {/* Hover effect */}
          <CardHeader className="flex flex-row items-center gap-3 p-4 border-b bg-muted/20">
            <Avatar className="h-10 w-10 border">
              <AvatarImage src={post.photoURL || undefined} alt={post.displayName || 'User Avatar'} data-ai-hint="user post avatar"/>
              <AvatarFallback className="bg-background text-muted-foreground">
                 {getInitials(post.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 flex flex-col"> {/* Use flex-1 to push timestamp to the right */}
              <span className="font-semibold text-sm text-card-foreground leading-tight">{post.displayName || 'Anonymous User'}</span>
              <span className="text-xs text-muted-foreground leading-tight">{formatTimestamp(post.timestamp)}</span>
            </div>
             {/* Delete Button (only for owner) */}
             {isOwner && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                         <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-8 w-8"
                            disabled={isDeleting}
                         >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4" />}
                            <span className="sr-only">Delete post</span>
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                             <AlertDialogTitle className="flex items-center gap-2">
                                 <AlertTriangle className="text-destructive"/> Are you sure?
                             </AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete your post
                                and all its comments.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                             <AlertDialogAction
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={cn(buttonVariants({ variant: "destructive" }))} // Use cn with buttonVariants
                            >
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Delete Post
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                 </AlertDialog>
             )}
          </CardHeader>

          <CardContent className="p-5 space-y-4">
             {post.text && (
               <p className="text-base text-foreground whitespace-pre-wrap break-words">{post.text}</p>
             )}

             {post.imageUrl && (
               <div className="relative aspect-video w-full rounded-lg overflow-hidden border shadow-inner">
                 <Image
                   src={post.imageUrl}
                   alt={post.text ? `Image for post: ${post.text.substring(0,30)}...` : "Post image"}
                   fill
                   style={{ objectFit: 'cover' }}
                   className="bg-muted"
                   data-ai-hint="user post image"
                   sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 60vw"
                 />
               </div>
             )}

             {post.videoUrl && (
                <div className="aspect-video w-full rounded-lg overflow-hidden border bg-black shadow-inner">
                     <video
                        src={post.videoUrl}
                        controls
                        className="w-full h-full object-contain bg-black"
                        preload="metadata"
                        data-ai-hint="user post video"
                        title={post.text ? `Video for post: ${post.text.substring(0,30)}...` : "Post video"}
                     >
                        Your browser does not support the video tag. <a href={post.videoUrl} target="_blank" rel="noopener noreferrer">Watch video</a>
                    </video>
                </div>
             )}

             {!post.text && !post.imageUrl && !post.videoUrl && (
                  <p className="text-sm text-muted-foreground italic">[Empty post]</p>
              )}

          </CardContent>

          <CardFooter className="p-3 border-t flex justify-between items-center bg-muted/20">
              <div className="flex items-center gap-4">
                  {/* Like Button */}
                  <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive px-2"
                      onClick={handleLikeToggle}
                      disabled={!user || isLiking}
                      aria-pressed={isLiked}
                  >
                      <Heart className={cn("h-4 w-4 transition-colors duration-200", isLiked ? "fill-destructive text-destructive" : "text-muted-foreground")} />
                      <span className="text-xs font-medium">{likeCount}</span>
                      <span className="sr-only">{isLiked ? 'Unlike' : 'Like'} post</span>
                  </Button>

                  {/* Comment Button */}
                   <Button
                       variant="ghost"
                       size="sm"
                       className="flex items-center gap-1.5 text-muted-foreground hover:text-primary px-2"
                       onClick={toggleCommentSection}
                       aria-expanded={showComments}
                   >
                       <MessageCircle className="h-4 w-4" />
                       <span className="text-xs font-medium">{post.commentCount ?? 0}</span>
                       <span className="sr-only">View comments</span>
                   </Button>
              </div>

              {/* Placeholder for share or other actions */}
               {/* <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                   <Share2 className="h-4 w-4" />
                   <span className="sr-only">Share post</span>
               </Button> */}
          </CardFooter>

           {/* Comment Section (Conditionally Rendered with Animation) */}
          <AnimatePresence>
             {showComments && (
                 <motion.div
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     exit={{ opacity: 0, height: 0 }}
                     transition={{ duration: 0.3, ease: "easeInOut" }}
                     className="overflow-hidden border-t"
                 >
                     <CommentSection postId={post.id} onCommentAdded={onCommentAdded} />
                 </motion.div>
             )}
          </AnimatePresence>

        </Card>
     </motion.div>
  );
}
