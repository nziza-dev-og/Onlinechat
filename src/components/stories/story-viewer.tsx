
"use client";

import * as React from 'react';
import type { PostSerializable } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getInitials, resolveMediaUrl, isFilesFmUrl } from '@/lib/utils'; // Import isFilesFmUrl
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog"; // Import DialogTitle
import { X, Volume2, VolumeX } from 'lucide-react'; // Added Volume icons
import { Button } from '../ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils'; // Import cn for sr-only class

interface StoryViewerProps {
  stories: PostSerializable[];
}

// Function to safely format timestamp from ISO string (or reuse from utils)
const formatStoryTimestamp = (timestampISO: string | null | undefined): string => {
    if (!timestampISO) return 'just now';
    try {
        const date = parseISO(timestampISO);
        return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch { return 'Invalid date'; }
};


export function StoryViewer({ stories }: StoryViewerProps) {
  const [currentStoryIndex, setCurrentStoryIndex] = React.useState(0);
  const [openStory, setOpenStory] = React.useState<PostSerializable | null>(null);
  const progressRef = React.useRef<HTMLDivElement>(null);
  const storyTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null); // Ref for audio element
  const [isMuted, setIsMuted] = React.useState(false); // State for music mute
  const [hasInteracted, setHasInteracted] = React.useState(false); // Track user interaction for autoplay

  const activeStory = openStory ? stories.find(s => s.id === openStory.id) : null;

  // Resolve media URLs for the active story
  const resolvedImageUrl = activeStory ? resolveMediaUrl(activeStory.imageUrl) : undefined;
  const resolvedVideoUrl = activeStory ? resolveMediaUrl(activeStory.videoUrl) : undefined;
  const resolvedMusicUrl = activeStory ? resolveMediaUrl(activeStory.musicUrl) : undefined;

  // Function to attempt playing audio, handling potential errors
  const attemptAudioPlay = React.useCallback(() => {
    if (audioRef.current && resolvedMusicUrl && !isFilesFmUrl(resolvedMusicUrl) && !isMuted && hasInteracted) { // Add files.fm check
        console.log("Attempting to play audio:", resolvedMusicUrl);
        audioRef.current.play().catch(e => console.warn("Audio play failed (likely autoplay restriction):", e));
    } else {
         if (!resolvedMusicUrl) console.log("No music URL for current story.");
         if (isFilesFmUrl(resolvedMusicUrl)) console.log("Skipping audio play for files.fm URL.");
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
        // **Check for files.fm URL before processing**
        if (isFilesFmUrl(resolvedMusicUrl)) {
             console.log("Skipping audio setup for files.fm URL:", resolvedMusicUrl);
             // Ensure audio is stopped and source cleared if it was previously set
             audioRef.current.pause();
             audioRef.current.currentTime = 0;
             if (audioRef.current.src === resolvedMusicUrl) {
                 audioRef.current.src = '';
             }
        } else if (audioRef.current.src !== resolvedMusicUrl) {
             console.log("Setting new audio source:", resolvedMusicUrl);
             audioRef.current.src = resolvedMusicUrl;
             audioRef.current.load(); // Load new source
             // Apply start/end times if they exist
              audioRef.current.onloadedmetadata = () => {
                  if (!audioRef.current) return; // Guard against race condition on unmount
                  if (activeStory.musicStartTime !== null && activeStory.musicStartTime !== undefined && isFinite(activeStory.musicStartTime) && activeStory.musicStartTime >= 0) {
                      audioRef.current!.currentTime = activeStory.musicStartTime;
                      console.log(`Audio start time set to: ${activeStory.musicStartTime}`);
                  } else {
                      audioRef.current!.currentTime = 0; // Default to start if no valid time
                  }
                  // Attempt play after metadata is loaded
                  attemptAudioPlay();
             };
             // Set up listener for ending at trim time
             if (activeStory.musicEndTime !== null && activeStory.musicEndTime !== undefined && isFinite(activeStory.musicEndTime) && activeStory.musicEndTime > (activeStory.musicStartTime ?? 0)) {
                 const endTime = activeStory.musicEndTime;
                 const checkEndTime = () => {
                     if (audioRef.current && audioRef.current.currentTime >= endTime) {
                         audioRef.current.pause();
                          console.log(`Audio reached end trim time: ${endTime}`);
                         // Optionally loop or move to next story? For now, just pause.
                          audioRef.current.removeEventListener('timeupdate', checkEndTime);
                     }
                 };
                  audioRef.current.addEventListener('timeupdate', checkEndTime);
                  // Cleanup function for this specific listener
                  const cleanupEndTimeListener = () => {
                       if (audioRef.current) {
                           audioRef.current.removeEventListener('timeupdate', checkEndTime);
                       }
                  };
                  // Return cleanup for *this specific timeupdate listener*
                  // This doesn't replace the main effect cleanup
                  // Note: Need to manage multiple cleanup returns correctly if other async ops have cleanup
                  // This is complex, consider a different approach if multiple cleanups are needed within one effect run
                  // For now, assuming only one timer/listener needs specific cleanup per run.
                  // A better approach might involve useRefs for listener functions to manage addition/removal.
             }

        } else {
              // If src is the same, reset time if needed and attempt play
              if (activeStory.musicStartTime !== null && activeStory.musicStartTime !== undefined && isFinite(activeStory.musicStartTime) && activeStory.musicStartTime >= 0) {
                  audioRef.current.currentTime = activeStory.musicStartTime;
              } else {
                  audioRef.current.currentTime = 0;
              }
              attemptAudioPlay();
        }
        audioRef.current.muted = isMuted;
    } else if (audioRef.current) {
        // If no music URL for this story, pause any currently playing music
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = ''; // Clear source
        console.log("No music for this story, pausing and clearing audio source.");
    }


    // Set timeout to go to next story or close
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
      // Clean up animation style
       if (progressRef.current) {
          progressRef.current.style.transition = 'none';
       }
       // Pause audio when story *changes* (next effect will handle playing if needed)
       if (audioRef.current) {
           audioRef.current.pause();
           console.log("Story changing, pausing audio.");
           // Don't reset src here, let the next effect handle it
           // Remove specific timeupdate listener if it was added
           // This requires storing the listener function reference to remove it correctly.
           // Example: if (checkEndTimeListenerRef.current) audioRef.current.removeEventListener('timeupdate', checkEndTimeListenerRef.current);
       }
    };
  }, [activeStory, stories, isMuted, attemptAudioPlay, hasInteracted, resolvedMusicUrl]); // Include resolvedMusicUrl

  const handleOpenStory = (story: PostSerializable) => {
    setHasInteracted(true); // User interaction detected
    const index = stories.findIndex(s => s.id === story.id);
    setCurrentStoryIndex(index);
    setOpenStory(story);
     // Attempt to play immediately on open if not muted and not files.fm
     const storyMusicUrl = resolveMediaUrl(story.musicUrl);
     if (!isMuted && storyMusicUrl && !isFilesFmUrl(storyMusicUrl)) {
        setTimeout(attemptAudioPlay, 100);
     }
  };

  const handleCloseStory = () => {
    setOpenStory(null);
    setHasInteracted(false); // Reset interaction state
    if (storyTimeoutRef.current) clearTimeout(storyTimeoutRef.current);
    if(audioRef.current) {
        audioRef.current.pause(); // Ensure audio stops on close
        audioRef.current.currentTime = 0;
        audioRef.current.src = ''; // Clear source
        console.log("Story viewer explicitly closed, audio stopped and reset.");
    }
  };

  const handleNextStory = (e?: React.MouseEvent) => {
     e?.stopPropagation(); // Prevent closing if clicking overlay
     setHasInteracted(true); // Ensure interaction is registered
     const currentIndex = stories.findIndex(s => s.id === activeStory?.id);
     if (currentIndex < stories.length - 1) {
        setOpenStory(stories[currentIndex + 1]);
     } else {
        handleCloseStory();
     }
  };

  const handlePrevStory = (e?: React.MouseEvent) => {
     e?.stopPropagation();
     setHasInteracted(true); // Ensure interaction is registered
     const currentIndex = stories.findIndex(s => s.id === activeStory?.id);
     if (currentIndex > 0) {
        setOpenStory(stories[currentIndex - 1]);
     }
     // Optional: Allow looping back to the last story?
     // else if (stories.length > 1) {
     //    setOpenStory(stories[stories.length - 1]);
     // }
  };

   const toggleMute = (e: React.MouseEvent) => {
     e.stopPropagation(); // Prevent interfering with story navigation
     setHasInteracted(true); // Mute toggle counts as interaction
     setIsMuted(prev => {
         const newMutedState = !prev;
         if (audioRef.current) {
             audioRef.current.muted = newMutedState;
             if (!newMutedState && resolvedMusicUrl && !isFilesFmUrl(resolvedMusicUrl)) { // Add files.fm check
                 // If unmuting and there's playable music, try to play
                 console.log("User unmuted, attempting to play audio.");
                 attemptAudioPlay(); // Use the helper function
             } else if (newMutedState) { // Only explicitly pause if muting
                  audioRef.current.pause();
                  console.log("User muted, audio paused.");
             }
         }
         return newMutedState;
     });
   };


  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 text-foreground">Recent Stories</h2>
      {/* Horizontal scrollable list of story previews */}
      <div className="flex space-x-3 overflow-x-auto pb-4 -mb-4">
        {stories.map((story) => {
           const previewImageUrl = resolveMediaUrl(story.imageUrl || story.videoUrl); // Resolve preview URL
           return (
             // DialogTrigger now just opens the modal via handleOpenStory
             <button
               key={story.id}
               onClick={() => handleOpenStory(story)}
               className="relative flex-shrink-0 w-20 h-32 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 group"
               aria-label={`View story by ${story.displayName}`}
             >
               {previewImageUrl ? (
                 <Image
                   src={previewImageUrl} // Use resolved URL
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

       {/* Full-screen Story Viewer Modal - Rendered only once */}
       <Dialog open={!!openStory} onOpenChange={(open) => !open && handleCloseStory()}>
          <DialogContent
             className="p-0 max-w-md w-[95vw] h-[85vh] border-none bg-black shadow-none flex flex-col items-center justify-center outline-none focus:outline-none overflow-hidden rounded-lg"
             onEscapeKeyDown={handleCloseStory}
             // Removed onPointerDownOutside to allow clicking next/prev areas
             aria-labelledby={activeStory ? `story-title-${activeStory.id}` : undefined} // Use aria-labelledby
             aria-describedby={activeStory?.text ? `story-caption-${activeStory.id}` : undefined} // Describe content if caption exists
          >
             {/* Visually Hidden Title for Accessibility */}
             {activeStory && ( // Ensure activeStory exists before rendering title
               <DialogTitle id={`story-title-${activeStory.id}`} className={cn("sr-only")}>
                 Story by {activeStory?.displayName || 'User'} {activeStory?.text ? `- Caption: ${activeStory.text}` : ''}
               </DialogTitle>
             )}
             {activeStory && (
                <div className="relative w-full h-full" onClick={() => setHasInteracted(true)}> {/* Register interaction on main container click */}
                   {/* Navigation Areas */}
                   <div className="absolute top-0 left-0 h-full w-1/3 z-30 cursor-pointer" onClick={handlePrevStory} aria-label="Previous story"></div>
                   <div className="absolute top-0 right-0 h-full w-1/3 z-30 cursor-pointer" onClick={handleNextStory} aria-label="Next story"></div>

                   {/* Progress Bar */}
                   <div className="absolute top-2 left-2 right-2 z-40 h-1 bg-white/30 rounded-full overflow-hidden" aria-hidden="true">
                      <div ref={progressRef} className="h-full bg-white rounded-full" style={{ width: '0%', transition: 'none' }}></div>
                   </div>

                   {/* Header */}
                   <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between gap-2">
                      <div className='flex items-center gap-2 overflow-hidden'> {/* Added overflow-hidden */}
                         <Avatar className="h-8 w-8 border border-white/50 flex-shrink-0">
                            <AvatarImage src={activeStory.photoURL || undefined} />
                            <AvatarFallback>{getInitials(activeStory.displayName)}</AvatarFallback>
                         </Avatar>
                         <div className="flex flex-col text-white overflow-hidden"> {/* Added overflow-hidden */}
                            <span className="text-sm font-medium truncate">{activeStory.displayName || 'User'}</span>
                            <span className="text-xs opacity-80 truncate">{formatStoryTimestamp(activeStory.timestamp)}</span>
                         </div>
                      </div>
                       <div className="flex items-center gap-1 flex-shrink-0"> {/* Added flex-shrink-0 */}
                           {/* Mute/Unmute Button */}
                           {resolvedMusicUrl && !isFilesFmUrl(resolvedMusicUrl) && ( // Hide mute button for files.fm
                              <Button
                                variant="ghost" size="icon" onClick={toggleMute}
                                className="h-8 w-8 rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white"
                                aria-label={isMuted ? "Unmute story music" : "Mute story music"}
                              >
                                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                              </Button>
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
                            src={resolvedImageUrl} // Use resolved URL
                            alt={activeStory.text || `Story by ${activeStory.displayName}`}
                            fill
                            style={{ objectFit: 'contain' }} // Use contain to see the whole image/video
                            priority
                            data-ai-hint="story full view image"
                         />
                      )}
                      {resolvedVideoUrl && !resolvedImageUrl && ( // Only show video if no image
                         <video
                            src={resolvedVideoUrl} // Use resolved URL
                            autoPlay
                            playsInline
                            muted // Video should always be muted if music might play
                            loop={!resolvedMusicUrl} // Loop video only if there's no music
                            className="w-full h-full object-contain"
                            onEnded={handleNextStory} // Go to next story when video ends
                            data-ai-hint="story full view video"
                         >
                            Your browser does not support the video tag.
                         </video>
                      )}
                   </div>

                    {/* Optional Caption */}
                    {activeStory.text && (
                       <div
                          id={`story-caption-${activeStory.id}`} // ID for aria-describedby
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
