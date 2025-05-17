
'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, type Unsubscribe } from 'firebase/firestore';
import { addComment, type CommentInput } from '@/lib/posts.service';
import type { CommentSerializable } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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
    const commentsEndRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [comments]);


    React.useEffect(() => {
        if (!postId || !db) return;

        setLoadingComments(true);
        const commentsQuery = query(
            collection(db, 'posts', postId, 'comments'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe: Unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
            const fetchedComments: CommentSerializable[] = snapshot.docs.map(doc => {
                const data = doc.data();
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
            onCommentAdded?.(postId, fetchedComments.length); // Update parent with fetched count
        }, (error) => {
            console.error("Error fetching comments:", error);
            toast({ title: "Error", description: "Could not load comments.", variant: "destructive" });
            setLoadingComments(false);
        });

        return () => unsubscribe();

    }, [postId, toast, onCommentAdded]);

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

         const tempCommentId = `temp_${Date.now()}`;
         const tempComment: CommentSerializable = {
             ...commentInput,
             id: tempCommentId,
             timestamp: new Date().toISOString(),
         };
         setComments(prev => [...prev, tempComment]);
         const newOptimisticCount = comments.length + 1;
         onCommentAdded?.(postId, newOptimisticCount); // Optimistic update for parent
         setCommentText('');

        try {
            const newCommentId = await addComment(commentInput);
            // No need to update temp comment ID, listener will fetch the real one
        } catch (error: any) {
            console.error("Error adding comment:", error);
            toast({
                title: "Comment Failed",
                description: `Could not add comment: ${error.message}`,
                variant: "destructive",
            });
             setComments(prev => prev.filter(c => c.id !== tempCommentId));
             onCommentAdded?.(postId, comments.length -1 < 0 ? 0 : comments.length -1); // Revert parent count
             setCommentText(commentInput.text);
        } finally {
            setIsSubmitting(false);
            inputRef.current?.focus(); // Keep focus on input
        }
    };

    return (
        <div className="px-3 sm:px-4 py-2 space-y-3 bg-background border-t">
            <div className={cn("space-y-2.5 max-h-48 overflow-y-auto pr-2", comments.length > 3 && "pb-2")}>
                {loadingComments && (
                    <div className="space-y-2.5 py-2">
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-8 w-1/2" />
                    </div>
                )}
                {!loadingComments && comments.length === 0 && (
                     <p className="text-xs text-center text-muted-foreground italic py-3">No comments yet.</p>
                )}
                {!loadingComments && comments.map(comment => (
                    <div key={comment.id} className="flex items-start gap-2 text-xs sm:text-sm">
                        <Avatar className="h-6 w-6 sm:h-7 sm:w-7 mt-0.5 border flex-shrink-0">
                            <AvatarImage src={comment.photoURL || undefined} alt={comment.displayName || 'User'} data-ai-hint="comment user avatar"/>
                            <AvatarFallback className="text-[10px] sm:text-xs">{getInitials(comment.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <span className="font-medium text-card-foreground mr-1.5">{comment.displayName || 'User'}</span>
                            <span className="text-card-foreground break-words">{comment.text}</span>
                             <p className="text-xs text-muted-foreground mt-0.5">
                                {formatCommentTimestamp(comment.timestamp)}
                             </p>
                        </div>
                    </div>
                ))}
                <div ref={commentsEndRef} />
            </div>

            {user && (
                <form className="flex items-center gap-2 pt-2 border-t" onSubmit={handleCommentSubmit}>
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8 border flex-shrink-0">
                        <AvatarImage src={user.photoURL || undefined} alt="My Avatar" data-ai-hint="current user comment avatar"/>
                        <AvatarFallback className="text-xs">{getInitials(user.displayName)}</AvatarFallback>
                    </Avatar>
                    <Input
                        ref={inputRef}
                        placeholder="Add a comment..."
                        className="flex-1 h-8 sm:h-9 text-xs sm:text-sm bg-muted/50 focus:bg-background"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        disabled={isSubmitting}
                    />
                    <Button type="submit" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0" disabled={!commentText.trim() || isSubmitting}>
                         {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                         <span className="sr-only">Send comment</span>
                    </Button>
                </form>
            )}
        </div>
    );
};
