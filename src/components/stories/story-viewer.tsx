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
import { AnimatePresence, motion } from "framer-motion"; // Import animation library
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
  const audioRef = React.useRef<HTMLAudioElement>(null); // Ref for audio element
  const [isMuted, setIsMuted] = React.useState(false); // State for music mute
  const [hasInteracted, setHasInteracted] = React.useState(false); // Track user interaction for autoplay
  const { toast } = useToast(); // Get toast

  const activeStory = openStory ? stories.find(s => s.id === openStory.id) : null;
  const isOwner = activeStory ? userId === activeStory.uid : false; // Check if the current user owns the active story

  // Resolve media URLs for the active story
  const resolvedImageUrl = activeStory ? resolveMediaUrl(activeStory.imageUrl) : undefined;
  const resolvedVideoUrl = resolveMediaUrl(activeStory.videoUrl);