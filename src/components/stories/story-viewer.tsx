"use client";

import * as React from 'react';
import type { PostSerializable } from '@/types';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getInitials, resolveMediaUrl, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { X, Volume2, VolumeX, Trash2, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Pause, Play as PlayIcon, MessageCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { AnimatePresence, motion } from "framer-motion";
import { deletePost } from '@/lib/posts.service';
import { useToast } from '@/hooks/use-toast';
import { Progress } from "@/components/ui/progress";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent as AlertDialogPrimitiveContent, // Use Primitive Content for unstyled base
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle as AlertDialogTitleComponent,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CommentSection } from '@/components/posts/comment-section';

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
  const [showComments, setShowComments] = React.useState(false); // State for comments visibility

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
        setShowComments(false); // Hide comments when moving to next story
        return prevIndex + 1;
      }
      onClose(); // Close modal if it's the last story
      return prevIndex;
    });
  }, [userStories.length, onClose]);

  const goToPrevStory = () => {
    setCurrentIndex((prevIndex) => {
        const newIndex = Math.max(0, prevIndex - 1);
        if (newIndex !== prevIndex) {
             setShowComments(false); // Hide comments when moving to previous story
        }
        return newIndex;
    });
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
      if (isPaused || !isMountedRef.current || showComments) return; // Pause progress if comments are shown
      currentStep++;
      const currentProgress = (currentStep / totalSteps) * 100;
      setProgress(currentProgress);
      if (currentProgress >= 100) {
        goToNextStory();
      }
    }, intervalTime);
  }, [stopMediaAndTimers, isPaused, goToNextStory, showComments]); // Add showComments dependency

 const handleMediaError = React.useCallback((e: Event) => {
     const mediaElement = mediaRef.current;
     const error = mediaElement?.error;
     console.error(
       `Media Error Event: Code ${error?.code}, Message: ${error?.message}`,
       e // Log the original event object too
     );
     const elementType = mediaElement instanceof HTMLVideoElement ? 'video' : (mediaElement instanceof HTMLAudioElement ? 'audio' : 'media');
     toast({
         variant: "destructive",
         title: "Media Error",
         description: `Could not load story ${elementType}. ${error?.message || 'Check console for details.'}`
     });
     if (isMountedRef.current) {
         setIsPaused(true);
         setProgress(100); // Show progress as complete
     }
     stopMediaAndTimers();
 }, [stopMediaAndTimers, toast, setIsPaused, setProgress]);

  const handleMediaLoaded = React.useCallback(() => {
    const mediaElement = mediaRef.current;
    if (!mediaElement || !isMountedRef.current) return;

    if (activeStory?.musicUrl && mediaElement instanceof HTMLAudioElement) {
         const startTime = activeStory.musicStartTime ?? 0;
         mediaElement.currentTime = startTime;
         console.log(`Audio starting at: ${startTime}s`);
         if (activeStory.musicEndTime !== null && activeStory.musicEndTime > startTime) {
             const durationToPlay = (activeStory.musicEndTime - startTime) * 1000;
             if (timerRef.current) clearTimeout(timerRef.current);
             timerRef.current = setTimeout(() => {
                 if (!isPaused && isMountedRef.current) {
                     console.log(`Audio reached end time: ${activeStory.musicEndTime}s. Advancing.`);
                     goToNextStory();
                 }
             }, durationToPlay);
              startProgress((activeStory.musicEndTime - startTime));
         } else {
             if (isFinite(mediaElement.duration)) {
                const remainingDuration = mediaElement.duration - startTime;
                startProgress(remainingDuration > 0 ? remainingDuration : 0.1);
             } else {
                 console.warn("Audio duration is infinite/NaN, cannot use for progress.");
                  startProgress(STORY_DURATION_SECONDS);
             }
         }
    } else if (mediaElement instanceof HTMLVideoElement && isFinite(mediaElement.duration)) {
        startProgress(mediaElement.duration);
    } else {
        startProgress(STORY_DURATION_SECONDS);
    }
    mediaElement.play().catch(e => console.warn("Autoplay prevented:", e));

  }, [activeStory, startProgress, isPaused, goToNextStory]);

   React.useEffect(() => {
     stopMediaAndTimers();
     setProgress(0);
     const mediaElement = mediaRef.current;

     if (mediaElement) {
         const newSrc = resolvedVideoUrl || resolvedMusicUrl;
         if (newSrc && mediaElement.currentSrc !== newSrc) {
             mediaElement.src = newSrc;
             mediaElement.load();
         } else if (!newSrc && mediaElement.currentSrc) {
              mediaElement.src = '';
         }

         mediaElement.muted = isMuted;
         mediaElement.currentTime = activeStory?.musicStartTime ?? 0;

         mediaElement.removeEventListener('loadedmetadata', handleMediaLoaded);
         mediaElement.removeEventListener('ended', goToNextStory);
         mediaElement.removeEventListener('play', () => {if (isMountedRef.current) setIsPaused(false)});
         mediaElement.removeEventListener('pause', () => {if (isMountedRef.current) setIsPaused(true)});
         mediaElement.removeEventListener('error', handleMediaError);

         mediaElement.addEventListener('loadedmetadata', handleMediaLoaded);
         mediaElement.addEventListener('ended', goToNextStory);
         mediaElement.addEventListener('play', () => {if (isMountedRef.current) setIsPaused(false)});
         mediaElement.addEventListener('pause', () => {if (isMountedRef.current) setIsPaused(true)});
         mediaElement.addEventListener('error', handleMediaError);

          if (!showComments) {
             mediaElement.play().catch(e => console.warn("Autoplay prevented on story change:", e));
          } else {
             mediaElement.pause();
             setIsPaused(true);
          }
     } else if (resolvedImageUrl) {
          if (!showComments) {
             startProgress(STORY_DURATION_SECONDS);
          } else {
            stopMediaAndTimers();
            setIsPaused(true);
          }
     }

   }, [currentIndex, activeStory, resolvedVideoUrl, resolvedMusicUrl, resolvedImageUrl, stopMediaAndTimers, handleMediaLoaded, startProgress, isMuted, goToNextStory, handleMediaError, showComments]);


  const handleInteractionStart = () => {
    if (!isPaused && !showComments) {
        setIsPaused(true);
         if (mediaRef.current) mediaRef.current.pause();
         if (timerRef.current) clearTimeout(timerRef.current);
         if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
  };

  const handleInteractionEnd = () => {
    if (isPaused && !showComments) {
        setIsPaused(false);
        if (mediaRef.current) mediaRef.current.play().catch(e => console.warn("Resume play prevented:", e));
        const mediaElement = mediaRef.current;
        let remainingDuration = STORY_DURATION_SECONDS;
        let progressAlreadyElapsed = progress;

        if (mediaElement && isFinite(mediaElement.duration)) {
            const currentTime = mediaElement.currentTime;
            const startTime = mediaElement instanceof HTMLAudioElement ? (activeStory?.musicStartTime ?? 0) : 0;
            const endTime = (mediaElement instanceof HTMLAudioElement && activeStory?.musicEndTime !== null) ? activeStory.musicEndTime : mediaElement.duration;
            const totalMediaDuration = endTime - startTime;

            if (currentTime < endTime && totalMediaDuration > 0) {
                remainingDuration = endTime - currentTime;
                progressAlreadyElapsed = ((currentTime - startTime) / totalMediaDuration) * 100;
            } else {
                 goToNextStory();
                 return;
            }
        }
        const remainingDurationFromProgress = (durationSeconds: number) => (durationSeconds * (100 - progress)) / 100;
        let resumeDuration = STORY_DURATION_SECONDS;
        if (mediaElement && isFinite(mediaElement.duration)) {
             const startTime = mediaElement instanceof HTMLAudioElement ? (activeStory?.musicStartTime ?? 0) : 0;
             const endTime = (mediaElement instanceof HTMLAudioElement && activeStory?.musicEndTime !== null) ? activeStory.musicEndTime : mediaElement.duration;
             resumeDuration = endTime - startTime;
        }
        const remainingSeconds = remainingDurationFromProgress(resumeDuration > 0 ? resumeDuration : STORY_DURATION_SECONDS);
         startProgress(remainingSeconds > 0 ? remainingSeconds : 0.1);
    }
  };


  const handleDeleteClick = async () => {
    if (!activeStory || isDeleting || !isOwner) return;
    setIsDeleting(true);
    handleInteractionStart(); // Pause story
    try {
      // Call the delete service, ensuring currentUserId is passed correctly
      await deletePost(activeStory.id, currentUserId || '');
      toast({ title: "Story Deleted", description: "The story has been removed." });
      onDelete(activeStory.id);

      if (userStories.length <= 1) {
         onClose();
      } else {
         const deletedIndex = userStories.findIndex(s => s.id === activeStory.id);
         const nextIndexToShow = deletedIndex >= userStories.length - 1 ? deletedIndex - 1 : deletedIndex;
         setProgress(0);
         setShowComments(false);
         setCurrentIndex(Math.max(0, Math.min(nextIndexToShow, userStories.length - 2)));
      }
    } catch (error: any) {
      console.error("Error deleting story:", error);
      toast({ title: "Delete Failed", description: error.message || "Could not delete the story.", variant: "destructive" });
      handleInteractionEnd(); // Resume story on failure
    } finally {
       if(isMountedRef.current) setIsDeleting(false);
    }
  };

  const toggleComments = (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowComments(prev => {
           const nextState = !prev;
           if (nextState) {
               setIsPaused(true);
               if (mediaRef.current) mediaRef.current.pause();
               if (timerRef.current) clearTimeout(timerRef.current);
               if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
           } else {
               handleInteractionEnd();
           }
           return nextState;
      });
  };


  if (!activeStory) {
    return null;
  }

  return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
            className="p-0 max-w-md w-[90vw] h-[85vh] border-0 shadow-2xl bg-black rounded-lg flex flex-col overflow-hidden"
             onInteractOutside={(e) => e.preventDefault()}
             onEscapeKeyDown={onClose}
        >
            <DialogTitle className={cn("sr-only")}>
               Story by {activeStory.displayName || 'User'}
            </DialogTitle>

          <div
            className="relative w-full h-full flex flex-col text-white select-none"
             onMouseDown={!showComments ? handleInteractionStart : undefined}
             onTouchStart={!showComments ? handleInteractionStart : undefined}
             onMouseUp={!showComments ? handleInteractionEnd : undefined}
             onTouchEnd={!showComments ? handleInteractionEnd : undefined}
             onMouseLeave={!showComments ? handleInteractionEnd : undefined}
           >
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
                      transition={{ duration: index === currentIndex ? 0.05 : 0, ease: "linear" }}
                    />
                  </div>
                ))}
              </div>
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
                     onClick={(e) => { e.stopPropagation(); onClose(); }}
                     className="h-8 w-8 text-white/80 hover:bg-white/20 hover:text-white"
                     aria-label="Close story viewer"
                 >
                     <X className="w-5 h-5" />
                 </Button>
               </div>
            </div>

             <div className="absolute inset-y-0 left-0 w-1/3 z-30" onClick={(e) => { e.stopPropagation(); goToPrevStory(); }}></div>
             <div className="absolute inset-y-0 right-0 w-1/3 z-30" onClick={(e) => { e.stopPropagation(); goToNextStory(); }}></div>

            <div className="flex-1 flex items-center justify-center overflow-hidden relative bg-gray-900">
              {resolvedVideoUrl ? (
                <video
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  key={activeStory.id + '-video'}
                  src={resolvedVideoUrl}
                  className="max-w-full max-h-full object-contain pointer-events-none"
                  muted={isMuted}
                  playsInline
                  loop={!resolvedMusicUrl}
                  preload="auto"
                />
              ) : resolvedImageUrl ? (
                <Image
                  key={activeStory.id + '-image'}
                  src={resolvedImageUrl}
                  alt={`Story by ${activeStory.displayName}`}
                  fill
                  style={{ objectFit: 'contain' }}
                  className="pointer-events-none"
                  priority={currentIndex === initialIndex}
                  unoptimized
                />
              ) : (
                <div className="p-6 text-center text-gray-300 flex flex-col items-center gap-2">
                    <AlertTriangle className="w-10 h-10 text-yellow-400"/>
                    <span>No media found for this story.</span>
                </div>
              )}
              {resolvedMusicUrl && (
                   <audio
                       ref={mediaRef as React.RefObject<HTMLAudioElement>}
                       key={activeStory.id + '-music'}
                       src={resolvedMusicUrl}
                       muted={isMuted}
                       loop={activeStory.musicEndTime === null}
                       playsInline
                       preload="auto"
                   > Your browser does not support the audio element. </audio>
               )}
            </div>

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
                ) : <div />}

                <Button
                    variant="ghost"
                    onClick={toggleComments}
                    size="icon"
                    className="text-white/80 hover:bg-white/20 hover:text-white"
                    aria-label={showComments ? "Hide comments" : "Show comments"}
                >
                  <MessageCircle className="w-5 h-5" />
                </Button>

                 {isOwner ? (
                    <AlertDialog>
                       <AlertDialogTrigger asChild>
                          <Button
                             variant="ghost"
                             size="icon"
                             onClick={(e) => e.stopPropagation()} // Prevent pausing when clicking trigger
                             className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                             aria-label="Delete story"
                             disabled={isDeleting} // Disable trigger if already deleting
                          >
                             <Trash2 className="w-5 h-5" />
                          </Button>
                       </AlertDialogTrigger>
                       <AlertDialogPrimitiveContent onClick={(e) => e.stopPropagation()}> {/* Prevent pausing when clicking content */}
                          <AlertDialogHeader>
                             <AlertDialogTitleComponent className="flex items-center gap-2">
                                <AlertTriangle className="text-destructive"/> Delete this story?
                             </AlertDialogTitleComponent>
                             <AlertDialogDescription>This action cannot be undone and will permanently remove your story.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                             {/* Cancel button should stop propagation and possibly resume story */}
                             <AlertDialogCancel
                                disabled={isDeleting}
                                onClick={(e) => {e.stopPropagation(); handleInteractionEnd(); }}>Cancel</AlertDialogCancel>
                             {/* Action button should stop propagation and call delete handler */}
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
                 ) : <div />} {/* Placeholder if not owner */}
             </div>

             {!showComments && activeStory.text && (
                  <div className="absolute bottom-16 left-4 right-4 z-10 text-center pointer-events-none">
                      <p className="text-sm bg-black/60 px-2 py-1 rounded inline-block">{activeStory.text}</p>
                  </div>
              )}

             <AnimatePresence>
                {showComments && (
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="absolute inset-x-0 bottom-0 z-40 bg-background text-foreground max-h-[60%] rounded-t-lg shadow-lg flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-2 border-b">
                            <h4 className="text-sm font-semibold">Comments</h4>
                             <Button variant="ghost" size="icon" onClick={toggleComments} className="h-7 w-7">
                                <X className="w-4 h-4" />
                             </Button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <CommentSection postId={activeStory.id} />
                        </div>
                    </motion.div>
                )}
             </AnimatePresence>

          </div>
        </DialogContent>
      </Dialog>
  );
}
