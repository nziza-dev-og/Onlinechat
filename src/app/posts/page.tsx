
"use client";

import * as React from 'react';
import { PostForm } from '@/components/posts/post-form';
import { PostCard } from '@/components/posts/post-card';
import { fetchPosts } from '@/lib/posts.service';
// Import both types, use PostSerializable for state and fetched data
import type { Post, PostSerializable } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, MessageSquarePlus, Frown } from 'lucide-react'; // Added Frown
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function PostsPage() {
  // State now holds PostSerializable objects
  const [posts, setPosts] = React.useState<PostSerializable[]>([]);
  const [loadingPosts, setLoadingPosts] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  // Fetch posts on component mount
  React.useEffect(() => {
    const loadPosts = async () => {
      setLoadingPosts(true);
      setError(null);
      try {
        // fetchPosts now returns PostSerializable[]
        const fetchedPosts = await fetchPosts(50); // Fetch latest 50 posts
        setPosts(fetchedPosts);
      } catch (err: any) {
        console.error("Error loading posts:", err);
        setError(err.message || "Failed to load posts. Please try again.");
      } finally {
        setLoadingPosts(false);
      }
    };

    loadPosts();
  }, []); // Empty dependency array means this runs once on mount

  // Handler for optimistic updates when a new post is added via the form
  // The form callback provides a temporary Post object with a Date timestamp
  const handleNewPost = (newPost: Post) => {
     // Convert the temporary Post object to PostSerializable before adding to state
     const serializablePost: PostSerializable = {
       ...newPost,
       // Convert the Date timestamp to ISO string for consistency
       timestamp: (newPost.timestamp instanceof Date ? newPost.timestamp : new Date()).toISOString()
     };

     // Add the serializable post to the top of the list
     setPosts(prevPosts => [serializablePost, ...prevPosts]);
  };


  return (
    <div className="flex flex-col items-center min-h-screen bg-secondary py-8 px-4"> {/* Center content */}
      <div className="w-full max-w-2xl"> {/* Max width container */}

        {/* Page Title and Description */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Community Feed</h1>
          <p className="text-muted-foreground mt-2">See what others are sharing</p>
        </div>

        {/* Post Form (Only show if logged in) */}
        {authLoading ? (
          <Card className="w-full shadow-lg mb-8 border border-border/50 bg-card"> {/* Increased mb */}
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
          // Pass the original handleNewPost which expects a Post object
          <PostForm onPostAdded={handleNewPost} />
        ) : (
          <Card className="w-full shadow-md mb-8 text-center border-dashed border-primary/60 bg-primary/10 p-6"> {/* Increased mb and padding */}
              <CardHeader className="p-0"> {/* Remove padding */}
                  <CardTitle className="text-xl font-semibold">Log in to Post</CardTitle>
                  <CardDescription className="mt-1">Join the conversation by logging in or creating an account.</CardDescription>
                  {/* Optionally add login button/link here */}
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
                        <Skeleton className="h-10 w-10 rounded-full" /> {/* Slightly larger avatar skeleton */}
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
              {/* Add a retry button? */}
               {/* <CardFooter>
                   <Button variant="destructive" onClick={loadPosts}>Retry</Button>
               </CardFooter> */}
            </Card>
          )}

          {/* Empty State */}
          {!loadingPosts && !error && posts.length === 0 && (
            <Card className="w-full text-center border-dashed border-border/70 bg-card shadow-sm py-10">
              <CardHeader>
                  <MessageSquarePlus className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <CardTitle className="text-xl font-semibold">No Posts Yet</CardTitle>
                  <CardDescription>Be the first one to share something!</CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Display Posts - Pass PostSerializable objects to PostCard */}
          {!loadingPosts && !error && posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </div>
  );
}
