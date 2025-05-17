
"use client";

import * as React from 'react';
import { PostCard } from '@/components/posts/post-card';
import { fetchPosts } from '@/lib/posts.service';
import type { Post, PostSerializable, UserProfile } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Frown, BookOpen, Image as ImageIcon } from 'lucide-react'; // Changed Film to BookOpen or ImageIcon
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { StoryPreviewCard, StoryPreviewCardSkeleton } from '@/components/stories/story-preview-card';
import { StoryModalViewer } from '@/components/stories/story-viewer';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';

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
                    email: null, 
                },
                latestTimestamp: timestamp
            });
        }
    });
    return Array.from(userMap.values())
        .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
        .map(item => item.profile);
};


export default function FeedPage() {
  const [posts, setPosts] = React.useState<PostSerializable[]>([]);
  const [allStories, setAllStories] = React.useState<PostSerializable[]>([]);
  const [groupedStories, setGroupedStories] = React.useState<Record<string, PostSerializable[]>>({});
  const [storyUsers, setStoryUsers] = React.useState<UserProfile[]>([]);
  
  const [loadingContent, setLoadingContent] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const initialLoadComplete = React.useRef(false);

  // State for modal viewer
  const [viewingUserUid, setViewingUserUid] = React.useState<string | null>(null);
  const [initialStoryIndex, setInitialStoryIndex] = React.useState<number>(0);

  const loadFeedContent = React.useCallback(async () => {
    if (!initialLoadComplete.current) {
        setLoadingContent(true);
    }
    setError(null);
    try {
      // Fetch all items (posts and stories)
      const fetchedItems = await fetchPosts(100); // Fetch a decent number of items
      
      // Filter for posts
      const filteredPosts = fetchedItems.filter(item => item.type === 'post');
      setPosts(filteredPosts);

      // Filter for stories
      const filteredStories = fetchedItems.filter(item => item.type === 'story');
      setAllStories(filteredStories);
      const grouped = groupStoriesByUser(filteredStories);
      setGroupedStories(grouped);
      const users = getUsersFromStories(filteredStories);
      setStoryUsers(users);

      initialLoadComplete.current = true;
    } catch (err: any) {
      console.error("Error loading feed content:", err);
      setError(err.message || "Failed to load content. Please try again.");
    } finally {
      setLoadingContent(false);
    }
  }, []);

  React.useEffect(() => {
    loadFeedContent();
    const intervalId = setInterval(loadFeedContent, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(intervalId);
  }, [loadFeedContent]);

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
   setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
  };
  
  const handleStoryDeleted = (deletedStoryId: string) => {
    setAllStories(prev => prev.filter(story => story.id !== deletedStoryId));
    const updatedStories = allStories.filter(story => story.id !== deletedStoryId);
    const grouped = groupStoriesByUser(updatedStories);
    setGroupedStories(grouped);
    const users = getUsersFromStories(updatedStories);
    setStoryUsers(users);
    toast({ title: "Story Removed", description: "The story has been deleted." });
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

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading feed...</p>
      </div>
    );
  }

  if (!user) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <ImageIcon className="h-12 w-12 mx-auto text-primary mb-3" />
                    <CardTitle>Welcome to the Feed</CardTitle>
                    <CardDescription>Please log in or sign up to see posts and stories.</CardDescription>
                </CardHeader>
                <CardFooter className="justify-center">
                    <Button asChild>
                        <Link href="/">Log In / Sign Up</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
  }

  return (
    <>
    <div className="flex flex-col min-h-screen bg-muted/30">
      {/* Stories Bar */}
      <div className="border-b bg-background shadow-sm sticky top-14 z-40"> {/* Assuming header height is 14 (h-14 in layout) */}
        <div className="container mx-auto px-2 sm:px-4 py-3">
          {loadingContent && !initialLoadComplete.current && (
             <div className="flex space-x-3 p-1">
                {[...Array(6)].map((_, i) => <StoryPreviewCardSkeleton key={i} />)}
             </div>
          )}
          {!loadingContent && error && storyUsers.length === 0 && ( /* Show error only if no stories loaded */
             <Card className="w-full border-destructive bg-destructive/10 text-destructive-foreground shadow-sm my-2">
                 <CardHeader className="flex flex-row items-center gap-2 p-3">
                     <Frown className="h-5 w-5"/>
                     <CardTitle className="text-sm">Error Loading Stories</CardTitle>
                 </CardHeader>
                 <CardContent className="p-3 text-xs"><p>{error}</p></CardContent>
             </Card>
          )}
          {!loadingContent && !error && storyUsers.length === 0 && initialLoadComplete.current && (
              <div className="text-center text-xs text-muted-foreground italic py-3 px-1">No active stories.</div>
          )}
           {!loadingContent && !error && storyUsers.length > 0 && (
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

      {/* Main Feed Content */}
      <div className="flex-1 flex flex-col items-center py-6 px-2 sm:px-4 lg:px-6">
        <div className="w-full max-w-2xl space-y-6"> {/* Max width for posts, similar to Instagram */}
          {/* Loading Skeletons for Posts */}
          {loadingContent && posts.length === 0 && (
            <>
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="w-full shadow-md overflow-hidden border border-border/50 bg-card">
                    <CardHeader className="flex flex-row items-center gap-3 p-4 border-b">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-1.5"> <Skeleton className="h-4 w-1/2" /> <Skeleton className="h-3 w-1/3" /> </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                        <Skeleton className="h-4 w-full" /> <Skeleton className="h-4 w-5/6 mb-4" />
                        <Skeleton className="aspect-video w-full rounded-lg bg-muted/50" />
                    </CardContent>
                    <CardFooter className="p-3 border-t flex justify-between items-center bg-muted/20">
                        <div className="flex gap-4"> <Skeleton className="h-8 w-16" /> <Skeleton className="h-8 w-16" /> </div>
                    </CardFooter>
                </Card>
              ))}
            </>
          )}

          {/* Error State for Posts */}
          {!loadingContent && error && posts.length === 0 && (
            <Card className="w-full border-destructive bg-destructive/10 text-destructive-foreground shadow-md">
              <CardHeader className="flex flex-row items-center gap-3">
                  <Frown className="h-6 w-6" />
                  <div> <CardTitle className="text-lg">Error Loading Posts</CardTitle> <CardDescription className="text-destructive-foreground/80">{error}</CardDescription> </div>
              </CardHeader>
              <CardFooter> <Button variant="destructive" onClick={loadFeedContent}>Retry</Button> </CardFooter>
            </Card>
          )}

          {/* Empty State for Posts */}
           {!loadingContent && !error && posts.length === 0 && initialLoadComplete.current && (
            <Card className="w-full text-center border-dashed border-border/70 bg-card shadow-sm py-10">
              <CardHeader>
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <CardTitle className="text-xl font-semibold">No Posts Yet</CardTitle>
                  <CardDescription>Follow users or be the first to share something!</CardDescription>
              </CardHeader>
                <CardFooter className="justify-center">
                    <Button asChild>
                        <Link href="/posts">Create a Post</Link>
                    </Button>
                </CardFooter>
            </Card>
          )}

          {/* Display Posts */}
           <AnimatePresence initial={false}>
              {!loadingContent && !error && posts.map((post) => (
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
