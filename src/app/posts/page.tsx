
"use client";

import * as React from 'react';
import { PostForm } from '@/components/posts/post-form';
import { PostCard } from '@/components/posts/post-card';
import { fetchPosts } from '@/lib/posts.service';
import type { Post, PostSerializable } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, MessageSquarePlus, Frown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AnimatePresence } from 'framer-motion'; // Import for exit animations

export default function PostsPage() {
  const [posts, setPosts] = React.useState<PostSerializable[]>([]);
  const [loadingPosts, setLoadingPosts] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const initialLoadComplete = React.useRef(false); // Track initial load

  const loadPosts = React.useCallback(async () => {
    // Only show loading skeleton on initial load or manual refresh
    if (!initialLoadComplete.current) {
        setLoadingPosts(true);
    }
    setError(null);
    try {
      const fetchedPosts = await fetchPosts(50); // Fetch latest 50 posts (last 8 hours)
      setPosts(fetchedPosts);
      initialLoadComplete.current = true; // Mark initial load as complete
    } catch (err: any) {
      console.error("Error loading posts:", err);
      setError(err.message || "Failed to load posts. Please try again.");
    } finally {
      setLoadingPosts(false);
    }
  }, []); // useCallback depends on nothing, safe to memoize


  // Fetch posts on component mount
  React.useEffect(() => {
    loadPosts();

    // Set up interval to refresh posts periodically (e.g., every 5 minutes)
    // and clear old posts automatically based on the 8-hour filter in fetchPosts
    const intervalId = setInterval(loadPosts, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => clearInterval(intervalId); // Clean up interval on unmount
  }, [loadPosts]); // Depend on the memoized loadPosts function


  // Handler for optimistic updates when a new post is added
  const handleNewPost = (newPost: Post) => {
     const serializablePost: PostSerializable = {
       ...newPost,
       timestamp: (newPost.timestamp instanceof Date ? newPost.timestamp : new Date()).toISOString(),
       // Initialize counts for optimistic update
       likeCount: 0,
       likedBy: [],
       commentCount: 0,
     };
     setPosts(prevPosts => [serializablePost, ...prevPosts]);
  };

  // Handler for optimistic like/unlike updates
  const handleLikeChange = (postId: string, liked: boolean, newLikeCount: number) => {
      setPosts(prevPosts =>
        prevPosts.map(post => {
          if (post.id === postId) {
            // Update likeCount and likedBy array optimistically
            const updatedLikedBy = liked
              ? [...(post.likedBy ?? []), user?.uid ?? ''] // Add current user
              : (post.likedBy ?? []).filter(uid => uid !== user?.uid); // Remove current user
            return { ...post, likeCount: newLikeCount, likedBy: updatedLikedBy.filter(Boolean) }; // Filter out potential empty strings
          }
          return post;
        })
      );
  };

   // Handler for optimistic comment count updates
   const handleCommentAdded = (postId: string, newCommentCount: number) => {
        setPosts(prevPosts =>
            prevPosts.map(post =>
                post.id === postId ? { ...post, commentCount: newCommentCount } : post
            )
        );
    };

   // Handler for optimistic post deletion
   const handlePostDeleted = (postId: string) => {
       console.log(`Optimistically removing post ${postId} from UI.`);
       setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
   };

  return (
    <div className="flex flex-col items-center min-h-screen bg-secondary py-8 px-4">
      <div className="w-full max-w-2xl">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Community Feed</h1>
          <p className="text-muted-foreground mt-2">See what others are sharing (posts older than 8 hours are automatically removed)</p>
        </div>

        {/* Post Form (Only show if logged in) */}
        {authLoading ? (
           <Card className="w-full shadow-lg mb-8 border border-border/50 bg-card">
               <CardHeader>
                   <Skeleton className="h-6 w-3/5 mb-2" />
                   <Skeleton className="h-4 w-4/5" />
               </CardHeader>
               <CardContent>
                   <Skeleton className="h-24 w-full" />
               </CardContent>
               <CardFooter className="flex justify-end">
                   <Skeleton className="h-10 w-28" />
               </CardFooter>
           </Card>
        ) : user ? (
          <PostForm onPostAdded={handleNewPost} />
        ) : (
          <Card className="w-full shadow-md mb-8 text-center border-dashed border-primary/60 bg-primary/10 p-6">
              <CardHeader className="p-0">
                  <CardTitle className="text-xl font-semibold">Log in to Post</CardTitle>
                  <CardDescription className="mt-1">Join the conversation by logging in or creating an account.</CardDescription>
              </CardHeader>
          </Card>
        )}

        <Separator className="my-8"/>

        {/* Posts Feed */}
        <div className="space-y-6">
          {/* Loading State (Only show on initial load) */}
          {loadingPosts && (
            <div className="space-y-6">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="w-full shadow-md overflow-hidden border border-border/50 bg-card">
                    <CardHeader className="flex flex-row items-center gap-3 p-4 border-b">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-1/2" />
                          <Skeleton className="h-3 w-1/3" />
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6 mb-4" />
                        <Skeleton className="aspect-video w-full rounded-lg bg-muted/50" />
                    </CardContent>
                    <CardFooter className="p-3 border-t flex justify-between items-center bg-muted/20">
                        <div className="flex gap-4">
                          <Skeleton className="h-8 w-16" />
                          <Skeleton className="h-8 w-16" />
                        </div>
                    </CardFooter>
                </Card>
              ))}
            </div>
          )}

          {/* Error State */}
          {!loadingPosts && error && (
            <Card className="w-full border-destructive bg-destructive/10 text-destructive-foreground shadow-md">
              <CardHeader className="flex flex-row items-center gap-3">
                  <Frown className="h-6 w-6" />
                  <div>
                    <CardTitle className="text-lg">Error Loading Posts</CardTitle>
                    <CardDescription className="text-destructive-foreground/80">{error}</CardDescription>
                  </div>
              </CardHeader>
              <CardFooter>
                   <Button variant="destructive" onClick={loadPosts}>Retry</Button>
              </CardFooter>
            </Card>
          )}

          {/* Empty State */}
           {!loadingPosts && !error && posts.length === 0 && initialLoadComplete.current && ( // Only show empty state after initial load attempt
            <Card className="w-full text-center border-dashed border-border/70 bg-card shadow-sm py-10">
              <CardHeader>
                  <MessageSquarePlus className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <CardTitle className="text-xl font-semibold">No Posts Yet</CardTitle>
                  <CardDescription>Be the first one to share something!</CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Display Posts */}
           <AnimatePresence initial={false}> {/* Disable initial animation for existing items */}
              {!loadingPosts && !error && posts.map((post) => (
                <PostCard
                    key={post.id}
                    post={post}
                    onLikeChange={handleLikeChange}
                    onCommentAdded={handleCommentAdded}
                    onPostDeleted={handlePostDeleted} // Pass down delete handler
                 />
              ))}
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
