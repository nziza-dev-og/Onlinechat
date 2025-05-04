
"use client";

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form'; // Import Controller
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Image as ImageIcon, Video, Music, Clock, Play, Pause, AlertCircle } from 'lucide-react'; // Added AlertCircle
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { addPost, type PostInput } from '@/lib/posts.service';
import type { Post, PlatformConfig, MusicPlaylistItem } from '@/types'; // Added PlatformConfig import
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Import Select components
import { getPlatformConfig } from '@/lib/config.service'; // Import service to get config
import { cn, isDirectAudioUrl } from '@/lib/utils'; // Only need isDirectAudioUrl

// Validation schema specifically for stories
// Add validation for start/end times
const storySchema = z.object({
  text: z.string().max(200, { message: "Story text cannot exceed 200 characters." }).optional().nullable(),
  imageUrl: z.string().url({ message: "Please enter a valid image URL." }).max(1024).optional().or(z.literal('')).nullable(),
  videoUrl: z.string().url({ message: "Please enter a valid video URL." }).max(1024).optional().or(z.literal('')).nullable(),
  selectedMusicUrl: z.string().optional().nullable(),
  // Allow empty strings which will be parsed later, validate non-negative
  musicStartTime: z.string().optional().nullable(),
  musicEndTime: z.string().optional().nullable(),
}).refine(data => !!data.imageUrl?.trim() || !!data.videoUrl?.trim(), {
    // Stories must have visual content
    message: "Story must include an image URL or a video URL.",
    path: ["imageUrl"], // Associate error with imageUrl field
}).refine(data => {
    // Validate start time is non-negative number if provided
    if (data.musicStartTime && data.musicStartTime.trim() !== '') {
        const startTime = parseFloat(data.musicStartTime);
        return !isNaN(startTime) && startTime >= 0;
    }
    return true;
}, {
    message: "Start time must be a non-negative number.",
    path: ["musicStartTime"],
}).refine(data => {
    // Validate end time is a positive number if provided
    if (data.musicEndTime && data.musicEndTime.trim() !== '') {
        const endTime = parseFloat(data.musicEndTime);
        return !isNaN(endTime) && endTime > 0;
    }
    return true;
}, {
    message: "End time must be a positive number.",
    path: ["musicEndTime"],
}).refine(data => {
    // Validate end time is after start time if both are provided
    if (data.musicStartTime && data.musicStartTime.trim() !== '' && data.musicEndTime && data.musicEndTime.trim() !== '') {
        const startTime = parseFloat(data.musicStartTime);
        const endTime = parseFloat(data.musicEndTime);
        return !isNaN(startTime) && !isNaN(endTime) && endTime > startTime;
    }
    return true;
}, {
    message: "End time must be after start time.",
    path: ["musicEndTime"],
});

type StoryFormData = z.infer<typeof storySchema>;

interface StoryFormProps {
  onStoryAdded?: (newStory: Post) => void;
}


