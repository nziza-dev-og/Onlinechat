
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
    AlertDialogContent as AlertDialogPrimitiveContent, 
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle as AlertDialogTitleComponent,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CommentSection } from '@/components/posts/comment-section'; // Ensure this is imported

interface StoryModalViewerProps {
  userStories: PostSerializable[]; 
  initialIndex?: number; 
  currentUserId: string | null; 
  onClose: () => void; 
  onDelete: (storyId: string) => void; 
}

const STORY_DURATION_SECONDS = 8; 

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
  const [showComments, setShowComments] = React.useState(false);

  const mediaRef = React.useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const videoMediaRef = React.useRef<HTMLVideoElement>(null); // Specific ref for video element

  const { toast } = useToast();
  const activeStory = userStories[currentIndex];
  const isOwner = activeStory ? currentUserId === activeStory.uid : false;

  const resolvedImageUrl = activeStory ? resolveMediaUrl(activeStory.imageUrl) : undefined;
  const resolvedVideoUrl = activeStory?.videoUrl ? resolveMediaUrl(activeStory.videoUrl) : undefined;
  const resolvedMusicUrl = activeStory ? resolveMediaUrl(activeStory.musicUrl) : undefined;

  const goToNextStory = React.useCallback(() => {
    setCurrentIndex((prevIndex) => {
      if (prevIndex < userStories.length - 1) {
        setShowComments(false); 
        return prevIndex + 1;
      }
      onClose(); 
      return prevIndex;
    });
  }, [userStories.length, onClose]);

  const goToPrevStory = () => {
    setCurrentIndex((prevIndex) => {
        const newIndex = Math.max(0, prevIndex - 1);
        if (newIndex !== prevIndex) {
             setShowComments(false); 
        }
        return newIndex;
    });
  };

  const stopMediaAndTimers = React.useCallback(() => {
    if (mediaRef.current) {
      mediaRef.current.pause();
    }
    if (videoMediaRef.current) { // Also pause video ref if it exists
        videoMediaRef.current.pause();
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
      isMountedRef.current = true;
      return () => {
          isMountedRef.current = false;
          stopMediaAndTimers(); 
      };
  }, [stopMediaAndTimers]);

  const startProgress = React.useCallback((durationSeconds: number) => {
    stopMediaAndTimers(); 
    setProgress(0);
    const intervalTime = 50; 
    const totalSteps = (durationSeconds * 1000) / intervalTime;
    let currentStep = 0;

    progressIntervalRef.current = setInterval(() => {
      if (isPaused || !isMountedRef.current || showComments) return; 
      currentStep++;
      const currentProgress = (currentStep / totalSteps) * 100;
      setProgress(currentProgress);
      if (currentProgress >= 100) {
        goToNextStory();
      }
    }, intervalTime);
  }, [stopMediaAndTimers, isPaused, goToNextStory, showComments]);

 const handleMediaError = React.useCallback((e: Event, type: 'video' | 'audio') => {
     const mediaElement = type === 'video' ? videoMediaRef.current : mediaRef.current;
     const error = mediaElement?.error;
     console.error(
       `Media Error (${type}): Code ${error?.code}, Message: ${error?.message}`,
       e 
     );
     toast({
         variant: "destructive",
         title: `${type.charAt(0).toUpperCase() + type.slice(1)} Error`,
         description: `Could not load story ${type}. ${error?.message || 'Check console for details.'}`
     });
     if (isMountedRef.current) {
         setIsPaused(true);
         setProgress(100); 
     }
     stopMediaAndTimers();
 }, [stopMediaAndTimers, toast]);

  const handleMediaLoaded = React.useCallback(() => {
    const currentMediaRef = resolvedVideoUrl ? videoMediaRef.current : mediaRef.current; // Prioritize video ref
    if (!currentMediaRef || !isMountedRef.current) return;

    let duration = STORY_DURATION_SECONDS;

    if (resolvedVideoUrl && currentMediaRef instanceof HTMLVideoElement && isFinite(currentMediaRef.duration)) {
        duration = currentMediaRef.duration;
        console.log(`Video story duration: ${duration}s`);
    } else if (resolvedMusicUrl && currentMediaRef instanceof HTMLAudioElement) {
         const startTime = activeStory?.musicStartTime ?? 0;
         currentMediaRef.currentTime = startTime;
         if (activeStory?.musicEndTime !== null && activeStory.musicEndTime > startTime && isFinite(activeStory.musicEndTime)) {
             duration = activeStory.musicEndTime - startTime;
         } else if (isFinite(currentMediaRef.duration)) {
            const musicFullDuration = currentMediaRef.duration - startTime;
            duration = musicFullDuration > 0 ? musicFullDuration : 0.1; // fallback if startTime is at or past duration
         } else {
             console.warn("Music duration is infinite/NaN, using default story duration.");
         }
         console.log(`Music story, effective duration: ${duration}s`);
    }
    
    startProgress(duration > 0 ? duration : STORY_DURATION_SECONDS); // Ensure duration is positive
    currentMediaRef.play().catch(e => console.warn("Autoplay prevented:", e));

  }, [activeStory, startProgress, resolvedVideoUrl, resolvedMusicUrl]);

   React.useEffect(() => {
     stopMediaAndTimers();
     setProgress(0);
     
     const videoElement = videoMediaRef.current;
     const audioElement = mediaRef.current as HTMLAudioElement | null; // Assuming mediaRef is for audio

     // Setup video
     if (videoElement && resolvedVideoUrl) {
         if (videoElement.currentSrc !== resolvedVideoUrl) {
             videoElement.src = resolvedVideoUrl;
             videoElement.load();
         }
         videoElement.muted = isMuted; // Video is muted if music is playing or globally muted
         videoElement.loop = !resolvedMusicUrl; // Loop video if no separate music track
         
         videoElement.removeEventListener('loadedmetadata', handleMediaLoaded);
         videoElement.removeEventListener('ended', goToNextStory);
         videoElement.removeEventListener('play', () => { if (isMountedRef.current) setIsPaused(false) });
         videoElement.removeEventListener('pause', () => { if (isMountedRef.current) setIsPaused(true) });
         videoElement.removeEventListener('error', (e) => handleMediaError(e, 'video'));

         videoElement.addEventListener('loadedmetadata', handleMediaLoaded);
         videoElement.addEventListener('ended', goToNextStory);
         videoElement.addEventListener('play', () => { if (isMountedRef.current) setIsPaused(false) });
         videoElement.addEventListener('pause', () => { if (isMountedRef.current) setIsPaused(true) });
         videoElement.addEventListener('error', (e) => handleMediaError(e, 'video'));
         
         if (!showComments) videoElement.play().catch(e => console.warn("Video autoplay prevented:", e));
         else videoElement.pause();
     }

     // Setup audio (if video is not primary or no video)
     if (audioElement && resolvedMusicUrl && !resolvedVideoUrl) { // Only setup audio if no video
         if (audioElement.currentSrc !== resolvedMusicUrl) {
             audioElement.src = resolvedMusicUrl;
             audioElement.load();
         }
         audioElement.muted = isMuted;
         audioElement.currentTime = activeStory?.musicStartTime ?? 0;
         audioElement.loop = activeStory?.musicEndTime === null;

         audioElement.removeEventListener('loadedmetadata', handleMediaLoaded);
         audioElement.removeEventListener('ended', goToNextStory);
         audioElement.removeEventListener('play', () => { if (isMountedRef.current) setIsPaused(false) });
         audioElement.removeEventListener('pause', () => { if (isMountedRef.current) setIsPaused(true) });
         audioElement.removeEventListener('error', (e) => handleMediaError(e, 'audio'));

         audioElement.addEventListener('loadedmetadata', handleMediaLoaded);
         audioElement.addEventListener('ended', goToNextStory);
         audioElement.addEventListener('play', () => { if (isMountedRef.current) setIsPaused(false) });
         audioElement.addEventListener('pause', () => { if (isMountedRef.current) setIsPaused(true) });
         audioElement.addEventListener('error', (e) => handleMediaError(e, 'audio'));

         if (!showComments) audioElement.play().catch(e => console.warn("Audio autoplay prevented:", e));
         else audioElement.pause();
     } else if (resolvedImageUrl && !resolvedVideoUrl && !resolvedMusicUrl) { // Pure image story
        if (!showComments) startProgress(STORY_DURATION_SECONDS);
        else {
            stopMediaAndTimers();
            setIsPaused(true);
        }
     }


   }, [currentIndex, activeStory, resolvedVideoUrl, resolvedMusicUrl, resolvedImageUrl, stopMediaAndTimers, handleMediaLoaded, startProgress, isMuted, goToNextStory, handleMediaError, showComments]);


  const handleInteractionStart = () => {
    if (!isPaused && !showComments) {
        setIsPaused(true);
         if (videoMediaRef.current) videoMediaRef.current.pause();
         if (mediaRef.current) mediaRef.current.pause();
         if (timerRef.current) clearTimeout(timerRef.current);
         if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
  };

  const handleInteractionEnd = () => {
    if (isPaused && !showComments) {
        setIsPaused(false);
        const currentMediaElement = resolvedVideoUrl ? videoMediaRef.current : mediaRef.current;
        if (currentMediaElement) currentMediaElement.play().catch(e => console.warn("Resume play prevented:", e));
        
        let durationForProgress = STORY_DURATION_SECONDS;
        if (resolvedVideoUrl && videoMediaRef.current && isFinite(videoMediaRef.current.duration)) {
            durationForProgress = videoMediaRef.current.duration - videoMediaRef.current.currentTime;
        } else if (resolvedMusicUrl && mediaRef.current && mediaRef.current instanceof HTMLAudioElement && isFinite(mediaRef.current.duration)) {
            const audioEl = mediaRef.current as HTMLAudioElement;
            const startTime = activeStory?.musicStartTime ?? 0;
            const endTime = activeStory?.musicEndTime ?? audioEl.duration;
            durationForProgress = endTime - audioEl.currentTime;
        } else if (resolvedImageUrl) {
             const elapsedRatio = progress / 100;
             durationForProgress = STORY_DURATION_SECONDS * (1 - elapsedRatio);
        }
        startProgress(durationForProgress > 0 ? durationForProgress : 0.1);
    }
  };


  const handleDeleteClick = async () => {
    if (!activeStory || isDeleting || !isOwner) return;
    setIsDeleting(true);
    handleInteractionStart(); 
    try {
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
      handleInteractionEnd(); 
    } finally {
       if(isMountedRef.current) setIsDeleting(false);
    }
  };

  const toggleComments = (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowComments(prev => {
           const nextState = !prev;
           if (nextState) { // Comments are being shown
               setIsPaused(true);
               if (videoMediaRef.current) videoMediaRef.current.pause();
               if (mediaRef.current) mediaRef.current.pause();
               if (timerRef.current) clearTimeout(timerRef.current);
               if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
           } else { // Comments are being hidden
               handleInteractionEnd(); // Resume story playback
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
            className="p-0 max-w-md w-[90vw] h-[85vh] md:h-[80vh] md:w-[25vw] md:max-w-[400px] border-0 shadow-2xl bg-black rounded-lg flex flex-col overflow-hidden" // Medium size
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
                  ref={videoMediaRef} // Use specific video ref
                  key={activeStory.id + '-video'}
                  src={resolvedVideoUrl}
                  className="max-w-full max-h-full object-contain pointer-events-none"
                  muted={isMuted || !!resolvedMusicUrl} // Mute video if separate music is playing or globally muted
                  playsInline
                  loop={!resolvedMusicUrl} // Loop video only if no separate music track
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
              {resolvedMusicUrl && !resolvedVideoUrl && ( // Only play separate music if no video
                   <audio
                       ref={mediaRef as React.RefObject<HTMLAudioElement>}
                       key={activeStory.id + '-music'}
                       src={resolvedMusicUrl}
                       muted={isMuted}
                       loop={activeStory.musicEndTime === null}
                       playsInline
                       preload="auto"
                       className="hidden" 
                   > Your browser does not support the audio element. </audio>
               )}
            </div>

             <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between z-20 bg-gradient-to-t from-black/50 to-transparent">
                {/* Mute button active if there's video OR music */}
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
                             onClick={(e) => e.stopPropagation()} 
                             className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                             aria-label="Delete story"
                             disabled={isDeleting} 
                          >
                             <Trash2 className="w-5 h-5" />
                          </Button>
                       </AlertDialogTrigger>
                       <AlertDialogPrimitiveContent onClick={(e) => e.stopPropagation()}> 
                          <AlertDialogHeader>
                             <AlertDialogTitleComponent className="flex items-center gap-2">
                                <AlertTriangle className="text-destructive"/> Delete this story?
                             </AlertDialogTitleComponent>
                             <AlertDialogDescription>This action cannot be undone and will permanently remove your story.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                             <AlertDialogCancel
                                disabled={isDeleting}
                                onClick={(e) => {e.stopPropagation(); handleInteractionEnd(); }}>Cancel</AlertDialogCancel>
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
                 ) : <div />} 
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
