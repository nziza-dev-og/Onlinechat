
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
import { Loader2, Send, Image as ImageIcon, Video } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { addPost, type PostInput } from '@/lib/posts.service'; // Import the service
import type { Post } from '@/types'; // Import Post type for the callback

// Validation schema for the post form
const postSchema = z.object({
  text: z.string().max(1000, { message: "Post text cannot exceed 1000 characters." }).optional().nullable(),
  imageUrl: z.string().url({ message: "Please enter a valid image URL." }).max(1024).optional().or(z.literal('')).nullable(),
  videoUrl: z.string().url({ message: "Please enter a valid video URL." }).max(1024).optional().or(z.literal('')).nullable(),
}).refine(data => !!data.text?.trim() || !!data.imageUrl?.trim() || !!data.videoUrl?.trim(), {
    message: "Post must include text, an image URL, or a video URL.",
    // Specify a path if you want the error associated with a specific field,
    // otherwise it's a form-level error. Let's put it on 'text' for now.
    path: ["text"],
});


type PostFormData = z.infer<typeof postSchema>;

interface PostFormProps {
  // Callback expects the Post type with a Date timestamp for optimistic updates
  onPostAdded?: (newPost: Post) => void;
}

export function PostForm({ onPostAdded }: PostFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      text: '',
      imageUrl: '',
      videoUrl: '',
    },
  });

  const onSubmit = async (data: PostFormData) => {
    if (!user) {
        toast({ title: 'Authentication Error', description: 'You must be logged in to post.', variant: 'destructive' });
        return;
    }

    setIsSubmitting(true);
    const postInput: PostInput = {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        text: data.text?.trim() || null,
        imageUrl: data.imageUrl?.trim() || null,
        videoUrl: data.videoUrl?.trim() || null,
    };


    try {
      console.log(`Creating post for user ${user.uid}...`, postInput);
      const postId = await addPost(postInput);
      toast({
        title: 'Post Created!',
        description: 'Your post has been successfully added.',
      });
      form.reset(); // Clear the form

       // Construct a temporary Post object with a Date timestamp
       const tempPost: Post = {
           id: postId, // Use the returned ID
           ...postInput,
           timestamp: new Date() // Use client date as placeholder
       };
       onPostAdded?.(tempPost); // Call the callback if provided

    } catch (error: any) {
      console.error('Error creating post:', error);
      toast({
        title: 'Post Creation Failed',
        description: error.message || 'Could not create the post. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

   // Watch form values to enable/disable submit button
   const watchedText = form.watch('text');
   const watchedImageUrl = form.watch('imageUrl');
   const watchedVideoUrl = form.watch('videoUrl');
   const canSubmit = !!watchedText?.trim() || !!watchedImageUrl?.trim() || !!watchedVideoUrl?.trim();


  return (
    <Card className="w-full shadow-lg mb-8 border border-border/50 bg-card"> {/* Increased mb and added border */}
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardHeader className="pb-4"> {/* Reduced bottom padding */}
          <CardTitle className="text-xl font-semibold">Create a New Post</CardTitle>
          <CardDescription>Share your thoughts, images, or videos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5"> {/* Increased spacing */}
          {/* Text Input */}
          <div className="grid w-full gap-1.5">
            <Label htmlFor="text">What's on your mind?</Label>
            <Textarea
              id="text"
              placeholder="Write your post content here..."
              maxLength={1000}
              {...form.register('text')}
              disabled={isSubmitting}
              className="min-h-[100px] text-base" // Increased min-height and text size
            />
            {form.formState.errors.text && (
              <p className="text-sm text-destructive">{form.formState.errors.text.message}</p>
            )}
             <p className="text-xs text-muted-foreground text-right">
                {form.watch('text')?.length ?? 0} / 1000
             </p>
          </div>

          <Separator /> {/* Add separators */}

          {/* Image URL Input */}
          <div className="grid w-full gap-1.5">
             <Label htmlFor="imageUrl" className="flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-muted-foreground"/> Image URL (Optional)
             </Label>
             <Input
               id="imageUrl"
               type="url"
               placeholder="https://example.com/image.jpg"
               {...form.register('imageUrl')}
               disabled={isSubmitting}
             />
             {form.formState.errors.imageUrl && (
               <p className="text-sm text-destructive">{form.formState.errors.imageUrl.message}</p>
             )}
           </div>

           {/* Video URL Input */}
          <div className="grid w-full gap-1.5">
             <Label htmlFor="videoUrl" className="flex items-center gap-1.5">
                <Video className="h-4 w-4 text-muted-foreground"/> Video URL (Optional)
             </Label>
             <Input
               id="videoUrl"
               type="url"
               placeholder="https://example.com/video.mp4"
               {...form.register('videoUrl')}
               disabled={isSubmitting}
             />
             {form.formState.errors.videoUrl && (
               <p className="text-sm text-destructive">{form.formState.errors.videoUrl.message}</p>
             )}
           </div>

        </CardContent>
        <CardFooter className="flex justify-end pt-4 border-t border-border/50"> {/* Added border */}
          <Button type="submit" disabled={isSubmitting || !canSubmit || !form.formState.isValid} size="lg"> {/* Larger button */}
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Post
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
