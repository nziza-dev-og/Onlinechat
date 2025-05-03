

"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Image as ImageIcon, Video, Music } from 'lucide-react'; // Added Music icon
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { addPost, type PostInput } from '@/lib/posts.service'; // Reuse addPost service
import type { Post } from '@/types';

// Validation schema specifically for stories
const storySchema = z.object({
  text: z.string().max(200, { message: "Story text cannot exceed 200 characters." }).optional().nullable(), // Shorter limit for stories?
  imageUrl: z.string().url({ message: "Please enter a valid image URL." }).max(1024).optional().or(z.literal('')).nullable(),
  videoUrl: z.string().url({ message: "Please enter a valid video URL." }).max(1024).optional().or(z.literal('')).nullable(),
  musicUrl: z.string().url({ message: "Please enter a valid music URL." }).max(1024).optional().or(z.literal('')).nullable(), // Added musicUrl validation
}).refine(data => !!data.imageUrl?.trim() || !!data.videoUrl?.trim(), {
    // Stories must have visual content
    message: "Story must include an image URL or a video URL.",
    path: ["imageUrl"], // Associate error with imageUrl field
});

type StoryFormData = z.infer<typeof storySchema>;

interface StoryFormProps {
  onStoryAdded?: (newStory: Post) => void;
}

export function StoryForm({ onStoryAdded }: StoryFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<StoryFormData>({
    resolver: zodResolver(storySchema),
    defaultValues: {
      text: '',
      imageUrl: '',
      videoUrl: '',
      musicUrl: '', // Initialize musicUrl
    },
  });

  const onSubmit = async (data: StoryFormData) => {
    if (!user) {
        toast({ title: 'Authentication Error', description: 'You must be logged in to add a story.', variant: 'destructive' });
        return;
    }

    setIsSubmitting(true);
    // Prepare data for the addPost service, including musicUrl
    const storyInput: PostInput = {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        text: data.text?.trim() || null,
        imageUrl: data.imageUrl?.trim() || null,
        videoUrl: data.videoUrl?.trim() || null,
        musicUrl: data.musicUrl?.trim() || null, // Include musicUrl
        type: 'story', // Explicitly set type to 'story'
    };


    try {
      console.log(`Creating story for user ${user.uid}...`, storyInput);
      const storyId = await addPost(storyInput); // Use the same addPost function
      toast({
        title: 'Story Added!',
        description: 'Your story has been successfully shared.',
      });
      form.reset(); // Clear the form

       // Construct a temporary Post object for the callback
       const tempStory: Post = {
           id: storyId,
           ...storyInput,
           timestamp: new Date(), // Use client date as placeholder
           type: 'story',
           // Initialize counts for consistency
           likeCount: 0,
           likedBy: [],
           commentCount: 0,
       };
       onStoryAdded?.(tempStory); // Call the callback

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

   // Watch form values to enable/disable submit button
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
               disabled={isSubmitting || !!form.watch('videoUrl')} // Disable if video URL is entered
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
               disabled={isSubmitting || !!form.watch('imageUrl')} // Disable if image URL is entered
             />
             {form.formState.errors.videoUrl && (
               <p className="text-sm text-destructive">{form.formState.errors.videoUrl.message}</p>
             )}
           </div>

           <Separator />

           {/* Background Music URL Input (Optional) */}
           <div className="grid w-full gap-1.5">
             <Label htmlFor="musicUrlStory" className="flex items-center gap-1.5">
                <Music className="h-4 w-4 text-muted-foreground"/> Background Music URL (Optional)
             </Label>
             <Input
               id="musicUrlStory"
               type="url"
               placeholder="https://example.com/music.mp3"
               {...form.register('musicUrl')}
               disabled={isSubmitting}
             />
             {form.formState.errors.musicUrl && (
               <p className="text-sm text-destructive">{form.formState.errors.musicUrl.message}</p>
             )}
             <p className="text-xs text-muted-foreground">Add a URL to an audio file (e.g., mp3).</p>
           </div>


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
              className="min-h-[60px]" // Shorter text area
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

