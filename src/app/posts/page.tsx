
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Corrected import
import { Separator } from '@/components/ui/separator';
import { AnimatePresence } from 'framer-motion'; // Import for exit animations

export default function PostsPage() {
  const [posts, setPosts] = React.useState<PostSerializable[]>([]);
  const [loadingPosts, setLoadingPosts] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const initialLoadComplete = React.useRef(false); // Track initial load

  const loadPosts = React.useCallback(async () => {
    if (!initialLoadComplete.current) {
        setLoadingPosts(true);
    }
    setError(null);
    try {
      // Fetch all posts/stories initially
      const fetchedItems = await fetchPosts(50);
      // Filter to show only posts on this page
      const filteredPosts = fetchedItems.filter(item => item.type === 'post');
      setPosts(filteredPosts);
      initialLoadComplete.current = true;
    } catch (err: any) {
      console.error("Error loading posts:", err);
      setError(err.message || "Failed to load posts. Please try again.");
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  React.useEffect(() => {
    loadPosts();
    const intervalId = setInterval(loadPosts, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(intervalId);
  }, [loadPosts]);

  // Handles both Posts and Stories added via the form (assuming form is updated)
  const handleNewItemAdded = (newItem: Post) => {
     const serializableItem: PostSerializable = {
       ...newItem,
       timestamp: (newItem.timestamp instanceof Date ? newItem.timestamp : new Date()).toISOString(),
       likeCount: 0,
       likedBy: [],
       commentCount: 0,
       type: newItem.type || 'post', // Ensure type is set
     };
     // Only add to this page's state if it's a 'post'
     if (serializableItem.type === 'post') {
        setPosts(prevPosts => [serializableItem, ...prevPosts]);
     }
  };


  const handleLikeChange = (postId: string, liked: boolean, newLikeCount: number) => {
      setPosts(prevPosts =>
        prevPosts.map(post => {
          if (post.id === postId) {
            const updatedLikedBy = liked
              ? [...(post.likedBy ?? []), user?.uid ?? '']
              : (post.likedBy ?? []).filter(uid => uid !== user?.uid);
            return { ...post, likeCount: newLikeCount, likedBy: updatedLikedBy.filter(Boolean) };
          }
          return post;
        })
      );
  };

   const handleCommentAdded = (postId: string, newCommentCount: number) => {
        setPosts(prevPosts =>
            prevPosts.map(post =>
                post.id === postId ? { ...post, commentCount: newCommentCount } : post
            )
        );
    };

   const handlePostDeleted = (postId: string) => {
       console.log(`Optimistically removing post ${postId} from UI.`);
       setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
   };

  return (
    // Adjusted padding and max-width for responsiveness
    <div className="flex flex-col items-center min-h-screen bg-secondary py-8 px-4 sm:px-6 lg:px-8">
      {/* Adjusted max-width */}
      <div className="w-full max-w-3xl">

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
          // Pass the updated handler to PostForm
          <PostForm onPostAdded={handleNewItemAdded} />
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
          {/* Loading State */}
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
           {!loadingPosts && !error && posts.length === 0 && initialLoadComplete.current && (
            <Card className="w-full text-center border-dashed border-border/70 bg-card shadow-sm py-10">
              <CardHeader>
                  <MessageSquarePlus className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <CardTitle className="text-xl font-semibold">No Posts Yet</CardTitle>
                  <CardDescription>Be the first one to share something!</CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Display Posts */}
           <AnimatePresence initial={false}>
              {!loadingPosts && !error && posts.map((post) => (
                <PostCard
                    key={post.id}
                    post={post}
                    onLikeChange={handleLikeChange}
                    onCommentAdded={handleCommentAdded}
                    onPostDeleted={handlePostDeleted}
                 />
              ))}
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
