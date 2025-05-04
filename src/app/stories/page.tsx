
"use client";

import * as React from 'react';
import { StoryForm } from '@/components/stories/story-form';
import { StoryModalViewer } from '@/components/stories/story-viewer'; // Renamed import path
import { StoryPreviewCard } from '@/components/stories/story-preview-card'; // New component
import { fetchPosts } from '@/lib/posts.service';
import type { Post, PostSerializable, UserProfile } from '@/types'; // Added UserProfile
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Film, Frown, BookOpen } from 'lucide-react'; // Use Film/BookOpen icon
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'; // Import ScrollArea

// Helper to group stories by user ID
const groupStoriesByUser = (stories: PostSerializable[]): Record<string, PostSerializable[]> => {
    return stories.reduce((acc, story) => {
        if (!acc[story.uid]) {
            acc[story.uid] = [];
        }
        // Sort stories for each user by timestamp ascending (oldest first for viewing order)
        acc[story.uid].push(story);
        acc[story.uid].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return acc;
    }, {} as Record<string, PostSerializable[]>);
};

// Helper to get unique users from stories, sorted (e.g., by latest story)
const getUsersFromStories = (stories: PostSerializable[]): UserProfile[] => {
    const userMap = new Map<string, { profile: UserProfile; latestTimestamp: number }>();
    stories.forEach(story => {
        const timestamp = new Date(story.timestamp).getTime();
        const existing = userMap.get(story.uid);
        if (!existing || timestamp > existing.latestTimestamp) {
            userMap.set(story.uid, {
                profile: { // Create a partial UserProfile for preview
                    uid: story.uid,
                    displayName: story.displayName,
                    photoURL: story.photoURL,
                    // Add other fields if needed later, like 'lastSeen' for online status
                    email: null, // Not available directly on post
                },
                latestTimestamp: timestamp
            });
        }
    });
    // Sort users by the timestamp of their latest story, newest first
    return Array.from(userMap.values())
        .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
        .map(item => item.profile);
};


