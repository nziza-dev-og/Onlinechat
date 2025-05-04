
'use client';

import * as React from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogOverlay, DialogTitle } from '@/components/ui/dialog'; // Import DialogTitle
import { cn } from '@/lib/utils'; // Import cn

interface FullScreenImageViewerProps {
  imageUrl: string;
  altText: string;
  onClose: () => void;
}

export function FullScreenImageViewer({ imageUrl, altText, onClose }: FullScreenImageViewerProps) {
  // Use Dialog component, controlling its open state via onClose prop
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogOverlay className="bg-black/80 backdrop-blur-sm" />
      <DialogContent
        className="p-0 max-w-[90vw] max-h-[90vh] w-auto h-auto border-none bg-transparent shadow-none flex items-center justify-center outline-none focus:outline-none"
        onEscapeKeyDown={onClose}
        onPointerDownOutside={onClose}
        aria-label="Full screen image viewer"
        aria-describedby={altText ? 'image-viewer-description' : undefined} // Optional description if altText is used
      >
        {/* Visually Hidden Title for Accessibility */}
        <DialogTitle className={cn("sr-only")} id="image-viewer-title">
          {altText || 'Full screen image'}
        </DialogTitle>
        <div className="relative w-full h-full flex items-center justify-center">
           {/* Close button positioned top-right */}
           <Button
               variant="ghost"
               size="icon"
               onClick={onClose}
               className="absolute top-2 right-2 z-50 h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
               aria-label="Close image viewer"
           >
               <X className="h-6 w-6" />
           </Button>

           {/* Image Container */}
           <div className="relative max-w-full max-h-full overflow-hidden">
               <Image
                   src={imageUrl}
                   alt={altText}
                   width={1920} // Set a large base width
                   height={1080} // Set a large base height
                   style={{
                       width: 'auto', // Let the browser scale down
                       height: 'auto',
                       maxWidth: '100%', // Ensure it fits width-wise
                       maxHeight: 'calc(90vh - 4rem)', // Fit height-wise, accounting for potential padding/margins
                       objectFit: 'contain', // Ensure the whole image is visible
                   }}
                   className="block"
                   data-ai-hint="full screen chat image"
                   unoptimized // Useful if images can be external and varied
                   priority // Prioritize loading the full-screen image
                   // Add aria-describedby if using altText as a description
                   aria-describedby={altText ? 'image-viewer-description' : undefined}
               />
               {/* Optional hidden description for screen readers */}
               {altText && <p id="image-viewer-description" className={cn("sr-only")}>{altText}</p>}
           </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
