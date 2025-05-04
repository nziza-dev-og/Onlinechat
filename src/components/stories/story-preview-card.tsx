
"use client";

import * as React from 'react';
import type { UserProfile } from '@/types'; // Assuming UserProfile has uid, displayName, photoURL
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, resolveMediaUrl, cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton

interface StoryPreviewCardProps {
  userProfile: UserProfile;
  // You might pass the first story's media URL for the preview image
  previewImageUrl?: string | null;
  hasUnread?: boolean; // Optional: To show a ring if there are unread stories
  onClick: () => void;
}

export function StoryPreviewCard({
  userProfile,
  previewImageUrl,
  hasUnread = false, // Default to false
  onClick
}: StoryPreviewCardProps) {
  const resolvedPreviewUrl = resolveMediaUrl(previewImageUrl);

  return (
    <div
      className="flex flex-col items-center space-y-1.5 cursor-pointer group w-20 sm:w-24 flex-shrink-0"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View stories by ${userProfile.displayName || 'User'}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
       {/* Avatar with ring */}
      <div className={cn(
          "relative rounded-full p-0.5",
           hasUnread ? "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600" : "bg-border" // Example ring styles
      )}>
        <Avatar className="h-14 w-14 sm:h-16 sm:h-16 border-2 border-background">
           <AvatarImage src={userProfile.photoURL || undefined} alt={userProfile.displayName || 'User'} data-ai-hint="story preview avatar"/>
           <AvatarFallback className="text-xl">{getInitials(userProfile.displayName)}</AvatarFallback>
        </Avatar>
         {/* Optional: Add a plus icon for adding own story */}
         {/* {isOwnStoryPreview && <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-0.5 border-2 border-background"><Plus className="w-3 h-3"/></div>} */}
      </div>
       {/* Username */}
      <p className="text-xs font-medium text-foreground truncate w-full text-center px-1">
        {userProfile.displayName || 'User'}
      </p>
    </div>
  );
}


// Optional Skeleton for loading state
export const StoryPreviewCardSkeleton = () => (
   <div className="flex flex-col items-center space-y-1.5 w-20 sm:w-24 flex-shrink-0">
     <Skeleton className="h-14 w-14 sm:h-16 sm:h-16 rounded-full" />
     <Skeleton className="h-3 w-16" />
   </div>
);
