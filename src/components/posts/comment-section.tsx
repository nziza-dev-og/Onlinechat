
'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, type Unsubscribe } from 'firebase/firestore';
import { addComment, type CommentInput } from '@/lib/posts.service'; // Import service
import type { Comment, CommentSerializable } from '@/types'; // Import types
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

// Helper to get initials
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

// Format timestamp for comments
const formatCommentTimestamp = (timestampISO: string | null | undefined): string => {
    if (!timestampISO) return 'just now';
    try {
        const date = parseISO(timestampISO);
        return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch {
        return 'Invalid date';
    }
};

interface CommentSectionProps {
    postId: string;
    onCommentAdded?: (postId: string, newCommentCount: number) => void;
}

export const CommentSection = ({ postId, onCommentAdded }: CommentSectionProps) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [comments, setComments] = React.useState<CommentSerializable[]>([]);
    const [loadingComments, setLoadingComments] = React.useState(true);
    const [commentText, setCommentText] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const commentsEndRef = React.useRef<HTMLDivElement>(null); // Ref for scrolling

    // Scroll to bottom when new comments are added
    const scrollToBottom = () => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [comments]); // Scroll when comments state changes


    // Fetch comments
    React.useEffect(() => {
        if (!postId || !db) return;

        setLoadingComments(true);
        const commentsQuery = query(
            collection(db, 'posts', postId, 'comments'),
            orderBy('timestamp', 'asc') // Oldest first
        );

        const unsubscribe: Unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
            const fetchedComments: CommentSerializable[] = snapshot.docs.map(doc => {
                const data = doc.data();
                // Basic validation
                if (!data.uid || !(data.timestamp instanceof Timestamp)) {
                    console.warn("Skipping invalid comment document:", doc.id, data);
                    return null;
                }
                return {
                    id: doc.id,
                    postId: postId,
                    uid: data.uid,
                    displayName: data.displayName ?? null,
                    photoURL: data.photoURL ?? null,
                    text: data.text ?? '',
                    timestamp: data.timestamp.toDate().toISOString(),
                };
            }).filter((comment): comment is CommentSerializable => comment !== null);

            setComments(fetchedComments);
            setLoadingComments(false);
        }, (error) => {
            console.error("Error fetching comments:", error);
            toast({ title: "Error", description: "Could not load comments.", variant: "destructive" });
            setLoadingComments(false);
        });

        return () => unsubscribe(); // Cleanup listener

    }, [postId, toast]);

    // Handle comment submission
    const handleCommentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !commentText.trim() || isSubmitting) return;

        setIsSubmitting(true);
        const commentInput: CommentInput = {
            postId: postId,
            uid: user.uid,
            displayName: user.displayName,
            photoURL: user.photoURL,
            text: commentText.trim(),
        };

         // Optimistic UI Update
         const tempCommentId = `temp_${Date.now()}`;
         const tempComment: CommentSerializable = {
             ...commentInput,
             id: tempCommentId,
             timestamp: new Date().toISOString(),
         };
         setComments(prev => [...prev, tempComment]);
         setCommentText(''); // Clear input immediately

        try {
            const newCommentId = await addComment(commentInput);
            // Update the temporary comment with the real ID (optional, if needed later)
            // setComments(prev => prev.map(c => c.id === tempCommentId ? { ...c, id: newCommentId } : c));

             // Call the callback to update parent's comment count
             onCommentAdded?.(postId, comments.length + 1); // Use the pre-update length + 1

        } catch (error: any) {
            console.error("Error adding comment:", error);
            toast({
                title: "Comment Failed",
                description: `Could not add comment: ${error.message}`,
                variant: "destructive",
            });
             // Revert optimistic update on error
             setComments(prev => prev.filter(c => c.id !== tempCommentId));
             setCommentText(commentInput.text); // Restore input text
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-4 space-y-3 bg-background border-t">
             {/* Comment List */}
            <div className="space-y-3 max-h-60 overflow-y-auto p-1 pr-3"> {/* Add padding-right */}
                {loadingComments && (
                    <div className="space-y-3">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                )}
                {!loadingComments && comments.length === 0 && (
                     <p className="text-xs text-center text-muted-foreground italic pt-2">No comments yet. Be the first!</p>
                )}
                {!loadingComments && comments.map(comment => (
                    <div key={comment.id} className="flex items-start gap-2.5 text-sm">
                        <Avatar className="h-7 w-7 mt-0.5 border">
                            <AvatarImage src={comment.photoURL || undefined} alt={comment.displayName || 'User'} data-ai-hint="comment user avatar"/>
                            <AvatarFallback className="text-xs">{getInitials(comment.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 bg-muted/50 px-3 py-2 rounded-md">
                            <div className="flex items-baseline justify-between mb-0.5">
                                <span className="font-medium text-foreground text-xs">{comment.displayName || 'User'}</span>
                                <span className="text-xs text-muted-foreground">{formatCommentTimestamp(comment.timestamp)}</span>
                            </div>
                            <p className="text-foreground break-words">{comment.text}</p>
                        </div>
                    </div>
                ))}
                <div ref={commentsEndRef} /> {/* Element to scroll to */}
            </div>

            {/* Comment Input Form */}
            {user && (
                <form className="flex items-center gap-2 pt-3 border-t" onSubmit={handleCommentSubmit}>
                    <Avatar className="h-8 w-8 border">
                        <AvatarImage src={user.photoURL || undefined} alt="My Avatar" data-ai-hint="current user comment avatar"/>
                        <AvatarFallback className="text-xs">{getInitials(user.displayName)}</AvatarFallback>
                    </Avatar>
                    <Input
                        placeholder="Add a comment..."
                        className="flex-1 h-9 text-sm"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        disabled={isSubmitting}
                    />
                    <Button type="submit" size="icon" className="h-9 w-9" disabled={!commentText.trim() || isSubmitting}>
                         {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                         <span className="sr-only">Send comment</span>
                    </Button>
                </form>
            )}
        </div>
    );
};
