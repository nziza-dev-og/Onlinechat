"use client";

import * as React from 'react';
import type { PostSerializable } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getInitials, resolveMediaUrl, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { X, Volume2, VolumeX, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { AnimatePresence, motion } from "framer-motion";
import { deletePost } from '@/lib/posts.service';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle as AlertDialogTitleComponent,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface StoryViewerProps {
  stories: PostSerializable[];
  userId: string | null;
  onDelete: (storyId: string) => void;
}

const formatStoryTimestamp = (timestampISO: string | null | undefined): string => {
  if (!timestampISO) return 'just now';
  try {
    const date = parseISO(timestampISO);
    return formatDistanceToNowStrict(date, { addSuffix: true });
  } catch {
    return 'Invalid date';
  }
};

export function StoryViewer({ stories, userId, onDelete }: StoryViewerProps) {
  const [currentStoryIndex, setCurrentStoryIndex] = React.useState(0);
  const [openStory, setOpenStory] = React.useState<PostSerializable | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(false);
  const [hasInteracted, setHasInteracted] = React.useState(false);
  const audioRef = React.useRef<HTMLVideoElement>(null); // Changed to HTMLVideoElement to match usage
  const { toast } = useToast();

  const activeStory = openStory ? stories.find(s => s.id === openStory.id) : null;
  const isOwner = activeStory ? userId === activeStory.uid : false;

  const resolvedImageUrl = activeStory ? resolveMediaUrl(activeStory.imageUrl) : undefined;
  const resolvedVideoUrl = activeStory?.videoUrl ? resolveMediaUrl(activeStory.videoUrl) : undefined;
  // Added logic for music URL - assuming music is played in the video element if no other audio context
  const resolvedMusicUrl = activeStory ? resolveMediaUrl(activeStory.musicUrl) : undefined;

  const handleDelete = async () => {
    if (!activeStory) return;
    setIsDeleting(true);
    try {
      // Assuming deletePost takes postId and optionally userId
      await deletePost(activeStory.id, userId || ''); // Pass userId for ownership check in backend
      toast({ title: "Story deleted." });
      onDelete(activeStory.id);
      setOpenStory(null);
    } catch (error) {
      toast({ title: "Failed to delete story", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle opening a story - this should be triggered by clicking a story preview
  const handleOpenStory = (story: PostSerializable) => {
     setOpenStory(story);
     setHasInteracted(true); // Assume interaction when opening
  };


  // Preview Card Component (Internal)
  const StoryPreviewCard = ({ story }: { story: PostSerializable }) => {
      const previewImageUrl = resolveMediaUrl(story.imageUrl) || resolveMediaUrl(story.videoUrl); // Use video as fallback preview
      return (
          <Card
              className="w-28 h-40 sm:w-32 sm:h-48 relative overflow-hidden cursor-pointer group border-2 border-border hover:border-primary transition-all duration-200 shadow-md hover:shadow-lg"
              onClick={() => handleOpenStory(story)}
              role="button"
              tabIndex={0}
              aria-label={`View story by ${story.displayName || 'User'}`}
          >
              {previewImageUrl ? (
                  <Image
                      src={previewImageUrl}
                      alt={`Story by ${story.displayName}`}
                      fill
                      style={{ objectFit: 'cover' }}
                      className="group-hover:scale-105 transition-transform duration-300"
                  />
              ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                      <AlertTriangle className="h-6 w-6" />
                  </div>
              )}
               <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
               <div className="absolute bottom-2 left-2 right-2 flex items-end gap-1.5">
                    <Avatar className="h-6 w-6 border-2 border-background flex-shrink-0">
                       <AvatarImage src={story.photoURL || undefined} alt={story.displayName || 'User'} data-ai-hint="story preview avatar"/>
                       <AvatarFallback className="text-xs">{getInitials(story.displayName)}</AvatarFallback>
                    </Avatar>
                    <p className="text-xs font-medium text-white truncate flex-1">{story.displayName || 'User'}</p>
               </div>
          </Card>
      );
  };


  // Main return statement for the viewer container and the modal
  return (
    <>
      {/* Grid for Story Previews */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 p-1">
         {stories.map((story) => (
            <StoryPreviewCard key={story.id} story={story} />
         ))}
      </div>

      {/* Dialog for Viewing Full Story */}
      <AnimatePresence>
        {activeStory && (
          <Dialog open={!!openStory} onOpenChange={(open) => !open && setOpenStory(null)}>
             <DialogTitle className={cn("sr-only")}>
                 Story by {activeStory.displayName || 'User'}
             </DialogTitle>
            <DialogContent className="p-0 max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl w-[90vw] h-auto aspect-[9/16] overflow-hidden border-0 shadow-2xl bg-black">
              <div className="relative w-full h-full flex flex-col text-white">
                  {/* Progress Bar / Header Area */}
                 <div className="absolute top-0 left-0 right-0 p-3 z-20">
                     <div className="h-1 w-full bg-white/30 rounded-full overflow-hidden mb-2">
                         {/* Placeholder for actual progress bar animation */}
                         <motion.div
                           className="h-full bg-white"
                           initial={{ width: '0%' }}
                           animate={{ width: '100%' }} // This needs real timer logic
                           transition={{ duration: 5 }} // Example duration, needs sync with media
                         />
                     </div>
                     <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                             <Avatar className="h-8 w-8">
                                <AvatarImage src={activeStory.photoURL || undefined} alt={activeStory.displayName || 'User'} data-ai-hint="story avatar large"/>
                                <AvatarFallback>{getInitials(activeStory.displayName)}</AvatarFallback>
                             </Avatar>
                             <div>
                                 <p className="text-sm font-semibold leading-tight">{activeStory.displayName || 'User'}</p>
                                 <p className="text-xs text-white/70 leading-tight">
                                     {formatStoryTimestamp(activeStory.timestamp)}
                                 </p>
                             </div>
                         </div>
                         <Button
                             variant="ghost"
                             size="icon"
                             onClick={() => setOpenStory(null)}
                             className="h-8 w-8 text-white/80 hover:bg-white/20 hover:text-white"
                             aria-label="Close story"
                         >
                             <X className="w-5 h-5" />
                         </Button>
                     </div>
                 </div>

                {/* Media Content */}
                <div className="flex-1 flex items-center justify-center overflow-hidden relative">
                  {resolvedVideoUrl ? (
                    <video
                      ref={audioRef} // Use this ref for video as well
                      src={resolvedVideoUrl}
                      className="max-w-full max-h-full object-contain" // Contain fits the video
                      // controls // Keep controls off for story feel
                      muted={isMuted}
                      autoPlay={hasInteracted} // Autoplay only after interaction
                      playsInline
                      loop={!resolvedMusicUrl} // Loop video if there's no separate music
                      // Add event listeners for progress, end etc.
                    />
                  ) : resolvedImageUrl ? (
                    <Image
                      src={resolvedImageUrl}
                      alt={`Story by ${activeStory.displayName}`}
                      fill
                      style={{ objectFit: 'contain' }} // Contain fits the image
                      className="pointer-events-none" // Prevent dragging
                    />
                  ) : (
                    <div className="p-6 text-center text-gray-300">No media found.</div>
                  )}
                   {/* Music Player (Hidden, controlled programmatically) */}
                   {resolvedMusicUrl && (
                       <audio
                           ref={audioRef as React.RefObject<HTMLAudioElement>} // Need separate ref if video exists
                           src={resolvedMusicUrl}
                           muted={isMuted}
                           autoPlay={hasInteracted}
                           loop
                           // Add event listeners if needed for music controls
                       > Your browser does not support the audio element. </audio>
                   )}
                </div>

                {/* Footer with actions */}
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-between z-20 bg-gradient-to-t from-black/60 to-transparent">
                   {/* Mute/Unmute (Only if music or video has audio) */}
                   {(resolvedVideoUrl || resolvedMusicUrl) && (
                         <Button
                            variant="ghost"
                            onClick={() => setIsMuted(!isMuted)}
                            size="icon"
                            className="text-white/80 hover:bg-white/20 hover:text-white"
                            aria-label={isMuted ? "Unmute" : "Mute"}
                         >
                           {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                         </Button>
                   )}
                   {/* Spacer if no audio controls */}
                   {!(resolvedVideoUrl || resolvedMusicUrl) && <div></div>}

                  {/* Delete if owner */}
                  {isOwner && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                           variant="ghost"
                           size="icon"
                           className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                           aria-label="Delete story"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitleComponent className="flex items-center gap-2">
                             <AlertTriangle className="text-destructive"/> Delete this story?
                          </AlertDialogTitleComponent>
                          <AlertDialogDescription>This action cannot be undone and will permanently remove your story.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                             onClick={handleDelete}
                             disabled={isDeleting}
                             className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")} // Consistent destructive style
                          >
                            {isDeleting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                   {/* Spacer if not owner */}
                   {!isOwner && <div></div>}
                </div>

                 {/* Optional Caption Overlay */}
                 {activeStory.text && (
                      <div className="absolute bottom-16 left-4 right-4 z-10 text-center">
                          <p className="text-sm bg-black/60 px-2 py-1 rounded inline-block">{activeStory.text}</p>
                      </div>
                  )}

              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
}
