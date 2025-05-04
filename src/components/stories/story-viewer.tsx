
"use client";

import * as React from 'react';
import type { PostSerializable } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getInitials, resolveMediaUrl } from '@/lib/utils'; // Removed platform-specific checks
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog"; // Import DialogTitle
import { X, Volume2, VolumeX, Trash2, Loader2, AlertTriangle } from 'lucide-react'; // Added Volume, Trash2, Loader2, AlertTriangle icons
import { Button } from '../ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils'; // Import cn for sr-only class
import { deletePost } from '@/lib/posts.service'; // Import deletePost service
import { useToast } from '@/hooks/use-toast'; // Import useToast
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle as AlertDialogTitleComponent, // Alias to avoid name clash
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Import AlertDialog components

interface StoryViewerProps {
  stories: PostSerializable[];
  userId: string | null; // Add current user ID
  onDelete: (storyId: string) => void; // Add delete callback
}

// Function to safely format timestamp from ISO string (or reuse from utils)
const formatStoryTimestamp = (timestampISO: string | null | undefined): string => {
    if (!timestampISO) return 'just now';
    try {
        const date = parseISO(timestampISO);
        return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch { return 'Invalid date'; }
};


export function StoryViewer({ stories, userId, onDelete }: StoryViewerProps) {
  const [currentStoryIndex, setCurrentStoryIndex] = React.useState(0);
  const [openStory, setOpenStory] = React.useState<PostSerializable | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false); // State for delete operation
  const progressRef = React.useRef<HTMLDivElement>(null);
  const storyTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null); // Ref for audio element
  const [isMuted, setIsMuted] = React.useState(false); // State for music mute
  const [hasInteracted, setHasInteracted] = React.useState(false); // Track user interaction for autoplay
  const { toast } = useToast(); // Get toast

  const activeStory = openStory ? stories.find(s => s.id === openStory.id) : null;
  const isOwner = activeStory ? userId === activeStory.uid : false; // Check if current user owns the active story

  // Resolve media URLs for the active story
  const resolvedImageUrl = activeStory ? resolveMediaUrl(activeStory.imageUrl) : undefined;
  const resolvedVideoUrl = activeStory ? resolveMediaUrl(activeStory.videoUrl) : undefined;
  const resolvedMusicUrl = activeStory ? resolveMediaUrl(activeStory.musicUrl) : undefined;

  // Function to attempt playing audio, handling potential errors
  const attemptAudioPlay = React.useCallback(() => {
    // Attempt to play if audio element exists, music URL is present, not muted, and user has interacted
    if (audioRef.current && resolvedMusicUrl && !isMuted && hasInteracted) {
        console.log("Attempting to play audio:", resolvedMusicUrl);
        audioRef.current.play().catch(e => console.warn("Audio play failed (likely autoplay restriction):", e));
    } else {
        // Log reasons for not playing
         if (!resolvedMusicUrl) console.log("No music URL for current story.");
         if (isMuted) console.log("Audio muted.");
         if (!hasInteracted) console.log("Audio waiting for user interaction.");
    }
  }, [resolvedMusicUrl, isMuted, hasInteracted]);

  // Handle story progression and music
  React.useEffect(() => {
    if (!activeStory) {
       // Stop music when viewer closes
       if(audioRef.current) {
           audioRef.current.pause();
           audioRef.current.currentTime = 0; // Reset time
           audioRef.current.src = ''; // Clear source
           console.log("Story viewer closed, audio paused and reset.");
       }
       return;
    }

    console.log("Active story changed:", activeStory.id, "Music:", resolvedMusicUrl);

    // Reset progress animation
    if (progressRef.current) {
      progressRef.current.style.width = '0%';
      progressRef.current.style.transition = 'none'; // Remove transition first
      // Force reflow to restart animation
      void progressRef.current.offsetWidth;
      // Apply transition *after* reset
       setTimeout(() => {
            if (progressRef.current) {
               progressRef.current.style.transition = 'width 5s linear'; // Duration of story display
               progressRef.current.style.width = '100%';
            }
       }, 50); // Small delay to ensure reset takes effect
    }

    // Handle music playback
    if (resolvedMusicUrl && audioRef.current) {
        if (audioRef.current.src !== resolvedMusicUrl) {
             console.log("Setting new audio source:", resolvedMusicUrl);
             audioRef.current.src = resolvedMusicUrl;
             audioRef.current.load(); // Load new source
              audioRef.current.onloadedmetadata = () => {
                  if (!audioRef.current) return;
                  const startTime = activeStory.musicStartTime ?? 0;
                  if (isFinite(startTime) && startTime >= 0) {
                      audioRef.current.currentTime = startTime;
                      console.log(`Audio start time set to: ${startTime}`);
                  } else {
                      audioRef.current.currentTime = 0;
                  }
                  attemptAudioPlay(); // Attempt play after metadata loads
             };
              audioRef.current.onerror = (e) => {
                   console.error("Audio Error Event:", e, audioRef.current?.error);
              }
        } else {
              const startTime = activeStory.musicStartTime ?? 0;
               if (isFinite(startTime) && startTime >= 0) {
                   audioRef.current.currentTime = startTime;
               } else {
                   audioRef.current.currentTime = 0;
               }
              attemptAudioPlay();
        }
        audioRef.current.muted = isMuted;

        const endTime = activeStory.musicEndTime;
         const hasEndTime = endTime !== null && endTime !== undefined && isFinite(endTime) && endTime > (activeStory.musicStartTime ?? 0);

         const checkEndTime = () => {
             if (audioRef.current && hasEndTime && audioRef.current.currentTime >= endTime) {
                 audioRef.current.pause();
                 console.log(`Audio reached end trim time: ${endTime}`);
             }
         };

         if (hasEndTime) {
            audioRef.current.addEventListener('timeupdate', checkEndTime);
         } else {
            audioRef.current.removeEventListener('timeupdate', checkEndTime);
         }

         const cleanupEndTimeListener = () => {
             if (audioRef.current) {
                 audioRef.current.removeEventListener('timeupdate', checkEndTime);
             }
         };
          return cleanupEndTimeListener;
    } else if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = '';
        console.log("No music for this story, pausing and clearing audio source.");
    }

    storyTimeoutRef.current = setTimeout(() => {
      const currentIndex = stories.findIndex(s => s.id === activeStory.id);
      if (currentIndex < stories.length - 1) {
        setOpenStory(stories[currentIndex + 1]);
      } else {
        setOpenStory(null); // Close viewer after last story
      }
    }, 5000); // 5 seconds per story

    return () => {
      if (storyTimeoutRef.current) clearTimeout(storyTimeoutRef.current);
      if (progressRef.current) {
          progressRef.current.style.transition = 'none';
       }
       if (audioRef.current) {
           audioRef.current.pause();
           console.log("Story changing, pausing audio.");
       }
    };
  }, [activeStory, stories, isMuted, attemptAudioPlay, resolvedMusicUrl]);

  const handleOpenStory = (story: PostSerializable) => {
    setHasInteracted(true); // User interaction detected
    const index = stories.findIndex(s => s.id === story.id);
    setCurrentStoryIndex(index);
    setOpenStory(story);
     const storyMusicUrl = resolveMediaUrl(story.musicUrl);
     if (!isMuted && storyMusicUrl) {
        setTimeout(attemptAudioPlay, 100);
     }
  };

  const handleCloseStory = () => {
    setOpenStory(null);
    setIsDeleting(false); // Reset deleting state on close
    setHasInteracted(false); // Reset interaction state
    if (storyTimeoutRef.current) clearTimeout(storyTimeoutRef.current);
    if(audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = '';
        console.log("Story viewer explicitly closed, audio stopped and reset.");
    }
  };

  const handleNextStory = (e?: React.MouseEvent) => {
     e?.stopPropagation();
     setHasInteracted(true);
     const currentIndex = stories.findIndex(s => s.id === activeStory?.id);
     if (currentIndex < stories.length - 1) {
        setOpenStory(stories[currentIndex + 1]);
     } else {
        handleCloseStory();
     }
  };

  const handlePrevStory = (e?: React.MouseEvent) => {
     e?.stopPropagation();
     setHasInteracted(true);
     const currentIndex = stories.findIndex(s => s.id === activeStory?.id);
     if (currentIndex > 0) {
        setOpenStory(stories[currentIndex - 1]);
     }
  };

   const toggleMute = (e: React.MouseEvent) => {
     e.stopPropagation();
     setHasInteracted(true);
     setIsMuted(prev => {
         const newMutedState = !prev;
         if (audioRef.current) {
             audioRef.current.muted = newMutedState;
             if (!newMutedState && resolvedMusicUrl) {
                 console.log("User unmuted, attempting to play audio.");
                 attemptAudioPlay();
             } else if (newMutedState) {
                  audioRef.current.pause();
                  console.log("User muted, audio paused.");
             }
         }
         return newMutedState;
     });
   };

   // Handle story deletion
    const handleDeleteStory = async () => {
        if (!activeStory || !isOwner || isDeleting || !userId) return;

        setIsDeleting(true);
        const storyToDeleteId = activeStory.id; // Capture the ID before potentially closing the modal

        try {
            await deletePost(storyToDeleteId, userId);
            handleCloseStory(); // Close the modal after deletion
            onDelete(storyToDeleteId); // Notify parent component
            // Toast confirmation handled by parent
        } catch (error: any) {
            console.error("Error deleting story:", error);
            toast({
                title: "Deletion Failed",
                description: error.message || "Could not delete the story.",
                variant: "destructive",
            });
            setIsDeleting(false); // Only reset delete state on failure
        }
    };


  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 text-foreground">Recent Stories</h2>
      {/* Horizontal scrollable list of story previews */}
      <div className="flex space-x-3 overflow-x-auto pb-4 -mb-4">
        {stories.map((story) => {
           const previewImageUrl = resolveMediaUrl(story.imageUrl || story.videoUrl);
           return (
             <button
               key={story.id}
               onClick={() => handleOpenStory(story)}
               className="relative flex-shrink-0 w-20 h-32 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 group"
               aria-label={`View story by ${story.displayName}`}
             >
               {previewImageUrl ? (
                 <Image
                   src={previewImageUrl}
                   alt={`Story preview by ${story.displayName}`}
                   fill
                   style={{ objectFit: 'cover' }}
                   className="bg-muted group-hover:scale-105 transition-transform duration-200"
                   sizes="(max-width: 768px) 20vw, 10vw"
                   data-ai-hint="story preview image"
                 />
               ) : (
                 <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">?</div>
               )}
               <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
               <Avatar className="absolute bottom-1.5 left-1.5 h-6 w-6 border-2 border-background">
                 <AvatarImage src={story.photoURL || undefined} />
                 <AvatarFallback className="text-xs">{getInitials(story.displayName)}</AvatarFallback>
               </Avatar>
             </button>
           )
        })}
      </div>

       {/* Full-screen Story Viewer Modal */}
       <Dialog open={!!openStory} onOpenChange={(open) => !open && handleCloseStory()}>
          <DialogContent
             className="p-0 max-w-md w-[95vw] h-[85vh] border-none bg-black shadow-none flex flex-col items-center justify-center outline-none focus:outline-none overflow-hidden rounded-lg"
             onEscapeKeyDown={handleCloseStory}
             aria-labelledby={activeStory ? `story-title-${activeStory.id}` : undefined}
             aria-describedby={activeStory?.text ? `story-caption-${activeStory.id}` : undefined}
          >
             {/* Visually Hidden Title for Accessibility */}
             {activeStory && (
               <DialogTitle id={`story-title-${activeStory.id}`} className={cn("sr-only")}>
                 Story by {activeStory?.displayName || 'User'} {activeStory?.text ? `- Caption: ${activeStory.text}` : ''}
               </DialogTitle>
             )}
             {activeStory && (
                <div className="relative w-full h-full" onClick={() => setHasInteracted(true)}>
                   {/* Navigation Areas */}
                   <div className="absolute top-0 left-0 h-full w-1/3 z-30 cursor-pointer" onClick={handlePrevStory} aria-label="Previous story"></div>
                   <div className="absolute top-0 right-0 h-full w-1/3 z-30 cursor-pointer" onClick={handleNextStory} aria-label="Next story"></div>

                   {/* Progress Bar */}
                   <div className="absolute top-2 left-2 right-2 z-40 h-1 bg-white/30 rounded-full overflow-hidden" aria-hidden="true">
                      <div ref={progressRef} className="h-full bg-white rounded-full" style={{ width: '0%', transition: 'none' }}></div>
                   </div>

                   {/* Header */}
                   <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between gap-2">
                      <div className='flex items-center gap-2 overflow-hidden'>
                         <Avatar className="h-8 w-8 border border-white/50 flex-shrink-0">
                            <AvatarImage src={activeStory.photoURL || undefined} />
                            <AvatarFallback>{getInitials(activeStory.displayName)}</AvatarFallback>
                         </Avatar>
                         <div className="flex flex-col text-white overflow-hidden">
                            <span className="text-sm font-medium truncate">{activeStory.displayName || 'User'}</span>
                            <span className="text-xs opacity-80 truncate">{formatStoryTimestamp(activeStory.timestamp)}</span>
                         </div>
                      </div>
                       <div className="flex items-center gap-1 flex-shrink-0">
                           {/* Mute/Unmute Button */}
                           {resolvedMusicUrl && (
                              <Button
                                variant="ghost" size="icon" onClick={toggleMute}
                                className="h-8 w-8 rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white"
                                aria-label={isMuted ? "Unmute story music" : "Mute story music"}
                              >
                                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                              </Button>
                           )}
                           {/* Delete Button (only for owner) */}
                           {isOwner && (
                               <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                     <Button
                                         variant="ghost" size="icon"
                                         className="h-8 w-8 rounded-full bg-black/30 text-destructive hover:bg-destructive/80 hover:text-white"
                                         disabled={isDeleting}
                                         onClick={(e) => e.stopPropagation()} // Prevent story navigation
                                         aria-label="Delete story"
                                     >
                                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-5 w-5" />}
                                     </Button>
                                  </AlertDialogTrigger>
                                   <AlertDialogContent onClick={(e) => e.stopPropagation()}> {/* Prevent closing modal on content click */}
                                      <AlertDialogHeader>
                                         <AlertDialogTitleComponent className="flex items-center gap-2">
                                            <AlertTriangle className="text-destructive"/> Confirm Deletion
                                         </AlertDialogTitleComponent>
                                         <AlertDialogDescription>
                                            Are you sure you want to delete this story? This action cannot be undone.
                                         </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                         <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                             onClick={handleDeleteStory}
                                             disabled={isDeleting}
                                             className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                                          >
                                             {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                             Delete Story
                                          </AlertDialogAction>
                                      </AlertDialogFooter>
                                   </AlertDialogContent>
                               </AlertDialog>
                           )}
                           {/* Close Button */}
                           <Button
                             variant="ghost" size="icon" onClick={handleCloseStory}
                             className="h-8 w-8 rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white"
                             aria-label="Close story viewer"
                           >
                             <X className="h-5 w-5" />
                           </Button>
                       </div>
                   </div>

                   {/* Media Content */}
                   <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                      {resolvedImageUrl && (
                         <Image
                            src={resolvedImageUrl}
                            alt={activeStory.text || `Story by ${activeStory.displayName}`}
                            fill
                            style={{ objectFit: 'contain' }}
                            priority
                            data-ai-hint="story full view image"
                         />
                      )}
                      {resolvedVideoUrl && !resolvedImageUrl && (
                         <video
                            key={activeStory.id} // Add key to force re-render on story change
                            src={resolvedVideoUrl}
                            autoPlay
                            playsInline
                            muted={!isMuted} // Mute video based on the general mute state
                            loop={!resolvedMusicUrl} // Loop video only if there's no music
                            className="w-full h-full object-contain"
                            onEnded={handleNextStory}
                            data-ai-hint="story full view video"
                         >
                            Your browser does not support the video tag.
                         </video>
                      )}
                   </div>

                    {/* Optional Caption */}
                    {activeStory.text && (
                       <div
                          id={`story-caption-${activeStory.id}`}
                          className="absolute bottom-4 left-4 right-4 z-40 p-2 bg-black/40 rounded-md text-white text-sm text-center"
                       >
                          {activeStory.text}
                       </div>
                    )}

                    {/* Hidden Audio Element for Background Music */}
                    <audio ref={audioRef} loop={!activeStory.musicEndTime} preload="auto" className="hidden"></audio>
                </div>
             )}
          </DialogContent>
       </Dialog>

    </div>
  );
}
