"use client";

import * as React from 'react';
import type { PostSerializable } from '@/types';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getInitials, resolveMediaUrl, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"; // Corrected import
import { X, Volume2, VolumeX, Trash2, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Pause, Play as PlayIcon } from 'lucide-react'; // Added Chevrons, Pause, Play
import { Button } from '../ui/button';
import { AnimatePresence, motion } from "framer-motion";
import { deletePost } from '@/lib/posts.service';
import { useToast } from '@/hooks/use-toast';
import { Progress } from "@/components/ui/progress"; // Import Progress
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent as AlertDialogPrimitiveContent, // Use alias to avoid conflict
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle as AlertDialogTitleComponent, // Rename imported component
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface StoryModalViewerProps {
  userStories: PostSerializable[]; // Array of stories for the selected user
  initialIndex?: number; // Which story to start with
  currentUserId: string | null; // ID of the viewing user
  onClose: () => void; // Function to close the modal
  onDelete: (storyId: string) => void; // Function to call when a story is deleted
}

const STORY_DURATION_SECONDS = 8; // Default duration for image stories

// Format timestamp for stories (short relative time)
const formatStoryTimestamp = (timestampISO: string | null | undefined): string => {
    if (!timestampISO) return 'just now';
    try {
        const date = parseISO(timestampISO);
        return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch {
        return 'Invalid date';
    }
};

export function StoryModalViewer({
  userStories = [],
  initialIndex = 0,
  currentUserId,
  onClose,
  onDelete,
}: StoryModalViewerProps) {
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const mediaRef = React.useRef<HTMLVideoElement | HTMLAudioElement | null>(null); // Can be video or audio
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();
  const activeStory = userStories[currentIndex];
  const isOwner = activeStory ? currentUserId === activeStory.uid : false;

  const resolvedImageUrl = activeStory ? resolveMediaUrl(activeStory.imageUrl) : undefined;
  const resolvedVideoUrl = activeStory?.videoUrl ? resolveMediaUrl(activeStory.videoUrl) : undefined;
  const resolvedMusicUrl = activeStory ? resolveMediaUrl(activeStory.musicUrl) : undefined;

  // --- Navigation ---
  const goToNextStory = React.useCallback(() => {
    setCurrentIndex((prevIndex) => {
      if (prevIndex < userStories.length - 1) {
        return prevIndex + 1;
      }
      onClose(); // Close modal if it's the last story
      return prevIndex;
    });
  }, [userStories.length, onClose]);

  const goToPrevStory = () => {
    setCurrentIndex((prevIndex) => Math.max(0, prevIndex - 1));
  };

  // --- Media & Progress Handling ---
  const stopMediaAndTimers = React.useCallback(() => {
    // Pause media
    if (mediaRef.current) {
      mediaRef.current.pause();
    }
    // Clear timers
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Mount/Unmount tracking
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
      isMountedRef.current = true;
      return () => {
          isMountedRef.current = false;
          stopMediaAndTimers(); // Clean up timers on unmount
      };
  }, [stopMediaAndTimers]);

  const startProgress = React.useCallback((durationSeconds: number) => {
    stopMediaAndTimers(); // Clear previous timers/intervals
    setProgress(0);
    const intervalTime = 50; // Update progress roughly 20 times per second
    const totalSteps = (durationSeconds * 1000) / intervalTime;
    let currentStep = 0;

    progressIntervalRef.current = setInterval(() => {
      if (isPaused || !isMountedRef.current) return; // Check isPaused and mount status
      currentStep++;
      const currentProgress = (currentStep / totalSteps) * 100;
      setProgress(currentProgress);
      if (currentProgress >= 100) {
        goToNextStory();
      }
    }, intervalTime);
  }, [stopMediaAndTimers, isPaused, goToNextStory]);

 const handleMediaError = React.useCallback((e: Event) => {
     const mediaElement = mediaRef.current;
     const error = mediaElement?.error;
     console.error(
       `Media Error Event: Code ${error?.code}, Message: ${error?.message}`,
       e // Log the original event object too
     );
      // Optionally show a toast or advance to the next story on error
      // toast({ variant: "destructive", title: "Media Error", description: `Could not load story media. ${error?.message || ''}` });
      goToNextStory(); // Decide if you want to auto-advance on error
  }, [goToNextStory]); // Add goToNextStory as a dependency

  const handleMediaLoaded = React.useCallback(() => {
    const mediaElement = mediaRef.current;
    if (!mediaElement || !isMountedRef.current) return; // Check mount status

    // Apply music trimming if applicable
    if (activeStory?.musicUrl && mediaElement instanceof HTMLAudioElement) {
         const startTime = activeStory.musicStartTime ?? 0;
         mediaElement.currentTime = startTime;
         console.log(`Audio starting at: ${startTime}s`);

         // If there's an end time, set up a listener to pause/advance
         if (activeStory.musicEndTime !== null && activeStory.musicEndTime > startTime) {
             const durationToPlay = (activeStory.musicEndTime - startTime) * 1000;
             if (timerRef.current) clearTimeout(timerRef.current);
             timerRef.current = setTimeout(() => {
                 if (!isPaused && isMountedRef.current) {
                     console.log(`Audio reached end time: ${activeStory.musicEndTime}s. Advancing.`);
                     goToNextStory();
                 }
             }, durationToPlay);
              startProgress((activeStory.musicEndTime - startTime)); // Start progress bar for trim duration
         } else {
            // No end time, use full audio duration for progress (if finite)
             if (isFinite(mediaElement.duration)) {
                const remainingDuration = mediaElement.duration - startTime;
                startProgress(remainingDuration > 0 ? remainingDuration : 0.1); // Ensure duration is positive
             } else {
                 console.warn("Audio duration is infinite/NaN, cannot use for progress.");
                  startProgress(STORY_DURATION_SECONDS); // Fallback duration
             }
         }
    } else if (mediaElement instanceof HTMLVideoElement && isFinite(mediaElement.duration)) {
        // For video, use its duration
        startProgress(mediaElement.duration);
    } else {
        // For images or media with unknown duration, use default
        startProgress(STORY_DURATION_SECONDS);
    }

    // Attempt to play after metadata is loaded (requires user interaction first)
     mediaElement.play().catch(e => console.warn("Autoplay prevented:", e));

  }, [activeStory, startProgress, isPaused, goToNextStory]); // Added goToNextStory

  // Reset and play media when story index changes
   React.useEffect(() => {
     stopMediaAndTimers();
     setProgress(0);
     const mediaElement = mediaRef.current;

     if (mediaElement) {
         // Check if source needs updating (important for video/audio)
         const newSrc = resolvedVideoUrl || resolvedMusicUrl;
         if (newSrc && mediaElement.currentSrc !== newSrc) {
             mediaElement.src = newSrc;
             mediaElement.load(); // Important to load the new source
         } else if (!newSrc && mediaElement.currentSrc) {
              // If there's no media for the new story, clear the src
              mediaElement.src = '';
         }

         mediaElement.muted = isMuted; // Apply mute state
         mediaElement.currentTime = activeStory?.musicStartTime ?? 0; // Apply start time

          // Remove previous listeners before adding new ones
         mediaElement.removeEventListener('loadedmetadata', handleMediaLoaded);
         mediaElement.removeEventListener('ended', goToNextStory); // Use goToNextStory for 'ended'
         mediaElement.removeEventListener('play', () => {if (isMountedRef.current) setIsPaused(false)});
         mediaElement.removeEventListener('pause', () => {if (isMountedRef.current) setIsPaused(true)});
         mediaElement.removeEventListener('error', handleMediaError); // Use specific error handler

          // Add listeners for the current media
         mediaElement.addEventListener('loadedmetadata', handleMediaLoaded);
         // Use ended event primarily for untrimmed media or video loops
         mediaElement.addEventListener('ended', goToNextStory); // Go next when media finishes naturally
         mediaElement.addEventListener('play', () => {if (isMountedRef.current) setIsPaused(false)});
         mediaElement.addEventListener('pause', () => {if (isMountedRef.current) setIsPaused(true)});
         mediaElement.addEventListener('error', handleMediaError); // Use specific error handler

         // Try playing (might require prior user interaction)
          mediaElement.play().catch(e => console.warn("Autoplay prevented on story change:", e));
     } else if (resolvedImageUrl) {
         // Handle image-only stories
         startProgress(STORY_DURATION_SECONDS);
     }

   }, [currentIndex, activeStory, resolvedVideoUrl, resolvedMusicUrl, resolvedImageUrl, stopMediaAndTimers, handleMediaLoaded, startProgress, isMuted, goToNextStory, handleMediaError]); // Ensure all dependencies


  // Pause/Resume logic
  const handleInteractionStart = () => {
    if (!isPaused) {
        setIsPaused(true);
         if (mediaRef.current) mediaRef.current.pause();
         if (timerRef.current) clearTimeout(timerRef.current);
         if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
  };

  const handleInteractionEnd = () => {
    if (isPaused) {
        setIsPaused(false);
        // Resume media and progress
        if (mediaRef.current) mediaRef.current.play().catch(e => console.warn("Resume play prevented:", e));
        // Restart progress calculation from current point
        const mediaElement = mediaRef.current;
        let remainingDuration = STORY_DURATION_SECONDS; // Default for images
        let progressAlreadyElapsed = progress; // Percentage

        if (mediaElement && isFinite(mediaElement.duration)) {
            const currentTime = mediaElement.currentTime;
            const startTime = mediaElement instanceof HTMLAudioElement ? (activeStory?.musicStartTime ?? 0) : 0;
            const endTime = (mediaElement instanceof HTMLAudioElement && activeStory?.musicEndTime !== null) ? activeStory.musicEndTime : mediaElement.duration;
            const totalMediaDuration = endTime - startTime;

            if (currentTime < endTime && totalMediaDuration > 0) {
                remainingDuration = endTime - currentTime;
                progressAlreadyElapsed = ((currentTime - startTime) / totalMediaDuration) * 100;
            } else {
                 // If somehow currentTime >= endTime, or duration is invalid, advance
                 goToNextStory();
                 return;
            }
        }

        // Calculate remaining duration in seconds based on current progress percentage
        const remainingDurationFromProgress = (durationSeconds: number) => (durationSeconds * (100 - progress)) / 100;

        let resumeDuration = STORY_DURATION_SECONDS;
        if (mediaElement && isFinite(mediaElement.duration)) {
             const startTime = mediaElement instanceof HTMLAudioElement ? (activeStory?.musicStartTime ?? 0) : 0;
             const endTime = (mediaElement instanceof HTMLAudioElement && activeStory?.musicEndTime !== null) ? activeStory.musicEndTime : mediaElement.duration;
             resumeDuration = endTime - startTime;
        }

        const remainingSeconds = remainingDurationFromProgress(resumeDuration > 0 ? resumeDuration : STORY_DURATION_SECONDS);
         startProgress(remainingSeconds > 0 ? remainingSeconds : 0.1); // Start with remaining time

    }
  };


  // Delete handler
  const handleDeleteClick = async () => {
    if (!activeStory || isDeleting) return;
    setIsDeleting(true);
    // Pause story while confirming delete
    handleInteractionStart();
    try {
      // Assuming deletePost only needs postId, adjust if userId is required
      await deletePost(activeStory.id, currentUserId || '');
      toast({ title: "Story Deleted", description: "The story has been removed." });
      onDelete(activeStory.id); // Notify parent to remove from its state
      // Decide how to proceed after delete: go next or close
      if (userStories.length <= 1) {
         onClose();
      } else {
         // Move to the next story, adjusting index if necessary
         // This logic needs refinement if deleting from middle
         if (currentIndex >= userStories.length - 2) { // If it was the last or second to last
             goToPrevStory(); // Go to previous (which might become the new last)
         } else {
              // If not the last, the next story will shift into the current index
              // Force a re-render/reload of the current index if needed,
              // or simply let the parent's state update handle it.
              // Let's stay at current index (which now holds the next story)
              // and reset progress. The main useEffect will handle starting the new story.
              setProgress(0);
         }
      }
    } catch (error: any) {
      console.error("Error deleting story:", error);
      toast({ title: "Delete Failed", description: error.message || "Could not delete the story.", variant: "destructive" });
       // Resume story if delete fails
      handleInteractionEnd();
    } finally {
       // Ensure deleting state is reset even if component unmounts quickly
       if(isMountedRef.current) setIsDeleting(false);
    }
  };


  if (!activeStory) {
    return null; // Should not happen if Dialog's open state is managed correctly
  }

  return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        {/* Adjust content size for medium modal */}
        <DialogContent
            className="p-0 max-w-md w-[90vw] h-[80vh] border-0 shadow-2xl bg-black rounded-lg flex flex-col overflow-hidden" // Medium size, fixed height
             onInteractOutside={(e) => e.preventDefault()} // Prevent closing on outside click
             onEscapeKeyDown={onClose} // Allow closing with Esc
        >
            {/* Visually Hidden Title for Accessibility */}
            <DialogTitle className={cn("sr-only")}>
               Story by {activeStory.displayName || 'User'}
            </DialogTitle>

          {/* Ensure inner div takes full height */}
          <div
            className="relative w-full h-full flex flex-col text-white select-none"
             // Add mouse/touch handlers for pausing
             onMouseDown={handleInteractionStart}
             onTouchStart={handleInteractionStart}
             onMouseUp={handleInteractionEnd}
             onTouchEnd={handleInteractionEnd}
             onMouseLeave={handleInteractionEnd} // Resume if mouse leaves while held down
           >
            {/* Progress Bar Container */}
            <div className="absolute top-0 left-0 right-0 p-2 z-20">
              <div className="flex items-center gap-1 h-1 w-full">
                {userStories.map((_, index) => (
                  <div key={index} className="flex-1 h-full bg-white/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white"
                      initial={{ width: '0%' }}
                      animate={{
                        width: index < currentIndex ? '100%' : (index === currentIndex ? `${progress}%` : '0%')
                      }}
                      transition={{ duration: index === currentIndex ? 0.05 : 0, ease: "linear" }} // Fast update for current bar
                    />
                  </div>
                ))}
              </div>
               {/* Header Info (Avatar, Name, Time, Close) */}
               <div className="flex items-center justify-between mt-2">
                 <div className="flex items-center gap-2">
                     <Avatar className="h-8 w-8">
                         <AvatarImage src={activeStory.photoURL || undefined} alt={activeStory.displayName || 'User'} data-ai-hint="story author avatar"/>
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
                     onClick={(e) => { e.stopPropagation(); onClose(); }} // Prevent pausing
                     className="h-8 w-8 text-white/80 hover:bg-white/20 hover:text-white"
                     aria-label="Close story viewer"
                 >
                     <X className="w-5 h-5" />
                 </Button>
               </div>
            </div>

            {/* Clickable Navigation Areas */}
             <div className="absolute inset-y-0 left-0 w-1/3 z-30" onClick={(e) => { e.stopPropagation(); goToPrevStory(); }}></div>
             <div className="absolute inset-y-0 right-0 w-1/3 z-30" onClick={(e) => { e.stopPropagation(); goToNextStory(); }}></div>

            {/* Media Content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative bg-gray-900"> {/* Darker bg for media area */}
              {resolvedVideoUrl ? (
                <video
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  key={activeStory.id + '-video'} // Key to force re-render on story change
                  src={resolvedVideoUrl}
                  className="max-w-full max-h-full object-contain pointer-events-none"
                  muted={isMuted}
                  playsInline
                  loop={!resolvedMusicUrl} // Loop video only if no separate music
                  preload="auto" // Preload video
                />
              ) : resolvedImageUrl ? (
                <Image
                  key={activeStory.id + '-image'}
                  src={resolvedImageUrl}
                  alt={`Story by ${activeStory.displayName}`}
                  fill
                  style={{ objectFit: 'contain' }} // Contain ensures full image is visible
                  className="pointer-events-none"
                  priority={currentIndex === initialIndex} // Prioritize loading first image
                  unoptimized // Good for external URLs
                />
              ) : (
                <div className="p-6 text-center text-gray-300 flex flex-col items-center gap-2">
                    <AlertTriangle className="w-10 h-10 text-yellow-400"/>
                    <span>No media found for this story.</span>
                </div>
              )}
              {/* Separate Audio element for music */}
              {resolvedMusicUrl && ( // Play music always if present
                   <audio
                       ref={mediaRef as React.RefObject<HTMLAudioElement>}
                       key={activeStory.id + '-music'}
                       src={resolvedMusicUrl}
                       muted={isMuted}
                       loop={activeStory.musicEndTime === null} // Loop only if not trimmed
                       playsInline
                       preload="auto" // Preload audio
                   > Your browser does not support the audio element. </audio>
               )}
            </div>

             {/* Footer with Mute/Delete */}
             <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between z-20 bg-gradient-to-t from-black/50 to-transparent">
                {(resolvedVideoUrl || resolvedMusicUrl) ? (
                     <Button
                         variant="ghost"
                         onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                         size="icon"
                         className="text-white/80 hover:bg-white/20 hover:text-white"
                         aria-label={isMuted ? "Unmute" : "Mute"}
                     >
                       {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                     </Button>
                ) : <div />} {/* Placeholder to keep delete button on the right */}

                 {isOwner && (
                    <AlertDialog>
                       <AlertDialogTrigger asChild>
                          <Button
                             variant="ghost"
                             size="icon"
                             onClick={(e) => e.stopPropagation()} // Prevent pausing
                             className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                             aria-label="Delete story"
                          >
                             <Trash2 className="w-5 h-5" />
                          </Button>
                       </AlertDialogTrigger>
                       <AlertDialogPrimitiveContent onClick={(e) => e.stopPropagation()}> {/* Use alias */}
                          <AlertDialogHeader>
                             <AlertDialogTitleComponent className="flex items-center gap-2">
                                <AlertTriangle className="text-destructive"/> Delete this story?
                             </AlertDialogTitleComponent>
                             <AlertDialogDescription>This action cannot be undone and will permanently remove your story.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                             <AlertDialogCancel disabled={isDeleting} onClick={(e) => {e.stopPropagation(); handleInteractionEnd(); }}>Cancel</AlertDialogCancel>
                             <AlertDialogAction
                                onClick={(e) => {e.stopPropagation(); handleDeleteClick();}}
                                disabled={isDeleting}
                                className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                             >
                                {isDeleting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                                Delete
                             </AlertDialogAction>
                          </AlertDialogFooter>
                       </AlertDialogPrimitiveContent>
                    </AlertDialog>
                 )}
                 {!isOwner && <div />} {/* Placeholder */}
             </div>

             {/* Optional Caption Overlay */}
             {activeStory.text && (
                  <div className="absolute bottom-16 left-4 right-4 z-10 text-center pointer-events-none">
                      <p className="text-sm bg-black/60 px-2 py-1 rounded inline-block">{activeStory.text}</p>
                  </div>
              )}

          </div>
        </DialogContent>
      </Dialog>
  );
}
