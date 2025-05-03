"use client";

import * as React from 'react';
import type { PostSerializable } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getInitials } from '@/lib/utils'; // Assuming getInitials is moved to utils
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog"; // Import DialogTitle
import { X } from 'lucide-react';
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

  const activeStory = openStory ? stories.find(s => s.id === openStory.id) : null;

  // Handle story progression
  React.useEffect(() => {
    if (!activeStory) return;

    // Reset progress animation
    if (progressRef.current) {
      progressRef.current.style.width = '0%';
      // Force reflow to restart animation
      void progressRef.current.offsetWidth;
      progressRef.current.style.transition = 'width 5s linear'; // Duration of story display
      progressRef.current.style.width = '100%';
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
    };
  }, [activeStory, stories]);

  const handleOpenStory = (story: PostSerializable) => {
    const index = stories.findIndex(s => s.id === story.id);
    setCurrentStoryIndex(index);
    setOpenStory(story);
  };

  const handleCloseStory = () => {
    setOpenStory(null);
    if (storyTimeoutRef.current) clearTimeout(storyTimeoutRef.current);
  };

  const handleNextStory = (e?: React.MouseEvent) => {
     e?.stopPropagation(); // Prevent closing if clicking overlay
     const currentIndex = stories.findIndex(s => s.id === activeStory?.id);
     if (currentIndex < stories.length - 1) {
        setOpenStory(stories[currentIndex + 1]);
     } else {
        handleCloseStory();
     }
  };

  const handlePrevStory = (e?: React.MouseEvent) => {
     e?.stopPropagation();
     const currentIndex = stories.findIndex(s => s.id === activeStory?.id);
     if (currentIndex > 0) {
        setOpenStory(stories[currentIndex - 1]);
     }
  };


  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 text-foreground">Recent Stories</h2>
      {/* Horizontal scrollable list of story previews */}
      <div className="flex space-x-3 overflow-x-auto pb-4 -mb-4">
        {stories.map((story, index) => (
           <Dialog key={story.id} onOpenChange={(open) => !open && handleCloseStory()}>
            <DialogTrigger asChild>
             <button
               onClick={() => handleOpenStory(story)}
               className="relative flex-shrink-0 w-20 h-32 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 group"
             >
               {story.imageUrl || story.videoUrl ? (
                 <Image
                   src={story.imageUrl || story.videoUrl || ''} // Prioritize image for preview
                   alt={`Story by ${story.displayName}`}
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
             </DialogTrigger>
             {/* Separate DialogContent is needed if using DialogTrigger */}
           </Dialog>
        ))}
      </div>

       {/* Full-screen Story Viewer Modal */}
       <Dialog open={!!openStory} onOpenChange={(open) => !open && handleCloseStory()}>
          <DialogContent
             className="p-0 max-w-md w-[95vw] h-[85vh] border-none bg-black shadow-none flex flex-col items-center justify-center outline-none focus:outline-none overflow-hidden rounded-lg"
             onEscapeKeyDown={handleCloseStory}
             // Removed onPointerDownOutside to allow clicking next/prev areas
             aria-labelledby={activeStory ? `story-title-${activeStory.id}` : undefined} // Use aria-labelledby
             aria-describedby={activeStory?.text ? `story-caption-${activeStory.id}` : undefined} // Describe content if caption exists
          >
             {/* Visually Hidden Title for Accessibility */}
             <DialogTitle id={activeStory ? `story-title-${activeStory.id}` : undefined} className={cn("sr-only")}>
               Story by {activeStory?.displayName || 'User'}
             </DialogTitle>
             {activeStory && (
                <div className="relative w-full h-full">
                   {/* Navigation Areas */}
                   <div className="absolute top-0 left-0 h-full w-1/3 z-30 cursor-pointer" onClick={handlePrevStory} aria-label="Previous story"></div>
                   <div className="absolute top-0 right-0 h-full w-1/3 z-30 cursor-pointer" onClick={handleNextStory} aria-label="Next story"></div>

                   {/* Progress Bar */}
                   <div className="absolute top-2 left-2 right-2 z-40 h-1 bg-white/30 rounded-full overflow-hidden" aria-hidden="true">
                      <div ref={progressRef} className="h-full bg-white rounded-full" style={{ width: '0%', transition: 'none' }}></div>
                   </div>

                   {/* Header */}
                   <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between gap-2">
                      <div className='flex items-center gap-2'>
                         <Avatar className="h-8 w-8 border border-white/50">
                            <AvatarImage src={activeStory.photoURL || undefined} />
                            <AvatarFallback>{getInitials(activeStory.displayName)}</AvatarFallback>
                         </Avatar>
                         <div className="flex flex-col text-white">
                            <span className="text-sm font-medium">{activeStory.displayName || 'User'}</span>
                            <span className="text-xs opacity-80">{formatStoryTimestamp(activeStory.timestamp)}</span>
                         </div>
                      </div>
                      <Button
                         variant="ghost" size="icon" onClick={handleCloseStory}
                         className="h-8 w-8 rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white"
                         aria-label="Close story viewer"
                      >
                         <X className="h-5 w-5" />
                      </Button>
                   </div>

                   {/* Media Content */}
                   <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                      {activeStory.imageUrl && (
                         <Image
                            src={activeStory.imageUrl}
                            alt={activeStory.text || `Story by ${activeStory.displayName}`}
                            fill
                            style={{ objectFit: 'contain' }} // Use contain to see the whole image/video
                            priority
                            data-ai-hint="story full view image"
                         />
                      )}
                      {activeStory.videoUrl && !activeStory.imageUrl && ( // Only show video if no image
                         <video
                            src={activeStory.videoUrl}
                            autoPlay
                            playsInline
                            muted // Mute story videos by default? Consider user preference.
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
                </div>
             )}
          </DialogContent>
       </Dialog>

    </div>
  );
}