export function StoryForm({ onStoryAdded }: StoryFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [musicPlaylist, setMusicPlaylist] = React.useState<MusicPlaylistItem[]>([ { id: 'none', title: "No Music", url: "none" }]); // Default with 'No Music'
  const [loadingPlaylist, setLoadingPlaylist] = React.useState(true);
  const [isPreviewPlaying, setIsPreviewPlaying] = React.useState(false); // State for audio preview
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null); // Ref for preview audio element

  const form = useForm<StoryFormData>({
    resolver: zodResolver(storySchema),
    defaultValues: {
      text: '',
      imageUrl: '',
      videoUrl: '',
      selectedMusicUrl: "none",
      musicStartTime: '', // Initialize as empty strings
      musicEndTime: '',
    },
  });

  const selectedMusicTrackUrl = form.watch('selectedMusicUrl');
  const showTrimControls = selectedMusicTrackUrl && selectedMusicTrackUrl !== 'none';

   // Fetch music playlist on mount
   React.useEffect(() => {
     const fetchPlaylist = async () => {
         setLoadingPlaylist(true);
         try {
             const config = await getPlatformConfig();
             const fetchedPlaylist = config.musicPlaylist || [];
             // Ensure "No Music" is always the first option
             setMusicPlaylist([{ id: 'none', title: "No Music", url: "none" }, ...fetchedPlaylist]);
         } catch (error: any) {
             console.error("Error fetching music playlist:", error);
             toast({ title: "Error", description: "Could not load music playlist.", variant: "destructive" });
             // Keep the default "No Music" option
             setMusicPlaylist([{ id: 'none', title: "No Music", url: "none" }]);
         } finally {
             setLoadingPlaylist(false);
         }
     };
     fetchPlaylist();
   }, [toast]);

   // --- Audio Preview Logic ---
   const stopPreview = React.useCallback(() => {
     if (previewAudioRef.current) {
       previewAudioRef.current.pause();
       previewAudioRef.current.currentTime = 0;
     }
     setIsPreviewPlaying(false);
   }, []);

   const handlePreviewToggle = React.useCallback(() => {
        const audioUrl = selectedMusicTrackUrl;
        if (!audioUrl || audioUrl === 'none') return;

        // **Warn user for potentially non-direct URLs**
        if (!isDirectAudioUrl(audioUrl)) {
            toast({
                title: "Preview Might Fail",
                 description: (
                    <div className="flex items-start gap-2">
                       <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                       <span>
                        This doesn't look like a direct audio file link (e.g., .mp3). Preview might not work for streaming sites or pages.
                       </span>
                    </div>
                 ),
                duration: 7000,
            });
            console.warn("Attempting audio preview for potentially non-direct URL:", audioUrl);
            // Allow attempt but warn user
        }

        // Proceed with playing/creating the audio element
        if (!previewAudioRef.current) {
            try {
                 console.log("Creating new Audio element for:", audioUrl);
                 previewAudioRef.current = new Audio(audioUrl);
                 previewAudioRef.current.onended = () => setIsPreviewPlaying(false);
                 previewAudioRef.current.onerror = (e) => {
                     const mediaError = previewAudioRef.current?.error;
                     const errorCode = mediaError?.code; // Get error code (e.g., 4 for MEDIA_ERR_SRC_NOT_SUPPORTED)
                     const errorMessage = mediaError?.message || 'Unknown audio error'; // Get error message
                     console.error(`Audio preview error event. Code: ${errorCode}, Message: ${errorMessage}`, e); // Log code and message
                     toast({
                         variant: "destructive",
                         title: "Preview Error",
                         description: `Could not play audio preview. Ensure the URL is a direct link to an audio file and accessible. Error: ${errorMessage}` // Use error message from MediaError
                     });
                     setIsPreviewPlaying(false);
                 }
                 previewAudioRef.current.onpause = () => {
                      if (isPreviewPlaying) {
                         console.log("Audio preview paused (onpause event).");
                         setIsPreviewPlaying(false);
                      }
                 }
                 previewAudioRef.current.onplay = () => {
                      if (!isPreviewPlaying) {
                         console.log("Audio preview playing (onplay event).");
                         setIsPreviewPlaying(true);
                      }
                 }
            } catch (error) {
                 console.error("Error creating Audio element:", error);
                 toast({ variant: "destructive", title: "Preview Error", description: "Could not initialize audio player."});
                 return;
            }

        } else if (previewAudioRef.current.src !== audioUrl) {
             // Update src if it changed
             console.log("Updating Audio element src to:", audioUrl);
             previewAudioRef.current.src = audioUrl;
             previewAudioRef.current.load(); // Load new source
             setIsPreviewPlaying(false); // Reset playing state when source changes
        }

        // Toggle play/pause
        if (isPreviewPlaying) {
            console.log("User clicked pause preview.");
            previewAudioRef.current.pause();
            // onpause listener should set isPreviewPlaying to false
        } else {
            // Attempt to play and catch potential errors immediately
            previewAudioRef.current.currentTime = 0; // Start from beginning
            console.log("Attempting to play preview...");
            previewAudioRef.current.play().then(() => {
                 console.log("Audio preview play() successful.");
                 // onplay listener should set isPreviewPlaying to true
            }).catch(e => {
                console.error("Preview play() error:", e);
                toast({
                    variant: "destructive",
                    title: "Preview Error",
                    description: `Could not start audio preview. ${e.message || 'Interaction might be required.'}`
                });
                setIsPreviewPlaying(false); // Ensure state is false if play fails
            });
        }

   }, [selectedMusicTrackUrl, isPreviewPlaying, toast]); // Keep dependencies

   // Cleanup preview audio when component unmounts or track changes
   React.useEffect(() => {
     stopPreview(); // Stop preview when selected music changes

     return () => {
       // Cleanup on unmount
       stopPreview();
       if (previewAudioRef.current) {
           previewAudioRef.current.onended = null;
           previewAudioRef.current.onerror = null;
           previewAudioRef.current.onpause = null;
           previewAudioRef.current.onplay = null;
           previewAudioRef.current = null;
           console.log("Preview audio element cleaned up.");
       }
     };
   }, [selectedMusicTrackUrl, stopPreview]);
   // --- End Audio Preview Logic ---


  const onSubmit = async (data: StoryFormData) => {
    if (!user) {
        toast({ title: 'Authentication Error', description: 'You must be logged in to add a story.', variant: 'destructive' });
        return;
    }
    stopPreview(); // Stop preview before submitting
    setIsSubmitting(true);
    const finalMusicUrl = data.selectedMusicUrl === "none" ? null : data.selectedMusicUrl;
    // Parse start/end times, default to null if empty or invalid
    const startTime = data.musicStartTime && data.musicStartTime.trim() !== '' ? parseFloat(data.musicStartTime) : null;
    const endTime = data.musicEndTime && data.musicEndTime.trim() !== '' ? parseFloat(data.musicEndTime) : null;
    const finalStartTime = (startTime !== null && !isNaN(startTime) && startTime >= 0) ? startTime : null;
    const finalEndTime = (endTime !== null && !isNaN(endTime) && endTime > (finalStartTime ?? 0)) ? endTime : null;


    const storyInput: PostInput = {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        text: data.text?.trim() || null,
        imageUrl: data.imageUrl?.trim() || null,
        videoUrl: data.videoUrl?.trim() || null,
        musicUrl: finalMusicUrl,
        musicStartTime: finalStartTime,
        musicEndTime: finalEndTime,
        type: 'story',
    };


    try {
      console.log(`Creating story for user ${user.uid}...`, storyInput);
      const storyId = await addPost(storyInput);
      toast({
        title: 'Story Added!',
        description: 'Your story has been successfully shared.',
      });
      form.reset(); // Clear the form

       const tempStory: Post = {
           id: storyId,
           ...storyInput,
           timestamp: new Date(),
           type: 'story',
           likeCount: 0,
           likedBy: [],
           commentCount: 0,
       };
       onStoryAdded?.(tempStory);

    } catch (error: any) {
      console.error('Error creating story:', error);
      toast({
        title: 'Story Creation Failed',
        description: error.message || 'Could not add the story. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

   const watchedImageUrl = form.watch('imageUrl');
   const watchedVideoUrl = form.watch('videoUrl');
   const canSubmit = (!!watchedImageUrl?.trim() || !!watchedVideoUrl?.trim()) && form.formState.isValid;


  return (
    <Card className="w-full shadow-lg mb-8 border border-border/50 bg-card">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Add a Story</CardTitle>
          <CardDescription>Share a photo or video (visible for ~8 hours).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Image URL Input */}
          <div className="grid w-full gap-1.5">
             <Label htmlFor="imageUrlStory" className="flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-muted-foreground"/> Image URL *
             </Label>
             <Input
               id="imageUrlStory"
               type="url"
               placeholder="https://example.com/story.jpg"
               {...form.register('imageUrl')}
               disabled={isSubmitting || !!form.watch('videoUrl')}
             />
             {form.formState.errors.imageUrl && (
               <p className="text-sm text-destructive">{form.formState.errors.imageUrl.message}</p>
             )}
           </div>

           <div className="text-center text-xs text-muted-foreground">OR</div>

           {/* Video URL Input */}
          <div className="grid w-full gap-1.5">
             <Label htmlFor="videoUrlStory" className="flex items-center gap-1.5">
                <Video className="h-4 w-4 text-muted-foreground"/> Video URL *
             </Label>
             <Input
               id="videoUrlStory"
               type="url"
               placeholder="https://example.com/story.mp4"
               {...form.register('videoUrl')}
               disabled={isSubmitting || !!form.watch('imageUrl')}
             />
             {form.formState.errors.videoUrl && (
               <p className="text-sm text-destructive">{form.formState.errors.videoUrl.message}</p>
             )}
           </div>

           <Separator />

           {/* Background Music Select (Optional) */}
           <div className="grid w-full gap-1.5">
              <Label htmlFor="musicSelectStory" className="flex items-center gap-1.5">
                 <Music className="h-4 w-4 text-muted-foreground"/> Background Music (Optional)
              </Label>
               {/* Flex container for Select and Preview Button */}
               <div className="flex items-center gap-2">
                 <Controller
                    name="selectedMusicUrl"
                    control={form.control}
                    render={({ field }) => (
                       <Select
                         value={field.value ?? "none"}
                         onValueChange={(value) => {
                              field.onChange(value);
                              stopPreview(); // Stop preview when selection changes
                              // Reset trim times if music is set to none
                              if (value === 'none') {
                                  form.setValue('musicStartTime', '');
                                  form.setValue('musicEndTime', '');
                              }
                         }}
                         disabled={isSubmitting || loadingPlaylist}
                       >
                         <SelectTrigger id="musicSelectStory" className="flex-1"> {/* Use flex-1 */}
                            <SelectValue placeholder={loadingPlaylist ? "Loading music..." : "Select music..."} />
                         </SelectTrigger>
                         <SelectContent>
                            {loadingPlaylist && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                            {!loadingPlaylist && musicPlaylist.length === 1 && <SelectItem value="no-music" disabled>No music available</SelectItem>}
                            {!loadingPlaylist && musicPlaylist.map((song) => (
                              <SelectItem key={song.id || 'none'} value={song.url || 'none'}>
                                {song.title}
                              </SelectItem>
                            ))}
                         </SelectContent>
                       </Select>
                    )}
                 />
                 {/* Preview Button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handlePreviewToggle}
                    disabled={isSubmitting || loadingPlaylist || !selectedMusicTrackUrl || selectedMusicTrackUrl === 'none'}
                    className={cn("flex-shrink-0 h-10 w-10", isPreviewPlaying && "bg-accent text-accent-foreground")} // Highlight when playing
                    aria-label={isPreviewPlaying ? "Stop preview" : "Preview music"}
                  >
                    {isPreviewPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </Button>
               </div>
              <p className="text-xs text-muted-foreground">Select a song from the list. Preview may not work for all URL types (e.g., streaming sites, pages).</p>
           </div>

           {/* Music Trim Controls (Conditional) */}
           {showTrimControls && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t mt-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="musicStartTime" className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-muted-foreground"/> Start Time (sec)
                        </Label>
                        <Input
                            id="musicStartTime"
                            type="number"
                            step="0.1" // Allow decimal seconds
                            min="0"
                            placeholder="e.g., 0"
                            {...form.register('musicStartTime')}
                            disabled={isSubmitting}
                        />
                         {form.formState.errors.musicStartTime && (
                            <p className="text-sm text-destructive">{form.formState.errors.musicStartTime.message}</p>
                         )}
                    </div>
                     <div className="space-y-1.5">
                         <Label htmlFor="musicEndTime" className="flex items-center gap-1.5">
                             <Clock className="h-4 w-4 text-muted-foreground"/> End Time (sec)
                         </Label>
                         <Input
                            id="musicEndTime"
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="e.g., 15"
                            {...form.register('musicEndTime')}
                            disabled={isSubmitting}
                         />
                         {form.formState.errors.musicEndTime && (
                             <p className="text-sm text-destructive">{form.formState.errors.musicEndTime.message}</p>
                         )}
                     </div>
                      <p className="text-xs text-muted-foreground col-span-2">Optionally trim the selected music track. Leave blank to use the full track.</p>
                </div>
           )}


           <Separator />

           {/* Text Input (Optional for stories) */}
          <div className="grid w-full gap-1.5">
            <Label htmlFor="textStory">Caption (Optional)</Label>
            <Textarea
              id="textStory"
              placeholder="Add a short caption..."
              maxLength={200}
              {...form.register('text')}
              disabled={isSubmitting}
              className="min-h-[60px]"
            />
            {form.formState.errors.text && (
              <p className="text-sm text-destructive">{form.formState.errors.text.message}</p>
            )}
             <p className="text-xs text-muted-foreground text-right">
                {form.watch('text')?.length ?? 0} / 200
             </p>
          </div>


        </CardContent>
        <CardFooter className="flex justify-end pt-4 border-t border-border/50">
          <Button type="submit" disabled={isSubmitting || !canSubmit} size="lg">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Add Story
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

