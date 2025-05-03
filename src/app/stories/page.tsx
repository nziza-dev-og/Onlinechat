
"use client";

import * as React from 'react';
import { StoryForm } from '@/components/stories/story-form'; // Component to add stories
import { StoryViewer } from '@/components/stories/story-viewer'; // Component to view stories
import { fetchPosts } from '@/lib/posts.service'; // Reuse fetchPosts
import type { Post, PostSerializable } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Film, Frown } from 'lucide-react'; // Use Film icon for stories
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function StoriesPage() {
  const [stories, setStories] = React.useState<PostSerializable[]>([]);
  const [loadingStories, setLoadingStories] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const initialLoadComplete = React.useRef(false); // Track initial load

  const loadStories = React.useCallback(async () => {
    if (!initialLoadComplete.current) {
        setLoadingStories(true);
    }
    setError(null);
    try {
      // Fetch all posts/stories initially
      const fetchedItems = await fetchPosts(50); // Fetch recent items
      // Filter to show only stories on this page
      const filteredStories = fetchedItems.filter(item => item.type === 'story');
      setStories(filteredStories);
      initialLoadComplete.current = true;
    } catch (err: any) {
      console.error("Error loading stories:", err);
      setError(err.message || "Failed to load stories. Please try again.");
    } finally {
      setLoadingStories(false);
    }
  }, []);

  React.useEffect(() => {
    loadStories();
    // Stories might not need frequent refreshing like posts, adjust as needed
    // const intervalId = setInterval(loadStories, 15 * 60 * 1000); // Refresh every 15 minutes?
    // return () => clearInterval(intervalId);
  }, [loadStories]);

  // Handles stories added via the StoryForm
  const handleNewStoryAdded = (newStory: Post) => {
     const serializableStory: PostSerializable = {
       ...newStory,
       timestamp: (newStory.timestamp instanceof Date ? newStory.timestamp : new Date()).toISOString(),
       type: 'story', // Ensure type is set
       // Stories might not have likes/comments initially
       likeCount: 0,
       likedBy: [],
       commentCount: 0,
     };
     // Add to the beginning of the stories list
     setStories(prevStories => [serializableStory, ...prevStories]);
  };

   // Note: Story deletion might be handled differently (e.g., automatic expiry)
   // or you might add a delete handler similar to posts if needed.

  return (
    <div className="flex flex-col items-center min-h-screen bg-secondary py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Stories</h1>
          <p className="text-muted-foreground mt-2">View recent stories from the community (typically visible for 8 hours).</p>
        </div>

        {/* Story Form (Only show if logged in) */}
        {authLoading ? (
           <Card className="w-full shadow-lg mb-8 border border-border/50 bg-card">
               <CardHeader>
                   <Skeleton className="h-6 w-3/5 mb-2" />
                   <Skeleton className="h-4 w-4/5" />
               </CardHeader>
               <CardContent>
                   <Skeleton className="h-16 w-full" /> {/* Shorter than post text area */}
               </CardContent>
               <CardFooter className="flex justify-end">
                   <Skeleton className="h-10 w-28" />
               </CardFooter>
           </Card>
        ) : user ? (
          <StoryForm onStoryAdded={handleNewStoryAdded} />
        ) : (
          <Card className="w-full shadow-md mb-8 text-center border-dashed border-primary/60 bg-primary/10 p-6">
              <CardHeader className="p-0">
                  <CardTitle className="text-xl font-semibold">Log in to Share a Story</CardTitle>
                  <CardDescription className="mt-1">Join the conversation by logging in or creating an account.</CardDescription>
              </CardHeader>
          </Card>
        )}

        <Separator className="my-8"/>

        {/* Stories Feed/Viewer */}
        <div className="space-y-6">
          {/* Loading State */}
          {loadingStories && (
            <div className="space-y-6">
               {/* Add appropriate skeleton for how stories might look */}
               <Skeleton className="h-40 w-full rounded-lg bg-muted" />
               <Skeleton className="h-40 w-full rounded-lg bg-muted" />
            </div>
          )}

          {/* Error State */}
          {!loadingStories && error && (
            <Card className="w-full border-destructive bg-destructive/10 text-destructive-foreground shadow-md">
              <CardHeader className="flex flex-row items-center gap-3">
                  <Frown className="h-6 w-6" />
                  <div>
                    <CardTitle className="text-lg">Error Loading Stories</CardTitle>
                    <CardDescription className="text-destructive-foreground/80">{error}</CardDescription>
                  </div>
              </CardHeader>
              <CardFooter>
                   <Button variant="destructive" onClick={loadStories}>Retry</Button>
              </CardFooter>
            </Card>
          )}

          {/* Empty State */}
           {!loadingStories && !error && stories.length === 0 && initialLoadComplete.current && (
            <Card className="w-full text-center border-dashed border-border/70 bg-card shadow-sm py-10">
              <CardHeader>
                  <Film className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <CardTitle className="text-xl font-semibold">No Stories Yet</CardTitle>
                  <CardDescription>Be the first one to share a story!</CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Display Stories */}
          {/* You might use a different component like StoryViewer here */}
          {!loadingStories && !error && stories.length > 0 && (
             <StoryViewer stories={stories} />
             /* Or map through stories and render them differently:
             stories.map((story) => (
                 <div key={story.id}> Render story representation </div>
             ))
             */
          )}
        </div>
      </div>
    </div>
  );
}
