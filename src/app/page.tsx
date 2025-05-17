
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AuthForm } from '@/components/auth/auth-form';
import { ChatWindow } from '@/components/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Film, Frown } from 'lucide-react';
import { StoryPreviewCard, StoryPreviewCardSkeleton } from '@/components/stories/story-preview-card';
import { StoryModalViewer } from '@/components/stories/story-viewer';
import { fetchPosts } from '@/lib/posts.service';
import type { Post, PostSerializable, UserProfile } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// Helper to group stories by user ID (copied from /stories/page.tsx)
const groupStoriesByUser = (stories: PostSerializable[]): Record<string, PostSerializable[]> => {
    return stories.reduce((acc, story) => {
        if (!acc[story.uid]) {
            acc[story.uid] = [];
        }
        acc[story.uid].push(story);
        acc[story.uid].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return acc;
    }, {} as Record<string, PostSerializable[]>);
};

// Helper to get unique users from stories, sorted (copied from /stories/page.tsx)
const getUsersFromStories = (stories: PostSerializable[]): UserProfile[] => {
    const userMap = new Map<string, { profile: UserProfile; latestTimestamp: number }>();
    stories.forEach(story => {
        const timestamp = new Date(story.timestamp).getTime();
        const existing = userMap.get(story.uid);
        if (!existing || timestamp > existing.latestTimestamp) {
            userMap.set(story.uid, {
                profile: {
                    uid: story.uid,
                    displayName: story.displayName,
                    photoURL: story.photoURL,
                    email: null, // Not available directly on post
                },
                latestTimestamp: timestamp
            });
        }
    });
    return Array.from(userMap.values())
        .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
        .map(item => item.profile);
};


export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // State for stories
  const [allStories, setAllStories] = React.useState<PostSerializable[]>([]);
  const [groupedStories, setGroupedStories] = React.useState<Record<string, PostSerializable[]>>({});
  const [storyUsers, setStoryUsers] = React.useState<UserProfile[]>([]);
  const [loadingStories, setLoadingStories] = React.useState(true);
  const [storyError, setStoryError] = React.useState<string | null>(null);
  const initialStoriesLoadComplete = React.useRef(false);

  // State for modal viewer
  const [viewingUserUid, setViewingUserUid] = React.useState<string | null>(null);
  const [initialStoryIndex, setInitialStoryIndex] = React.useState<number>(0);

  const loadStories = React.useCallback(async () => {
    if (!user) { // Only load stories if user is logged in
        setAllStories([]);
        setGroupedStories({});
        setStoryUsers([]);
        setLoadingStories(false);
        initialStoriesLoadComplete.current = true;
        return;
    }

    if (!initialStoriesLoadComplete.current) {
        setLoadingStories(true);
    }
    setStoryError(null);
    try {
      const fetchedItems = await fetchPosts(100); // Fetch recent items
      const filteredStories = fetchedItems.filter(item => item.type === 'story');
      setAllStories(filteredStories);

      const grouped = groupStoriesByUser(filteredStories);
      setGroupedStories(grouped);
      const users = getUsersFromStories(filteredStories);
      setStoryUsers(users);

      initialStoriesLoadComplete.current = true;
    } catch (err: any) {
      console.error("Error loading stories on Home page:", err);
      setStoryError(err.message || "Failed to load stories.");
      // Don't show toast here, can be noisy on main page. Error will be shown in UI.
    } finally {
      setLoadingStories(false);
    }
  }, [user]); // Depend on user to re-fetch/clear stories on auth state change

  React.useEffect(() => {
    loadStories();
    const intervalId = setInterval(loadStories, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(intervalId);
  }, [loadStories]);

  const handleStoryDeleted = (deletedStoryId: string) => {
    setAllStories(prev => prev.filter(story => story.id !== deletedStoryId));
    const updatedStories = allStories.filter(story => story.id !== deletedStoryId);
    const grouped = groupStoriesByUser(updatedStories);
    setGroupedStories(grouped);
    const users = getUsersFromStories(updatedStories);
    setStoryUsers(users);
    toast({ title: "Story Removed", description: "The story has been deleted." });
    // If the deleted story was the last one for the user being viewed, close the modal
    if (viewingUserUid && groupedStories[viewingUserUid]?.filter(s => s.id !== deletedStoryId).length === 0) {
        setViewingUserUid(null);
    }
  };

  const handleOpenStoryViewer = (targetUserUid: string) => {
    setInitialStoryIndex(0);
    setViewingUserUid(targetUserUid);
  };

  const handleCloseStoryViewer = () => {
    setViewingUserUid(null);
  };


  // Show a loading indicator while auth state is being determined
  if (authLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary">
             <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
             <p className="text-muted-foreground">Loading your session...</p>
      </div>
    );
  }

  // If user is not logged in, show AuthForm
  if (!user) {
    return <AuthForm />;
  }

  // If user is logged in, show stories and chat window
  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.14))]"> {/* Full height for the page content */}
      {/* Stories Section */}
      <div className="border-b bg-background shadow-sm">
        <div className="container mx-auto px-2 sm:px-4 py-3">
          {/* <h2 className="text-sm font-semibold mb-2 text-muted-foreground px-1">Stories</h2> */}
          {loadingStories && !initialStoriesLoadComplete.current && (
             <div className="flex space-x-3 p-1">
                {[...Array(6)].map((_, i) => <StoryPreviewCardSkeleton key={i} />)}
             </div>
          )}
          {!loadingStories && storyError && (
             <Card className="w-full border-destructive bg-destructive/10 text-destructive-foreground shadow-sm my-2">
                 <CardHeader className="flex flex-row items-center gap-2 p-3">
                     <Frown className="h-5 w-5"/>
                     <CardTitle className="text-sm">Error Loading Stories</CardTitle>
                 </CardHeader>
                 <CardContent className="p-3 text-xs"><p>{storyError}</p></CardContent>
             </Card>
          )}
          {!loadingStories && !storyError && storyUsers.length === 0 && initialStoriesLoadComplete.current && (
              <div className="text-center text-xs text-muted-foreground italic py-3 px-1">No active stories.</div>
          )}
           {!loadingStories && !storyError && storyUsers.length > 0 && (
              <ScrollArea className="w-full whitespace-nowrap rounded-md">
                 <div className="flex space-x-3 p-1 pb-2">
                     {storyUsers.map((storyUser) => (
                        <StoryPreviewCard
                            key={storyUser.uid}
                            userProfile={storyUser}
                            onClick={() => handleOpenStoryViewer(storyUser.uid)}
                        />
                     ))}
                 </div>
                 <ScrollBar orientation="horizontal" />
              </ScrollArea>
           )}
        </div>
      </div>

      {/* Chat Window (takes remaining height) */}
      <div className="flex-1 overflow-hidden">
        <ChatWindow />
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
    </div>
  );
}

