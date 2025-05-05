
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
import { Loader2, Send, Image as ImageIcon, Video, Music, Clock, Play, Pause, AlertCircle, Link as LinkIcon } from 'lucide-react'; // Added AlertCircle, LinkIcon
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
// Add validation for start/end times and custom music URL
const storySchema = z.object({
  text: z.string().max(200, { message: "Story text cannot exceed 200 characters." }).optional().nullable(),
  imageUrl: z.string().url({ message: "Please enter a valid image URL." }).max(1024).optional().or(z.literal('')).nullable(),
  videoUrl: z.string().url({ message: "Please enter a valid video URL." }).max(1024).optional().or(z.literal('')).nullable(),
  selectedMusicUrl: z.string().optional().nullable(), // From dropdown
  customMusicUrl: z.string().url({ message: "Please enter a valid audio URL." }).max(1024).optional().or(z.literal('')).nullable(), // Custom URL input
  // Allow empty strings which will be parsed later, validate non-negative
  musicStartTime: z.string().optional().nullable(),
  musicEndTime: z.string().optional().nullable(),
}).refine(data => !!data.imageUrl?.trim() || !!data.videoUrl?.trim(), {
    // Stories must have visual content
    message: "Story must include an image URL or a video URL.",
    path: ["imageUrl"], // Associate error with imageUrl field
}).refine(data => {
    // Ensure either selectedMusicUrl (not 'none') OR customMusicUrl is provided, but not both simultaneously.
    const hasSelection = data.selectedMusicUrl && data.selectedMusicUrl !== 'none';
    const hasCustom = !!data.customMusicUrl?.trim();
    if (hasSelection && hasCustom) {
        return false; // Cannot have both selected track and custom URL
    }
    return true; // Ok if one, the other, or neither is provided
}, {
    message: "Choose a track from the list OR enter a custom URL, not both.",
    path: ["customMusicUrl"], // Associate error with custom URL field for now
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
        // Ensure both are valid numbers before comparing
        if (isNaN(startTime) || isNaN(endTime)) return false;
        return endTime > startTime;
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
      customMusicUrl: '', // Initialize custom URL as empty
      musicStartTime: '', // Initialize as empty strings
      musicEndTime: '',
    },
  });

  const selectedMusicTrackUrl = form.watch('selectedMusicUrl');
  const customMusicUrlValue = form.watch('customMusicUrl');
  const effectiveMusicUrl = customMusicUrlValue?.trim() || (selectedMusicTrackUrl === 'none' ? null : selectedMusicTrackUrl);

  // Show trim controls if a track is selected OR a custom URL is entered
  const showTrimControls = !!effectiveMusicUrl;

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
        const audioUrl = effectiveMusicUrl;
        if (!audioUrl) return;

        // Check if URL is likely direct *before* creating audio element
        if (!isDirectAudioUrl(audioUrl)) {
            toast({
                title: "Preview Unavailable",
                 description: (
                    <div className="flex items-start gap-2">
                       <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                       <span>
                          Preview is only available for direct audio file links (like .mp3, .wav). URLs from streaming sites (SoundCloud, YouTube, etc.) or file sharing pages cannot be previewed directly.
                       </span>
                    </div>
                 ),
                duration: 8000,
            });
            console.warn("Audio preview skipped: URL is not a recognized direct audio link:", audioUrl);
            return; // Stop processing if URL is not direct
        }

        // Proceed with playing/creating the audio element only if it's likely direct
        if (!previewAudioRef.current) {
            try {
                 console.log("Creating new Audio element for:", audioUrl);
                 previewAudioRef.current = new Audio(audioUrl);
                 previewAudioRef.current.onended = () => {
                     console.log("Audio preview ended.");
                     setIsPreviewPlaying(false);
                 };
                 previewAudioRef.current.onerror = (e) => {
                     const mediaError = previewAudioRef.current?.error;
                     const errorCode = mediaError?.code;
                     const errorMessage = mediaError?.message || 'Unknown audio error';
                     console.error(`Audio preview error event. Code: ${errorCode}, Message: ${errorMessage}`, e);
                     toast({
                         variant: "destructive",
                         title: "Preview Error",
                         description: `Could not play audio preview. Ensure the URL is correct and accessible. Error: ${errorMessage}`
                     });
                     setIsPreviewPlaying(false);
                 };
                 previewAudioRef.current.onpause = () => {
                      if (isPreviewPlaying) {
                         console.log("Audio preview paused (onpause event).");
                         setIsPreviewPlaying(false);
                      }
                 };
                 previewAudioRef.current.onplay = () => {
                      if (!isPreviewPlaying) {
                         console.log("Audio preview playing (onplay event).");
                         setIsPreviewPlaying(true);
                      }
                 };
            } catch (error) {
                 console.error("Error creating Audio element:", error);
                 toast({ variant: "destructive", title: "Preview Error", description: "Could not initialize audio player."});
                 return;
            }

        } else if (previewAudioRef.current.src !== audioUrl) {
             console.log("Updating Audio element src to:", audioUrl);
             previewAudioRef.current.src = audioUrl;
             stopPreview();
             previewAudioRef.current.load();
        }

        // Toggle play/pause
        if (isPreviewPlaying) {
            console.log("User clicked pause preview.");
            previewAudioRef.current.pause();
        } else {
             if (previewAudioRef.current) {
                previewAudioRef.current.currentTime = 0;
                console.log("Attempting to play preview...");
                previewAudioRef.current.play().then(() => {
                     console.log("Audio preview play() successful.");
                }).catch(e => {
                    console.error("Preview play() error:", e);
                    toast({
                        variant: "destructive",
                        title: "Preview Error",
                        description: `Could not start audio preview. ${e.message || 'Interaction might be required.'}`
                    });
                    setIsPreviewPlaying(false);
                });
             }
        }

   }, [effectiveMusicUrl, isPreviewPlaying, toast, stopPreview]);

   // Cleanup preview audio when component unmounts or effective URL changes
   React.useEffect(() => {
     stopPreview();

     return () => {
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
   }, [effectiveMusicUrl, stopPreview]);
   // --- End Audio Preview Logic ---


  const onSubmit = async (data: StoryFormData) => {
    if (!user) {
        toast({ title: 'Authentication Error', description: 'You must be logged in to add a story.', variant: 'destructive' });
        return;
    }
    stopPreview(); // Stop preview before submitting
    setIsSubmitting(true);

    // Prioritize custom URL if provided, otherwise use selected (if not 'none')
    const finalMusicUrl = data.customMusicUrl?.trim() || (data.selectedMusicUrl === "none" ? null : data.selectedMusicUrl);

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

           {/* Background Music Selection */}
           <div className="grid w-full gap-1.5">
              <Label htmlFor="musicSelectStory" className="flex items-center gap-1.5">
                 <Music className="h-4 w-4 text-muted-foreground"/> Background Music (Optional)
              </Label>
               {/* Flex container for Select/Input and Preview Button */}
               <div className="flex items-center gap-2">
                 <Controller
                    name="selectedMusicUrl"
                    control={form.control}
                    render={({ field }) => (
                       <Select
                         value={field.value ?? "none"}
                         onValueChange={(value) => {
                              field.onChange(value);
                              if (value !== 'none') form.setValue('customMusicUrl', '');
                              stopPreview();
                              if (value === 'none' && !customMusicUrlValue?.trim()) {
                                  form.setValue('musicStartTime', '');
                                  form.setValue('musicEndTime', '');
                              }
                         }}
                         disabled={isSubmitting || loadingPlaylist || !!customMusicUrlValue?.trim()}
                       >
                         <SelectTrigger id="musicSelectStory" className="flex-1">
                            <SelectValue placeholder={loadingPlaylist ? "Loading playlist..." : "Select from playlist..."} />
                         </SelectTrigger>
                         <SelectContent>
                            {loadingPlaylist && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                            {!loadingPlaylist && musicPlaylist.length === 1 && <SelectItem value="no-music" disabled>No music available</SelectItem>}
                            {!loadingPlaylist && musicPlaylist.map((song) => (
                              <SelectItem key={song.id || 'none'} value={song.url}> {/* Ensure value is never empty */}
                                {song.title}
                              </SelectItem>
                            ))}
                         </SelectContent>
                       </Select>
                    )}
                 />
                 {/* Preview Button - enabled if it's a direct URL */}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handlePreviewToggle}
                    disabled={isSubmitting || loadingPlaylist || !effectiveMusicUrl || !isDirectAudioUrl(effectiveMusicUrl)} // Disable if not direct URL
                    className={cn(
                        "flex-shrink-0 h-10 w-10",
                        isPreviewPlaying && "bg-accent text-accent-foreground",
                        effectiveMusicUrl && !isDirectAudioUrl(effectiveMusicUrl) && "opacity-50 cursor-not-allowed" // Visually indicate disabled state for non-direct URLs
                    )}
                    aria-label={isPreviewPlaying ? "Stop preview" : "Preview music"}
                  >
                    {isPreviewPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </Button>
               </div>
              <p className="text-xs text-muted-foreground">Select a song OR enter a custom URL below. Preview requires a direct audio file link (.mp3, .wav, etc.).</p>
           </div>

            {/* Custom Music URL Input */}
           <div className="grid w-full gap-1.5">
                <Label htmlFor="customMusicUrl" className="flex items-center gap-1.5">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" /> Custom Music URL (Optional)
                </Label>
                <Input
                    id="customMusicUrl"
                    type="url"
                    placeholder="https://example.com/your-audio.mp3"
                    {...form.register('customMusicUrl')}
                    disabled={isSubmitting || (!!selectedMusicTrackUrl && selectedMusicTrackUrl !== 'none')}
                    onChange={(e) => {
                         form.setValue('customMusicUrl', e.target.value);
                         if (e.target.value.trim()) form.setValue('selectedMusicUrl', 'none');
                         stopPreview();
                         if (!e.target.value.trim() && form.getValues('selectedMusicUrl') === 'none') {
                             form.setValue('musicStartTime', '');
                             form.setValue('musicEndTime', '');
                         }
                    }}
                />
                {form.formState.errors.customMusicUrl && (
                    <p className="text-sm text-destructive">{form.formState.errors.customMusicUrl.message}</p>
                )}
            </div>


           {/* Music Trim Controls (Conditional) */}
           {showTrimControls && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t mt-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="musicStartTime" className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-muted-foreground"/> Start Time (sec)
                        </Label>
                        <Input
                            id="musicStartTime"
                            type="number"
                            step="0.1"
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
