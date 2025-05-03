
"use client";

import * as React from 'react';
import { PostForm } from '@/components/posts/post-form';
import { PostCard } from '@/components/posts/post-card';
import { fetchPosts } from '@/lib/posts.service';
import type { Post } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Added CardContent here
import { Separator } from '@/components/ui/separator';

export default function PostsPage() {
  const [posts, setPosts] = React.useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  // Fetch posts on component mount
  React.useEffect(() => {
    const loadPosts = async () => {
      setLoadingPosts(true);
      setError(null);
      try {
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
  const handleNewPost = (newPost: Post) => {
     // Add the new post to the top of the list optimistically
     setPosts(prevPosts => [
        {
           ...newPost,
           // Ensure timestamp is a Date object for immediate rendering,
           // even though Firestore will store it as Timestamp
           timestamp: newPost.timestamp instanceof Date ? newPost.timestamp : (newPost.timestamp as any).toDate()
        } as Post,
        ...prevPosts
      ]);
  };


  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">

       {/* Page Title and Description */}
       <div className="mb-8 text-center">
         <h1 className="text-3xl font-bold tracking-tight text-foreground">Community Feed</h1>
         <p className="text-muted-foreground mt-1">See what others are sharing</p>
       </div>


      {/* Post Form (Only show if logged in) */}
      {authLoading ? (
         <Card className="w-full shadow-md mb-6">
             <CardHeader>
                 <Skeleton className="h-6 w-1/2 mb-2" />
                 <Skeleton className="h-4 w-3/4" />
             </CardHeader>
             <CardContent>
                 <Skeleton className="h-20 w-full" />
             </CardContent>
             <CardFooter className="flex justify-end">
                 <Skeleton className="h-10 w-24" />
             </CardFooter>
         </Card>
      ) : user ? (
        <PostForm onPostAdded={handleNewPost} />
      ) : (
         <Card className="w-full shadow-md mb-6 text-center border-dashed border-primary/50 bg-primary/10">
            <CardHeader>
                <CardTitle>Log in to Post</CardTitle>
                 <CardDescription>Join the conversation by logging in or creating an account.</CardDescription>
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
               <Card key={i} className="w-full shadow-md overflow-hidden">
                   <CardHeader className="flex flex-row items-center gap-3 p-4 border-b">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                   </CardHeader>
                   <CardContent className="p-4 space-y-3">
                       <Skeleton className="h-4 w-full" />
                       <Skeleton className="h-4 w-5/6" />
                       <Skeleton className="aspect-video w-full rounded-lg" />
                   </CardContent>
               </Card>
            ))}
          </div>
        )}

        {/* Error State */}
        {!loadingPosts && error && (
          <Card className="w-full border-destructive bg-destructive/10 text-destructive-foreground">
             <CardHeader>
                <CardTitle>Error Loading Posts</CardTitle>
                <CardDescription>{error}</CardDescription>
                {/* Add a retry button? */}
             </CardHeader>
          </Card>
        )}

        {/* Empty State */}
        {!loadingPosts && !error && posts.length === 0 && (
           <Card className="w-full text-center border-dashed">
             <CardHeader>
                 <MessageSquarePlus className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                 <CardTitle>No Posts Yet</CardTitle>
                 <CardDescription>Be the first one to share something!</CardDescription>
             </CardHeader>
           </Card>
        )}

        {/* Display Posts */}
        {!loadingPosts && !error && posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}

