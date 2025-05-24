
'use client';

import * as React from 'react';
import type { PostSerializable } from '@/types';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from 'next/image';
import { cn, resolveMediaUrl, getInitials, getYouTubeVideoId } from '@/lib/utils'; // Added getYouTubeVideoId
import { Heart, MessageCircle, Send, Bookmark, Trash2, AlertTriangle, Loader2, MoreHorizontal } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { likePost, unlikePost, deletePost } from '@/lib/posts.service';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from "framer-motion";
import { CommentSection } from './comment-section';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle as AlertDialogTitleComponent,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from '../ui/separator';

interface PostCardProps {
  post: PostSerializable;
  onLikeChange?: (postId: string, liked: boolean, newLikeCount: number) => void;
  onCommentAdded?: (postId: string, newCommentCount: number) => void;
  onPostDeleted?: (postId: string) => void;
}

const formatTimestampForPost = (timestampISO: string | null | undefined): string => {
    if (!timestampISO) {
        return 'JUST NOW'; 
    }
    try {
        const date = parseISO(timestampISO);
        return formatDistanceToNowStrict(date, { addSuffix: true }).toUpperCase();
    } catch (error) {
        console.error("Error formatting ISO timestamp:", error, timestampISO);
        return 'INVALID DATE';
    }
};


