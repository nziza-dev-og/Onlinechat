
"use client";

import * as React from 'react';
import type { PostSerializable } from '@/types';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getInitials, resolveMediaUrl, cn, getYouTubeVideoId } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle as RadixDialogTitle } from "@/components/ui/dialog";
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
import { CommentSection } from '@/components/posts/comment-section';

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

  const videoMediaRef = React.useRef<HTMLVideoElement>(null);
  const audioMusicRef = React.useRef<HTMLAudioElement | null>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = React.useRef(true);

  const { toast } = useToast();
  const activeStory = userStories[currentIndex];
  const isOwner = activeStory ? currentUserId === activeStory.uid : false;

  const resolvedImageUrl = activeStory ? resolveMediaUrl(activeStory.imageUrl) : undefined;
  const resolvedVideoUrl = activeStory?.videoUrl ? resolveMediaUrl(activeStory.videoUrl) : undefined;
  const youtubeVideoId = getYouTubeVideoId(resolvedVideoUrl);
  const resolvedMusicUrl = activeStory ? resolveMediaUrl(activeStory.musicUrl) : undefined;

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
        isMountedRef.current = false;
        if (isMountedRef.current) stopMediaAndTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const goToNextStory = React.useCallback(() => {
    if (!isMountedRef.current) return;
    setCurrentIndex((prevIndex) => {
      if (prevIndex < userStories.length - 1) {
        if (isMountedRef.current) setShowComments(false);
        return prevIndex + 1;
      }
      setTimeout(() => {
        if (isMountedRef.current) onClose();
      }, 0);
      return prevIndex;
    });
  }, [userStories.length, onClose]);

  const goToPrevStory = () => {
    if (!isMountedRef.current) return;
    setCurrentIndex((prevIndex) => {
        const newIndex = Math.max(0, prevIndex - 1);
        if (newIndex !== prevIndex && isMountedRef.current) {
             if (isMountedRef.current) setShowComments(false);
        }
        return newIndex;
    });
  };

  const stopMediaAndTimers = React.useCallback(() => {
    if (videoMediaRef.current) {
      videoMediaRef.current.pause();
      videoMediaRef.current.currentTime = 0;
    }
    if (audioMusicRef.current) {
      audioMusicRef.current.pause();
      audioMusicRef.current.currentTime = 0;
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


  const startProgress = React.useCallback((durationSeconds: number) => {
    if (!isMountedRef.current) return;
    if (isMountedRef.current) stopMediaAndTimers();
    if (isMountedRef.current) setProgress(0);
    const intervalTime = 50;
    const totalSteps = (durationSeconds * 1000) / intervalTime;
    let currentStep = 0;

    if (totalSteps <= 0) {
        if (isMountedRef.current) goToNextStory();
        return;
    }

    progressIntervalRef.current = setInterval(() => {
      if (isPaused || !isMountedRef.current || showComments) return;
      currentStep++;
      const currentProgress = (currentStep / totalSteps) * 100;
      if (isMountedRef.current) setProgress(currentProgress);
      if (currentProgress >= 100) {
        if (isMountedRef.current) goToNextStory();
      }
    }, intervalTime);
  }, [stopMediaAndTimers, isPaused, goToNextStory, showComments]);

 const handleMediaError = React.useCallback((e: Event, type: 'video' | 'audio') => {
     const mediaElement = type === 'video' ? videoMediaRef.current : audioMusicRef.current;
     const error = mediaElement?.error;
     console.error(
       `Media Error Event (${type}): Code ${error?.code}, Message: ${error?.message}`,
       e,
       error
     );
     if (!isMountedRef.current) return;
     toast({
         variant: "destructive",
         title: `${type.charAt(0).toUpperCase() + type.slice(1)} Error`,
         description: `Could not load story ${type}. ${error?.message || 'Check console for details.'}`
     });
     if (isMountedRef.current) setIsPaused(true);
     if (isMountedRef.current) setProgress(100);
     if (isMountedRef.current) stopMediaAndTimers();
 }, [stopMediaAndTimers, toast]);


  const handleMediaLoaded = React.useCallback(() => {
    if (!isMountedRef.current || !activeStory) return;

    let duration = STORY_DURATION_SECONDS;

    if (resolvedVideoUrl && !youtubeVideoId && videoMediaRef.current && isFinite(videoMediaRef.current.duration)) {
        duration = videoMediaRef.current.duration;
        console.log(`Story Viewer: Video story, duration from video: ${duration}s`);
        if (!showComments && videoMediaRef.current && isMountedRef.current) videoMediaRef.current.play().catch(e => console.warn("Video autoplay prevented:", e));
    } else if (youtubeVideoId) {
        console.log(`Story Viewer: YouTube story.`);
        if (resolvedMusicUrl && audioMusicRef.current && isFinite(audioMusicRef.current.duration)) {
            const audioEl = audioMusicRef.current;
            const startTime = activeStory.musicStartTime ?? 0;
            audioEl.currentTime = startTime;
            const endTime = activeStory.musicEndTime ?? audioEl.duration;
            const musicEffectiveDuration = endTime > startTime ? endTime - startTime : audioEl.duration - startTime;
            duration = musicEffectiveDuration > 0 ? musicEffectiveDuration : STORY_DURATION_SECONDS;
            console.log(`Story Viewer: YouTube with Music, effective duration: ${duration}s`);
            if (!showComments && audioEl && isMountedRef.current) audioEl.play().catch(e => console.warn("Music autoplay for YouTube story prevented:", e));
        } else {
            duration = STORY_DURATION_SECONDS;
        }
    } else if (resolvedMusicUrl && audioMusicRef.current && isFinite(audioMusicRef.current.duration)) {
        const audioEl = audioMusicRef.current;
        const startTime = activeStory.musicStartTime ?? 0;
        audioEl.currentTime = startTime;
        const endTime = activeStory.musicEndTime ?? audioEl.duration;
        const musicEffectiveDuration = endTime > startTime ? endTime - startTime : audioEl.duration - startTime;
        duration = musicEffectiveDuration > 0 ? musicEffectiveDuration : 0.1;
        console.log(`Story Viewer: Music story, effective duration: ${duration}s`);
        if (!showComments && audioEl && isMountedRef.current) audioEl.play().catch(e => console.warn("Music autoplay prevented:", e));
    } else if (resolvedImageUrl && !resolvedVideoUrl && !resolvedMusicUrl) {
        console.log(`Story Viewer: Image story, using default duration: ${STORY_DURATION_SECONDS}s`);
    } else {
         console.warn(`Story Viewer: Could not determine media duration, using default: ${STORY_DURATION_SECONDS}s`);
    }

    if (!showComments && isMountedRef.current) startProgress(duration > 0 ? duration : STORY_DURATION_SECONDS);


  }, [activeStory, startProgress, resolvedVideoUrl, youtubeVideoId, resolvedMusicUrl, resolvedImageUrl, showComments]);

   React.useEffect(() => {
     if (!activeStory || !isMountedRef.current) {
        if (isMountedRef.current) stopMediaAndTimers();
        return;
     }

     if (isMountedRef.current) stopMediaAndTimers();
     if (isMountedRef.current) setProgress(0);
     if (isMountedRef.current) setIsPaused(false);

     const currentVideoElement = videoMediaRef.current;
     const currentAudioMusicElement = audioMusicRef.current;

     if (currentVideoElement && resolvedVideoUrl && !youtubeVideoId) {
         console.log(`Story Viewer: Setting up video: ${resolvedVideoUrl}`);
         if (currentVideoElement.currentSrc !== resolvedVideoUrl) {
            currentVideoElement.src = resolvedVideoUrl;
         }
         currentVideoElement.muted = isMuted || !!resolvedMusicUrl;
         currentVideoElement.loop = !resolvedMusicUrl;

         const onVideoLoaded = () => { if (isMountedRef.current) handleMediaLoaded(); };
         const onVideoEnded = () => { if (isMountedRef.current) goToNextStory(); };
         const onVideoPlay = () => { if (isMountedRef.current) setIsPaused(false); };
         const onVideoPause = () => { if (isMountedRef.current) setIsPaused(true); };
         const onVideoError = (e: Event) => { if (isMountedRef.current) handleMediaError(e, 'video'); };

         currentVideoElement.addEventListener('loadedmetadata', onVideoLoaded);
         currentVideoElement.addEventListener('ended', onVideoEnded);
         currentVideoElement.addEventListener('play', onVideoPlay);
         currentVideoElement.addEventListener('pause', onVideoPause);
         currentVideoElement.addEventListener('error', onVideoError);

         currentVideoElement.load();
         if (!showComments && isMountedRef.current) {
             currentVideoElement.play().catch(e => console.warn("Initial video play() caught:", e));
         }
         return () => {
            if (currentVideoElement) {
                currentVideoElement.removeEventListener('loadedmetadata', onVideoLoaded);
                currentVideoElement.removeEventListener('ended', onVideoEnded);
                currentVideoElement.removeEventListener('play', onVideoPlay);
                currentVideoElement.removeEventListener('pause', onVideoPause);
                currentVideoElement.removeEventListener('error', onVideoError);
            }
         };
     } else if (youtubeVideoId) {
        console.log(`Story Viewer: YouTube story detected: ${youtubeVideoId}`);
        if (isMountedRef.current) handleMediaLoaded(); // Start progress for YouTube, music handled separately
        // No direct return for event listeners cleanup for iframe, but audio will be handled
     }
     // This else-if handles background music for BOTH YouTube stories AND image-only stories
     if (currentAudioMusicElement && resolvedMusicUrl) { // Music can play with YouTube or Image
         console.log(`Story Viewer: Setting up music: ${resolvedMusicUrl}`);
         if (currentAudioMusicElement.currentSrc !== resolvedMusicUrl) {
             currentAudioMusicElement.src = resolvedMusicUrl;
         }
         currentAudioMusicElement.muted = isMuted;
         currentAudioMusicElement.currentTime = activeStory.musicStartTime ?? 0;
         currentAudioMusicElement.loop = activeStory.musicEndTime === null || (activeStory.musicEndTime <= (activeStory.musicStartTime ?? 0));

         const onMusicLoaded = () => { if (isMountedRef.current && (!youtubeVideoId || !resolvedVideoUrl)) handleMediaLoaded(); }; // Only call handleMediaLoaded if it's NOT a YouTube video handling it
         const onMusicEnded = () => { if (isMountedRef.current) goToNextStory(); };
         const onMusicPlay = () => { if (isMountedRef.current) setIsPaused(false); };
         const onMusicPause = () => { if (isMountedRef.current) setIsPaused(true); };
         const onMusicError = (e: Event) => { if (isMountedRef.current) handleMediaError(e, 'audio');};

         currentAudioMusicElement.addEventListener('loadedmetadata', onMusicLoaded);
         currentAudioMusicElement.addEventListener('ended', onMusicEnded);
         currentAudioMusicElement.addEventListener('play', onMusicPlay);
         currentAudioMusicElement.addEventListener('pause', onMusicPause);
         currentAudioMusicElement.addEventListener('error', onMusicError);

         currentAudioMusicElement.load();
         if (!showComments && isMountedRef.current) {
             currentAudioMusicElement.play().catch(e => console.warn("Initial music play() caught:", e));
         }
         return () => {
             if (currentAudioMusicElement) {
                currentAudioMusicElement.removeEventListener('loadedmetadata', onMusicLoaded);
                currentAudioMusicElement.removeEventListener('ended', onMusicEnded);
                currentAudioMusicElement.removeEventListener('play', onMusicPlay);
                currentAudioMusicElement.removeEventListener('pause', onMusicPause);
                currentAudioMusicElement.removeEventListener('error', onMusicError);
             }
         };
     }
     else if (resolvedImageUrl && !resolvedVideoUrl && !resolvedMusicUrl && !youtubeVideoId) { // Pure image, no other media
         console.log(`Story Viewer: Pure image story. Starting progress timer.`);
         if (!showComments && isMountedRef.current) startProgress(STORY_DURATION_SECONDS);
         else {
            if (isMountedRef.current) stopMediaAndTimers();
            if (isMountedRef.current) setIsPaused(true);
         }
     } else if (!resolvedImageUrl && !resolvedVideoUrl && !resolvedMusicUrl && !youtubeVideoId) { // No media at all
         console.warn("Story Viewer: No valid media (image, video, or music) found for the current story.");
         if (!showComments && isMountedRef.current) startProgress(0.1); // Quickly go to next
     }

   }, [currentIndex, activeStory, resolvedVideoUrl, youtubeVideoId, resolvedMusicUrl, resolvedImageUrl, stopMediaAndTimers, handleMediaLoaded, startProgress, isMuted, goToNextStory, handleMediaError, showComments]);


  const handleInteractionStart = React.useCallback(() => {
    if (!isPaused && !showComments && isMountedRef.current && !youtubeVideoId) { // Don't pause YouTube iframe this way
        if (isMountedRef.current) setIsPaused(true);
         if (videoMediaRef.current && !videoMediaRef.current.paused) videoMediaRef.current.pause();
         if (audioMusicRef.current && !audioMusicRef.current.paused) audioMusicRef.current.pause();
         if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
  }, [isPaused, showComments, youtubeVideoId]);

  const handleInteractionEnd = React.useCallback(() => {
    if (isPaused && !showComments && isMountedRef.current && activeStory && !youtubeVideoId) { // Don't resume YouTube iframe this way
        if (isMountedRef.current) setIsPaused(false);
        let durationForProgress = STORY_DURATION_SECONDS;
        let mediaToPlay: HTMLVideoElement | HTMLAudioElement | null = null;

        if (resolvedVideoUrl && videoMediaRef.current) {
            mediaToPlay = videoMediaRef.current;
            if (isFinite(mediaToPlay.duration)) {
                durationForProgress = mediaToPlay.duration - mediaToPlay.currentTime;
            }
        } else if (resolvedMusicUrl && audioMusicRef.current) {
            mediaToPlay = audioMusicRef.current;
            if (isFinite(mediaToPlay.duration)) {
                const startTime = activeStory.musicStartTime ?? 0;
                const endTime = activeStory.musicEndTime ?? mediaToPlay.duration;
                durationForProgress = endTime - mediaToPlay.currentTime;
            }
        } else if (resolvedImageUrl) {
             const elapsedRatio = progress / 100;
             durationForProgress = STORY_DURATION_SECONDS * (1 - elapsedRatio);
        }

        if (mediaToPlay) {
            mediaToPlay.play().catch(e => console.warn("Resume play prevented:", e));
        }
        if (isMountedRef.current) startProgress(durationForProgress > 0 ? durationForProgress : 0.1);
    } else if (youtubeVideoId && isPaused && !showComments && isMountedRef.current && activeStory) { // Handle resuming progress for YouTube with music
        if (isMountedRef.current) setIsPaused(false);
        let durationForProgress = STORY_DURATION_SECONDS;
        if (resolvedMusicUrl && audioMusicRef.current && isFinite(audioMusicRef.current.duration)) {
            const audioEl = audioMusicRef.current;
            const startTime = activeStory.musicStartTime ?? 0;
            const endTime = activeStory.musicEndTime ?? audioEl.duration;
            durationForProgress = endTime - audioEl.currentTime;
            if (isMountedRef.current) audioEl.play().catch(e => console.warn("Resume music play for YouTube story prevented:", e));
        } else {
            const elapsedRatio = progress / 100;
            durationForProgress = STORY_DURATION_SECONDS * (1 - elapsedRatio);
        }
        if (isMountedRef.current) startProgress(durationForProgress > 0 ? durationForProgress : 0.1);
    }
  }, [isPaused, showComments, activeStory, resolvedVideoUrl, youtubeVideoId, resolvedMusicUrl, resolvedImageUrl, progress, startProgress]);


  const handleDeleteClick = async () => {
    if (!activeStory || isDeleting || !isOwner || !isMountedRef.current) return;
    if (isMountedRef.current) setIsDeleting(true);
    if (isMountedRef.current) handleInteractionStart();
    try {
      await deletePost(activeStory.id, currentUserId || '');
      toast({ title: "Story Deleted", description: "The story has been removed." });
      if (isMountedRef.current) onDelete(activeStory.id);

      const remainingStories = userStories.filter(s => s.id !== activeStory.id);
      if (remainingStories.length === 0) {
         if (isMountedRef.current) onClose();
      } else {
         let nextIndexToShow = currentIndex;
         if (currentIndex >= remainingStories.length) {
            nextIndexToShow = remainingStories.length - 1;
         }
         if (isMountedRef.current) setCurrentIndex(Math.max(0, Math.min(nextIndexToShow, remainingStories.length - 1)));
         if (isMountedRef.current) setProgress(0);
         if (isMountedRef.current) setShowComments(false);
      }
    } catch (error: any) {
      console.error("Error deleting story:", error);
      toast({ title: "Delete Failed", description: error.message || "Could not delete the story.", variant: "destructive" });
      if (isMountedRef.current) handleInteractionEnd();
    } finally {
       if(isMountedRef.current) setIsDeleting(false);
    }
  };

  const toggleComments = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isMountedRef.current) return;
      setShowComments(prev => {
           const nextState = !prev;
           if (nextState) { // Opening comments
               if (isMountedRef.current) setIsPaused(true);
               if (videoMediaRef.current && !videoMediaRef.current.paused && !youtubeVideoId) videoMediaRef.current.pause();
               if (audioMusicRef.current && !audioMusicRef.current.paused) audioMusicRef.current.pause();
               if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
           } else { // Closing comments
                if(isPaused && isMountedRef.current) { // Only resume if it was paused due to comments
                     if (isMountedRef.current) setIsPaused(false); // Allow handleInteractionEnd to take over
                     if (isMountedRef.current) handleInteractionEnd();
                }
           }
           return nextState;
      });
  };


  if (!activeStory) {
    if(userStories.length === 0 && isMountedRef.current) {
        setTimeout(() => { if (isMountedRef.current) onClose(); }, 0);
    }
    return null;
  }

  return (
      <Dialog open={true} onOpenChange={(open) => { if (!open && isMountedRef.current) onClose(); }}>
        <DialogContent
            className="p-0 max-w-md w-[90vw] h-[85vh] md:h-[80vh] md:w-[25vw] md:max-w-[400px] border-0 shadow-2xl bg-black rounded-lg flex flex-col overflow-hidden"
             onInteractOutside={(e) => e.preventDefault()}
             onEscapeKeyDown={onClose}
        >
            <RadixDialogTitle className={cn("sr-only")}>
               Story by {activeStory.displayName || 'User'}
            </RadixDialogTitle>

          <div
            className="relative w-full h-full flex flex-col text-white select-none"
             onMouseDownCapture={!showComments ? handleInteractionStart : undefined}
             onTouchStartCapture={!showComments ? handleInteractionStart : undefined}
             onMouseUpCapture={!showComments ? handleInteractionEnd : undefined}
             onTouchEndCapture={!showComments ? handleInteractionEnd : undefined}
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
                      transition={{ duration: index === currentIndex ? 0.05 : 0.3, ease: "linear" }}
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
                     onClick={(e) => { e.stopPropagation(); if (isMountedRef.current) onClose(); }}
                     className="h-8 w-8 text-white/80 hover:bg-white/20 hover:text-white"
                     aria-label="Close story viewer"
                 >
                     <X className="w-5 h-5" />
                 </Button>
               </div>
            </div>

             {/* Navigation areas - ensure they don't cover vital controls when comments are open */}
             {!showComments && (
                <>
                    <div className="absolute inset-y-0 left-0 w-1/3 z-10" onClick={(e) => { e.stopPropagation(); if (isMountedRef.current) goToPrevStory(); }}></div>
                    <div className="absolute inset-y-0 right-0 w-1/3 z-10" onClick={(e) => { e.stopPropagation(); if (isMountedRef.current) goToNextStory(); }}></div>
                </>
             )}


            <div className="flex-1 flex items-center justify-center overflow-hidden relative bg-gray-900">
              {youtubeVideoId ? (
                <iframe
                  key={activeStory.id + '-youtube'}
                  className="w-full h-full aspect-video"
                  src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&mute=${isMuted || !!resolvedMusicUrl ? 1 : 0}&controls=0&showinfo=0&rel=0&modestbranding=1&loop=1&playlist=${youtubeVideoId}`}
                  title={activeStory.text ? `YouTube story: ${activeStory.text.substring(0,30)}...` : "YouTube story"}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  data-ai-hint="youtube story embed"
                />
              ) : resolvedVideoUrl ? (
                <video
                  ref={videoMediaRef}
                  key={activeStory.id + '-video'}
                  src={resolvedVideoUrl}
                  className="max-w-full max-h-full object-contain pointer-events-none"
                  playsInline
                  preload="auto"
                />
              ) : resolvedImageUrl ? (
                <Image
                  key={activeStory.id + '-image'}
                  src={resolvedImageUrl}
                  alt={activeStory.text || `Story by ${activeStory.displayName}`}
                  fill
                  style={{ objectFit: 'contain' }}
                  className="pointer-events-none"
                  priority={currentIndex === initialIndex}
                  unoptimized
                  data-ai-hint="user story image"
                />
              ) : (
                <div className="p-6 text-center text-gray-300 flex flex-col items-center gap-2">
                    <AlertTriangle className="w-10 h-10 text-yellow-400"/>
                    <span>No media found for this story.</span>
                </div>
              )}
               {resolvedMusicUrl && ( // Always render audio if musicUrl exists, even with YouTube
                   <audio
                       ref={audioMusicRef}
                       key={activeStory.id + '-music'}
                       src={resolvedMusicUrl}
                       playsInline
                       preload="auto"
                       className="hidden"
                   > Your browser does not support the audio element. </audio>
               )}
            </div>

             <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between z-20 bg-gradient-to-t from-black/60 to-transparent">
                {(resolvedVideoUrl || resolvedMusicUrl) ? ( // Show mute if video OR music exists
                     <Button
                         variant="ghost"
                         onClick={(e) => { e.stopPropagation(); if (isMountedRef.current) setIsMuted(!isMuted); }}
                         size="icon"
                         className="text-white/80 hover:bg-white/20 hover:text-white"
                         aria-label={isMuted ? "Unmute" : "Mute"}
                     >
                       {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                     </Button>
                ) : <div className="w-9 h-9" /> } {/* Placeholder for alignment */}

                <Button
                    variant="ghost"
                    onClick={toggleComments}
                    size="icon"
                    className={cn(
                        "text-white/80 hover:bg-white/20 hover:text-white",
                        showComments && "bg-white/20 text-white"
                    )}
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
                             onClick={(e) => {e.stopPropagation(); if (isMountedRef.current) handleInteractionStart();}}
                             className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                             aria-label="Delete story"
                             disabled={isDeleting}
                          >
                             {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
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
                                onClick={(e) => {e.stopPropagation(); if (isMountedRef.current) handleInteractionEnd(); }}>Cancel</AlertDialogCancel>
                             <AlertDialogAction
                                onClick={(e) => {e.stopPropagation(); if (isMountedRef.current) handleDeleteClick();}}
                                disabled={isDeleting}
                                className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                             >
                                {isDeleting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                                Delete
                             </AlertDialogAction>
                          </AlertDialogFooter>
                       </AlertDialogPrimitiveContent>
                    </AlertDialog>
                 ) : <div className="w-9 h-9" /> } {/* Placeholder for alignment */}
             </div>

             {!showComments && activeStory.text && (
                  <div className="absolute bottom-16 left-4 right-4 z-10 text-center pointer-events-none">
                      <p className="text-sm bg-black/70 px-2.5 py-1.5 rounded-md inline-block shadow-lg">{activeStory.text}</p>
                  </div>
              )}

             <AnimatePresence>
                {showComments && (
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="absolute inset-x-0 bottom-0 z-40 bg-background text-foreground max-h-[60%] min-h-[40%] rounded-t-lg shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onTouchStartCapture={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-3 border-b sticky top-0 bg-background z-10">
                            <h4 className="text-sm font-semibold">Comments ({activeStory.commentCount ?? 0})</h4>
                             <Button variant="ghost" size="icon" onClick={toggleComments} className="h-7 w-7">
                                <X className="w-4 h-4" />
                                <span className="sr-only">Close comments</span>
                             </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
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