export default function StoriesPage() {
  const [allStories, setAllStories] = React.useState<PostSerializable[]>([]);
  const [groupedStories, setGroupedStories] = React.useState<Record<string, PostSerializable[]>>({});
  const [storyUsers, setStoryUsers] = React.useState<UserProfile[]>([]);
  const [loadingStories, setLoadingStories] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const initialLoadComplete = React.useRef(false);
  const { toast } = useToast();

  // State for modal viewer
  const [viewingUserUid, setViewingUserUid] = React.useState<string | null>(null);
  const [initialStoryIndex, setInitialStoryIndex] = React.useState<number>(0);

  const loadStories = React.useCallback(async () => {
    if (!initialLoadComplete.current) {
        setLoadingStories(true);
    }
    setError(null);
    try {
      const fetchedItems = await fetchPosts(100); // Fetch more items to ensure groups
      const filteredStories = fetchedItems.filter(item => item.type === 'story');
      setAllStories(filteredStories); // Store all fetched stories

      // Group and prepare user list after fetching
      const grouped = groupStoriesByUser(filteredStories);
      setGroupedStories(grouped);
      const users = getUsersFromStories(filteredStories);
      setStoryUsers(users);

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
    // Optional: Add a refresh interval if needed
     const intervalId = setInterval(loadStories, 5 * 60 * 1000); // Refresh every 5 mins
     return () => clearInterval(intervalId);
  }, [loadStories]);

  const handleNewStoryAdded = (newStory: Post) => {
     const serializableStory: PostSerializable = {
       ...newStory,
       timestamp: (newStory.timestamp instanceof Date ? newStory.timestamp : new Date()).toISOString(),
       type: 'story',
       likeCount: 0, likedBy: [], commentCount: 0,
     };
     // Add to local state immediately for responsiveness
      setAllStories(prev => [serializableStory, ...prev]); // Add to the raw list
      // Re-group and update user list
      const updatedStories = [serializableStory, ...allStories];
      const grouped = groupStoriesByUser(updatedStories);
      setGroupedStories(grouped);
      const users = getUsersFromStories(updatedStories);
      setStoryUsers(users);
  };

  const handleStoryDeleted = (deletedStoryId: string) => {
        setAllStories(prev => prev.filter(story => story.id !== deletedStoryId));
        // Re-group and update user list
        const updatedStories = allStories.filter(story => story.id !== deletedStoryId);
        const grouped = groupStoriesByUser(updatedStories);
        setGroupedStories(grouped);
        const users = getUsersFromStories(updatedStories);
        setStoryUsers(users);
        toast({ title: "Story Removed", description: "The story has been deleted." });
   };

   const handleOpenStoryViewer = (targetUserUid: string) => {
       setInitialStoryIndex(0); // Start from the first story for the user
       setViewingUserUid(targetUserUid);
   };

   const handleCloseStoryViewer = () => {
       setViewingUserUid(null);
   };


  return (
    <>
    <div className="flex flex-col items-center min-h-screen bg-secondary py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-5xl"> {/* Wider max-width */}

        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Stories</h1>
          <p className="text-muted-foreground mt-2">View recent stories from the community (visible for ~8 hours).</p>
        </div>

        {/* Story Previews Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 px-1 text-foreground">Recent Updates</h2>
          {loadingStories && (
             <div className="flex space-x-3 p-1">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="w-20 sm:w-24 h-32 sm:h-40 rounded-lg" />)}
             </div>
          )}
          {!loadingStories && error && (
             <Card className="w-full border-destructive bg-destructive/10 text-destructive-foreground shadow-md mt-4">
                 <CardHeader className="flex flex-row items-center gap-3">
                     <Frown className="h-6 w-6"/>
                     <div><CardTitle className="text-lg">Error Loading</CardTitle></div>
                 </CardHeader>
                 <CardContent><p>{error}</p></CardContent>
                 <CardFooter><Button variant="destructive" onClick={loadStories}>Retry</Button></CardFooter>
             </Card>
          )}
          {!loadingStories && !error && storyUsers.length === 0 && initialLoadComplete.current && (
              <div className="text-center text-muted-foreground italic py-6">No stories available right now.</div>
          )}
           {!loadingStories && !error && storyUsers.length > 0 && (
              <ScrollArea className="w-full whitespace-nowrap rounded-md">
                 <div className="flex space-x-3 p-2 pb-4">
                     {storyUsers.map((storyUser) => (
                        <StoryPreviewCard
                            key={storyUser.uid}
                            userProfile={storyUser}
                            // Pass hasUnread if implemented later
                            onClick={() => handleOpenStoryViewer(storyUser.uid)}
                        />
                     ))}
                 </div>
                 <ScrollBar orientation="horizontal" />
              </ScrollArea>
           )}
        </div>

        <Separator className="my-8"/>

        {/* Story Form (Only show if logged in) */}
        {authLoading ? (
           <Card className="w-full max-w-xl mx-auto shadow-lg border border-border/50 bg-card">
               <CardHeader><Skeleton className="h-6 w-3/5 mb-2" /><Skeleton className="h-4 w-4/5" /></CardHeader>
               <CardContent><Skeleton className="h-16 w-full" /></CardContent>
               <CardFooter className="flex justify-end"><Skeleton className="h-10 w-28" /></CardFooter>
           </Card>
        ) : user ? (
          <div className="w-full max-w-xl mx-auto">
             <StoryForm onStoryAdded={handleNewStoryAdded} />
          </div>
        ) : (
          <Card className="w-full max-w-xl mx-auto shadow-md text-center border-dashed border-primary/60 bg-primary/10 p-6">
              <CardHeader className="p-0">
                  <CardTitle className="text-xl font-semibold">Log in to Share a Story</CardTitle>
                  <CardDescription className="mt-1">Join the conversation by logging in or creating an account.</CardDescription>
              </CardHeader>
          </Card>
        )}

        {/* Placeholder for maybe showing own active stories or something else */}
        {/* ... */}

      </div>
    </div>

     {/* Modal Story Viewer */}
     {viewingUserUid && groupedStories[viewingUserUid] && (
         <StoryModalViewer
            userStories={groupedStories[viewingUserUid]}
            initialIndex={initialStoryIndex}
            currentUserId={user?.uid ?? null}
            onClose={handleCloseStoryViewer}
            onDelete={handleStoryDeleted}
          />
     )}
    </>
  );
}