const renderTextWithTags = (text: string | null | undefined) => {
    if (!text) return null;
    const tagMentionRegex = /(#\w+)|(@\w+)/g;
    const parts = text.split(tagMentionRegex).filter(part => part !== undefined);

    return parts.map((part, index) => {
        if (part?.startsWith('#')) {
            return (
                <span key={index} className="text-primary hover:underline cursor-pointer">
                    {part}
                </span>
            );
        } else if (part?.startsWith('@')) {
            return (
                <span key={index} className="text-primary font-semibold hover:underline cursor-pointer">
                    {part}
                </span>
            );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
    });
};


export function PostCard({ post, onLikeChange, onCommentAdded, onPostDeleted }: PostCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLiked, setIsLiked] = React.useState(post.likedBy?.includes(user?.uid ?? '') ?? false);
  const [likeCount, setLikeCount] = React.useState(post.likeCount ?? 0);
  const [isLiking, setIsLiking] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [showComments, setShowComments] = React.useState(false);
  const [currentCommentCount, setCurrentCommentCount] = React.useState(post.commentCount ?? 0);

  const isOwner = user?.uid === post.uid;

  const resolvedImageUrl = resolveMediaUrl(post.imageUrl);
  const resolvedVideoUrl = resolveMediaUrl(post.videoUrl);
  const youtubeVideoId = getYouTubeVideoId(resolvedVideoUrl); // Get YouTube ID

  React.useEffect(() => {
     setIsLiked(post.likedBy?.includes(user?.uid ?? '') ?? false);
     setLikeCount(post.likeCount ?? 0);
     setCurrentCommentCount(post.commentCount ?? 0);
  }, [post.likedBy, post.likeCount, post.commentCount, user?.uid]);

  const handleLikeToggle = async () => {
    if (!user || isLiking) return;
    setIsLiking(true);
    const currentlyLiked = isLiked;
    const newLikeState = !currentlyLiked;
    const newLikeCount = currentlyLiked ? likeCount - 1 : likeCount + 1;

    setIsLiked(newLikeState);
    setLikeCount(newLikeCount);
    onLikeChange?.(post.id, newLikeState, newLikeCount);

    try {
      if (newLikeState) {
        await likePost(post.id, user.uid);
      } else {
        await unlikePost(post.id, user.uid);
      }
    } catch (error: any) {
      console.error("Error liking/unliking post:", error);
      toast({
        title: "Error",
        description: `Could not ${currentlyLiked ? 'unlike' : 'like'} post. ${error.message}`,
        variant: "destructive",
      });
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
     onPostDeleted?.(post.id);

     try {
         await deletePost(post.id, user.uid);
         toast({ title: "Post Deleted", description: "Your post has been successfully removed." });
     } catch (error: any) {
         console.error("Error deleting post:", error);
         toast({
             title: "Deletion Failed",
             description: error.message || "Could not delete the post. Please try again.",
             variant: "destructive",
         });
         setIsDeleting(false);
     }
  };


  const toggleCommentSection = () => {
     setShowComments(prev => !prev);
  };

  const handleCommentAddedInternal = (postId: string, newTotalComments: number) => {
      setCurrentCommentCount(newTotalComments); 
      onCommentAdded?.(postId, newTotalComments); 
  };


  return (
     <motion.div
         initial={{ opacity: 0, y: 20 }}
         animate={{ opacity: 1, y: 0 }}
         exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
         transition={{ duration: 0.3 }}
         layout
     >
        <Card className="w-full shadow-md rounded-none sm:rounded-lg overflow-hidden border-x-0 sm:border-x sm:border-y border-border/50 bg-card">
          <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4">
            <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border">
                  <AvatarImage src={post.photoURL || undefined} alt={post.displayName || 'User Avatar'} data-ai-hint="user post avatar"/>
                  <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                     {getInitials(post.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold text-sm text-card-foreground leading-tight truncate">
                    {post.displayName || 'Anonymous User'}
                </span>
            </div>
            {isOwner && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                         <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-7 w-7 sm:h-8 sm:w-8"
                            disabled={isDeleting}
                         >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <MoreHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />}
                            <span className="sr-only">Post options</span>
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                             <AlertDialogTitleComponent className="flex items-center gap-2">
                                 <AlertTriangle className="text-destructive"/> Confirm Deletion
                             </AlertDialogTitleComponent>
                            <AlertDialogDescription>
                                Are you sure you want to delete this post permanently? This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                             <AlertDialogAction
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={cn(buttonVariants({ variant: "destructive" }))}
                            >
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Delete Post
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                 </AlertDialog>
             )}
             {!isOwner && ( 
                <Button variant="ghost" size="icon" className="text-muted-foreground h-7 w-7 sm:h-8 sm:w-8 invisible">
                    <MoreHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
             )}
          </CardHeader>

          { (resolvedImageUrl || resolvedVideoUrl) && (
            <div className="relative w-full bg-black aspect-square sm:aspect-auto sm:min-h-[300px] max-h-[75vh] overflow-hidden">
             {youtubeVideoId ? (
                <iframe
                    className="w-full h-full aspect-video"
                    src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=0&modestbranding=1&rel=0`}
                    title={post.text ? `YouTube video: ${post.text.substring(0,30)}...` : "YouTube video"}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    data-ai-hint="youtube video embed"
                ></iframe>
             ) : resolvedImageUrl ? (
                 <Image
                   src={resolvedImageUrl}
                   alt={post.text ? `Image for post: ${post.text.substring(0,30)}...` : "Post image"}
                   fill
                   style={{ objectFit: 'contain' }} 
                   className="bg-black" 
                   data-ai-hint="user post image"
                   sizes="(max-width: 640px) 100vw, 50vw" 
                 />
             ) : resolvedVideoUrl && ( // Standard video, not YouTube
                 <video
                    src={resolvedVideoUrl}
                    controls
                    className="w-full h-full object-contain bg-black"
                    preload="metadata"
                    data-ai-hint="user post video"
                    title={post.text ? `Video for post: ${post.text.substring(0,30)}...` : "Post video"}
                 >
                    Your browser does not support the video tag. <a href={resolvedVideoUrl} target="_blank" rel="noopener noreferrer">Watch video</a>
                </video>
             )}
            </div>
          )}
           {!resolvedImageUrl && !resolvedVideoUrl && !post.text && (
               <CardContent className="p-4 text-center text-muted-foreground italic">
                 [Empty post content]
               </CardContent>
           )}


          <div className="p-3 sm:p-4 space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 sm:gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-8 w-8 sm:h-9 sm:w-9"
                        onClick={handleLikeToggle}
                        disabled={!user || isLiking}
                        aria-pressed={isLiked}
                    >
                        <Heart className={cn("h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-200", isLiked ? "fill-destructive text-destructive" : "text-muted-foreground")} />
                        <span className="sr-only">{isLiked ? 'Unlike' : 'Like'}</span>
                    </Button>
                    <Button
                       variant="ghost"
                       size="icon"
                       className="text-muted-foreground hover:text-primary h-8 w-8 sm:h-9 sm:w-9"
                       onClick={toggleCommentSection}
                       aria-expanded={showComments}
                   >
                       <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                       <span className="sr-only">Comment</span>
                   </Button>
                   <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8 sm:h-9 sm:w-9" onClick={() => toast({title: "Share: Coming Soon!"})}>
                       <Send className="h-5 w-5 sm:h-6 sm:w-6" />
                       <span className="sr-only">Share</span>
                   </Button>
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8 sm:h-9 sm:w-9" onClick={() => toast({title: "Save: Coming Soon!"})}>
                   <Bookmark className="h-5 w-5 sm:h-6 sm:w-6" />
                   <span className="sr-only">Save</span>
                </Button>
            </div>

            {likeCount > 0 && (
                <p className="text-sm font-semibold text-card-foreground px-1">
                    {likeCount} {likeCount === 1 ? 'like' : 'likes'}
                </p>
            )}

            {post.text && (
              <div className="px-1 text-sm text-card-foreground">
                <span className="font-semibold hover:underline cursor-pointer">{post.displayName || 'User'}</span>
                <span className="whitespace-pre-wrap break-words"> {renderTextWithTags(post.text)}</span>
              </div>
            )}

            {currentCommentCount > 0 && !showComments && (
                <button
                    onClick={toggleCommentSection}
                    className="px-1 text-sm text-muted-foreground hover:text-card-foreground cursor-pointer"
                >
                    View all {currentCommentCount} comments
                </button>
            )}
             {!showComments && user && (
                 <p
                    className="px-1 text-sm text-muted-foreground cursor-pointer hover:text-card-foreground"
                    onClick={toggleCommentSection}
                 >
                     Add a comment...
                 </p>
             )}

            <p className="px-1 text-xs text-muted-foreground uppercase tracking-wide">
                {formatTimestampForPost(post.timestamp)}
            </p>
          </div>

          <AnimatePresence>
             {showComments && (
                 <motion.div
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     exit={{ opacity: 0, height: 0 }}
                     transition={{ duration: 0.3, ease: "easeInOut" }}
                     className="overflow-hidden border-t"
                 >
                     <CommentSection postId={post.id} onCommentAdded={handleCommentAddedInternal} />
                 </motion.div>
             )}
          </AnimatePresence>

        </Card>
     </motion.div>
  );
}
