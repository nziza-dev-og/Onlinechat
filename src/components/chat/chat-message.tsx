
import type { Message, PostSerializable } from '@/types'; // Added PostSerializable
import { useAuth } from '@/hooks/use-auth';
import { cn, resolveMediaUrl, getInitials, getYouTubeVideoId } from '@/lib/utils';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Image from 'next/image';
import { Reply, Mic, Play, Pause, Video as VideoIcon, FileText, Download, Copy, Check, Loader2, AlertTriangle, Image as ImageIconLucide, Film } from 'lucide-react'; // Added Film for video posts
import { Button } from '@/components/ui/button';
import * as React from 'react';
import { FullScreenImageViewer } from './full-screen-image-viewer';
import { useToast } from '@/hooks/use-toast';
import { fetchPostById } from '@/lib/posts.service'; // Import fetchPostById
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'; // Import Card components for preview

interface ChatMessageProps {
  message: Message;
  onReply: (message: Message) => void;
}

// Helper to safely format Firestore Timestamp or ISO string
const formatTimestamp = (timestamp: any, formatString: string): string => {
    if (!timestamp) return '';
    let date: Date | null = null;
    try {
        if (timestamp instanceof Date) {
            date = timestamp;
        } else if (timestamp && typeof timestamp.toDate === 'function') { // Firestore Timestamp
            date = timestamp.toDate();
        } else if (typeof timestamp === 'string') { // ISO string
            date = parseISO(timestamp);
        } else if (typeof timestamp === 'number') { // Unix timestamp (seconds or ms)
             date = new Date(timestamp > 100000000000 ? timestamp : timestamp * 1000); // Heuristic for ms vs s
        }

        if (date && !isNaN(date.getTime())) {
            return format(date, formatString);
        } else {
            console.warn("Could not parse timestamp:", timestamp);
            return 'Invalid date';
        }
    } catch (error) {
        console.error("Error formatting timestamp:", error, timestamp);
        return 'Invalid date';
    }
};

// Helper to format file size
const formatFileSize = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined || bytes < 0) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};


const formatShortTimestamp = (timestamp: any): string => formatTimestamp(timestamp, 'p'); // Format like 1:23 PM
const formatFullTimestamp = (timestamp: any): string => formatTimestamp(timestamp, 'PPpp'); // Format like 'Jun 15th, 2024 at 1:23:45 PM'

// Regex to detect Markdown code blocks (```language\ncode\n```)
const codeBlockRegex = /```(\w+)?\s*?\n([\s\S]*?)\n```/;

// New component for shared post preview
const CompactPostPreview = ({ postId }: { postId: string }) => {
  const [post, setPost] = React.useState<PostSerializable | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    let isMounted = true;
    const loadPost = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedPost = await fetchPostById(postId);
        if (isMounted) {
          if (fetchedPost) {
            setPost(fetchedPost);
          } else {
            setError("Post not found or has been deleted.");
          }
        }
      } catch (err: any) {
        console.error(`Error fetching shared post ${postId}:`, err);
        if (isMounted) setError("Could not load shared post.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadPost();
    return () => { isMounted = false; };
  }, [postId]);

  if (loading) {
    return (
      <div className="my-2 p-2 border rounded-md bg-muted/30 flex items-center gap-2 animate-pulse">
        <Skeleton className="h-10 w-10 rounded" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="my-2 p-2 border border-destructive/50 rounded-md bg-destructive/10 text-destructive-foreground flex items-center gap-2 text-xs">
        <AlertTriangle className="h-4 w-4" />
        <span>{error || "Shared post is unavailable."}</span>
      </div>
    );
  }

  const resolvedPostImageUrl = resolveMediaUrl(post.imageUrl);
  const resolvedPostVideoUrl = resolveMediaUrl(post.videoUrl);
  const postYoutubeVideoId = getYouTubeVideoId(resolvedPostVideoUrl);


  return (
    <Card className="my-2 border-border/50 bg-muted/30 shadow-sm hover:shadow-md transition-shadow duration-150 rounded-lg overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-2 p-2 border-b">
        <Avatar className="h-6 w-6">
          <AvatarImage src={post.photoURL || undefined} alt={post.displayName || 'Author'} />
          <AvatarFallback className="text-xs">{getInitials(post.displayName)}</AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium text-muted-foreground truncate">{post.displayName || 'User'}</span>
      </CardHeader>
      <CardContent className="p-0 relative">
        {postYoutubeVideoId ? (
             <div className="aspect-video w-full bg-black relative">
                 <ImageIconLucide className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground/50 z-0" />
                 <iframe
                    className="w-full h-full aspect-video z-10"
                    src={`https://www.youtube.com/embed/${postYoutubeVideoId}?controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1`}
                    title="Shared YouTube Post"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen={false} // Usually false for small previews
                 ></iframe>
             </div>
        ) : resolvedPostVideoUrl ? (
            <div className="aspect-video w-full bg-black relative">
                <Film className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground/50" />
                 {/* Consider a static thumbnail or a very short muted preview for direct videos if performance is an issue */}
                 <video src={resolvedPostVideoUrl} className="w-full h-full object-cover pointer-events-none" preload="metadata" muted loop playsInline />
            </div>
        ) : resolvedPostImageUrl ? (
          <div className="aspect-video w-full relative">
            <Image src={resolvedPostImageUrl} alt="Shared post media" layout="fill" objectFit="cover" className="bg-muted" />
          </div>
        ) : (
          <div className="p-2 text-xs text-muted-foreground italic h-16 flex items-center justify-center">
            {post.text ? `${post.text.substring(0,60)}...` : "Text Post"}
          </div>
        )}
      </CardContent>
      <CardFooter className="p-2">
        <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => toast({ title: "Navigate to Post (WIP)", description: `Would navigate to post ID: ${post.id}` })}>
          View Post
        </Button>
      </CardFooter>
    </Card>
  );
};


export function ChatMessage({ message, onReply }: ChatMessageProps) {
  const { user } = useAuth();
  const { toast } = useToast(); // Get toast function
  const isSender = user?.uid === message.uid;
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [audioDuration, setAudioDuration] = React.useState<number | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isImageViewerOpen, setIsImageViewerOpen] = React.useState(false); // State for image viewer
  const [isCopied, setIsCopied] = React.useState(false); // State for copy button

  // Resolve media URLs
  const resolvedImageUrl = resolveMediaUrl(message.imageUrl);
  const resolvedVideoUrl = resolveMediaUrl(message.videoUrl);
  const resolvedAudioUrl = resolveMediaUrl(message.audioUrl);
  const resolvedFileUrl = resolveMediaUrl(message.fileUrl);

  const handleReplyClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onReply(message);
  };

  const handleImageClick = (e: React.MouseEvent) => {
      e.stopPropagation(); 
      if (resolvedImageUrl) {
          setIsImageViewerOpen(true);
      }
  };

  // --- Audio Playback Handling ---
  const togglePlay = () => {
    const audioElement = audioRef.current;
    if (!audioElement) {
        console.error("Audio element ref not found.");
        return;
    }

    if (isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play().catch(err => {
          console.error("Error playing audio:", err);
          setIsPlaying(false); 
      });
    }
  };

   const formatAudioTime = (timeInSeconds: number): string => {
     if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };


  React.useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !resolvedAudioUrl) return; 

    if (audioElement.currentSrc !== resolvedAudioUrl) {
        audioElement.src = resolvedAudioUrl;
        audioElement.load(); 
    }

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0); 
    };
    const handleLoadedMetadata = () => {
        if (isFinite(audioElement.duration)) { 
            setAudioDuration(audioElement.duration);
        } else {
            setAudioDuration(null); 
        }
        setCurrentTime(0); 
    };
     const handleTimeUpdate = () => {
         if (!isNaN(audioElement.currentTime)) { 
            setCurrentTime(audioElement.currentTime);
         }
     };
     const handleError = (e: Event) => {
         console.error("Audio playback error:", (e.target as HTMLAudioElement).error);
         setIsPlaying(false); 
         setAudioDuration(null);
         setCurrentTime(0);
     };


    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('error', handleError);

    return () => {
        audioElement.removeEventListener('play', handlePlay);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
        audioElement.removeEventListener('error', handleError);
        if (audioElement && !audioElement.paused) {
            audioElement.pause();
        }
        setIsPlaying(false);
        setAudioDuration(null);
        setCurrentTime(0);
    };
  }, [message.id, resolvedAudioUrl]);
  // --- End Audio Playback Handling ---

  // --- Code Block Handling ---
  const codeMatch = message.text?.match(codeBlockRegex);
  const codeContent = codeMatch ? codeMatch[2].trim() : null;
  const codeLanguage = codeMatch ? codeMatch[1] : null;
  const nonCodeText = message.text && message.sharedPostId ? null : (message.text && codeMatch ? message.text.replace(codeBlockRegex, '').trim() : (message.text && !codeMatch ? message.text.trim() : null));


  const handleCopyToClipboard = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      toast({ title: "Copied to clipboard!" });
      setTimeout(() => setIsCopied(false), 2000); 
    } catch (err) {
      console.error("Failed to copy text: ", err);
      toast({ title: "Copy Failed", description: "Could not copy code to clipboard.", variant: "destructive" });
    }
  };
  // --- End Code Block Handling ---

  const getReplyTextPreview = (msg: Message): string => {
      if (msg.sharedPostId) return 'Shared a post';
      if (msg.text) return msg.text;
      if (msg.imageUrl) return 'Image';
      if (msg.audioUrl) return 'Voice note';
      if (msg.videoUrl) return 'Video';
      if (msg.fileUrl) return msg.fileName || 'File'; 
      return 'Original message';
  }

  return (
    <>
    <div className={cn(
        "group flex items-end gap-2 my-2 w-full relative", 
        isSender ? "justify-end" : "justify-start"
    )}>
      {!isSender && (
        <Avatar className="h-8 w-8 flex-shrink-0 self-start mt-1">
          <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'User Avatar'} data-ai-hint="receiver user profile avatar"/>
          <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "max-w-[75%] sm:max-w-[70%] rounded-xl shadow-sm break-words", 
          isSender
            ? "bg-accent text-accent-foreground rounded-br-sm"
            : "bg-card text-card-foreground rounded-bl-sm",
           !(codeContent && !nonCodeText && !resolvedImageUrl && !resolvedAudioUrl && !resolvedVideoUrl && !resolvedFileUrl && !message.sharedPostId)
             ? 'px-3 py-2 sm:px-3.5 sm:py-2.5'
             : 'p-0 overflow-hidden' 
        )}
      >
        {!isSender && message.displayName && !(codeContent && !nonCodeText && !resolvedImageUrl && !resolvedAudioUrl && !resolvedVideoUrl && !resolvedFileUrl && !message.sharedPostId) && (
           <p className="text-xs font-medium text-muted-foreground mb-1">{message.displayName}</p>
        )}

         {message.replyToMessageId && (
            <div className="mb-2 p-2 border-l-2 border-primary/50 bg-primary/10 rounded-r-md text-xs opacity-80">
                 <p className="font-medium text-primary-foreground/80 truncate">
                    Replying to {message.replyToMessageAuthor || 'Unknown'}
                 </p>
                 <p className="text-muted-foreground truncate italic">
                     {getReplyTextPreview(message)}
                 </p>
            </div>
         )}

        {message.sharedPostId && (
          <div className="space-y-1">
             {message.text && <p className="text-sm text-muted-foreground mb-1">{message.text}</p>}
             <CompactPostPreview postId={message.sharedPostId} />
          </div>
        )}

         {resolvedAudioUrl && !message.sharedPostId && (
             <div className={cn(
                 "my-2 p-2 rounded-md flex items-center gap-2 sm:gap-3", 
                 isSender ? "bg-accent/80" : "bg-muted/60" 
             )}>
                 <Button
                     variant="ghost"
                     size="icon"
                     onClick={togglePlay}
                     className="h-8 w-8 sm:h-9 sm:w-9 text-foreground/80 hover:text-foreground flex-shrink-0" 
                     aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
                     disabled={!resolvedAudioUrl} 
                 >
                     {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5" />}
                 </Button>
                 <audio key={resolvedAudioUrl} ref={audioRef} src={resolvedAudioUrl} preload="metadata" className="hidden">
                     Your browser does not support the audio element.
                 </audio>
                 <span className="text-xs text-muted-foreground font-mono w-14 sm:w-16 text-right flex-shrink-0"> 
                      {formatAudioTime(currentTime)} / {audioDuration !== null ? formatAudioTime(audioDuration) : '?:??'} 
                 </span>
             </div>
         )}

         {resolvedImageUrl && !message.sharedPostId && (
          <Button
              variant="ghost"
              className="relative aspect-video w-40 sm:w-48 max-w-full my-2 p-0 h-auto rounded-md overflow-hidden border block cursor-pointer" 
              onClick={handleImageClick}
          >
             <Image
                 src={resolvedImageUrl} 
                 alt="Chat image"
                 fill
                 style={{ objectFit: 'cover' }}
                 className="bg-muted"
                 data-ai-hint="chat message image"
                 sizes="(max-width: 640px) 75vw, (max-width: 1024px) 50vw, 30vw" 
             />
          </Button>
         )}

          {resolvedVideoUrl && !message.sharedPostId && (
             <div className="relative aspect-video w-full max-w-sm sm:max-w-md my-2 rounded-lg overflow-hidden border shadow-inner"> 
                 <video
                     src={resolvedVideoUrl} 
                     controls
                     preload="metadata" 
                     className="w-full h-full object-contain bg-black" 
                     data-ai-hint="chat message video"
                     title={message.text ? `Video: ${message.text.substring(0, 30)}...` : "Chat video"}
                 >
                     Your browser does not support the video tag.
                     <a href={resolvedVideoUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline p-2 block">
                         Watch video
                     </a>
                 </video>
             </div>
          )}

           {resolvedFileUrl && !message.sharedPostId && (
                <div className={cn(
                    "my-2 p-3 rounded-md flex items-center gap-2 sm:gap-3 border", 
                    isSender ? "bg-accent/70 border-accent/80" : "bg-muted/50 border-muted/60"
                )}>
                    <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-foreground/70 flex-shrink-0" /> 
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" title={message.fileName || 'Attached file'}>
                            {message.fileName || 'Attached file'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                            {formatFileSize(message.fileSize)} {message.fileType ? `(${message.fileType.split('/')[1]})` : ''}
                        </p>
                    </div>
                     <Button
                         variant="ghost"
                         size="icon"
                         asChild 
                         className="h-8 w-8 text-primary flex-shrink-0"
                     >
                         <a href={resolvedFileUrl} target="_blank" rel="noopener noreferrer" download={message.fileName || true} aria-label="Download file">
                             <Download className="h-4 w-4 sm:h-5 sm:w-5" />
                         </a>
                     </Button>
                </div>
           )}

        {nonCodeText && !message.sharedPostId && (
          <p className="text-sm sm:text-base whitespace-pre-wrap break-words">{nonCodeText}</p>
        )}

         {codeContent && !message.sharedPostId && (
           <div className="relative group/codeblock my-1 bg-gray-900 dark:bg-gray-800 rounded-md overflow-hidden font-mono text-sm">
               <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 dark:bg-gray-700 text-gray-400">
                   <span className="text-xs">{codeLanguage || 'code'}</span>
                   <Button
                       variant="ghost"
                       size="icon"
                       className="h-6 w-6 text-gray-400 hover:text-white opacity-50 group-hover/codeblock:opacity-100 transition-opacity"
                       onClick={() => handleCopyToClipboard(codeContent)}
                   >
                       {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                       <span className="sr-only">Copy code</span>
                   </Button>
               </div>
               <pre className="p-3 overflow-x-auto text-gray-200 dark:text-gray-100">
                   <code>
                       {codeContent}
                   </code>
               </pre>
           </div>
         )}

         {!(codeContent && !nonCodeText && !resolvedImageUrl && !resolvedAudioUrl && !resolvedVideoUrl && !resolvedFileUrl && !message.sharedPostId) && (
           <TooltipProvider delayDuration={300}>
              <Tooltip>
                  <TooltipTrigger asChild>
                     <p className={cn(
                        "text-xs mt-1.5 opacity-60 cursor-default",
                        isSender ? "text-right" : "text-left",
                      )}>
                        {formatShortTimestamp(message.timestamp)}
                      </p>
                  </TooltipTrigger>
                  <TooltipContent side={isSender ? "left" : "right"}>
                      <p>{formatFullTimestamp(message.timestamp)}</p>
                  </TooltipContent>
              </Tooltip>
           </TooltipProvider>
         )}
      </div>

       {isSender && (
        <Avatar className="h-8 w-8 flex-shrink-0 self-start mt-1">
           <AvatarImage src={message.photoURL || undefined} alt={message.displayName || 'My Avatar'} data-ai-hint="sender user profile avatar"/>
           <AvatarFallback>{getInitials(message.displayName)}</AvatarFallback>
        </Avatar>
      )}

       <Button
           variant="ghost"
           size="icon"
           className={cn(
               "absolute -top-2 h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150",
               isSender ? "-left-1" : "-right-1" 
           )}
           onClick={handleReplyClick}
           aria-label="Reply to message"
       >
           <Reply className="h-4 w-4" />
       </Button>

    </div>
     {isImageViewerOpen && resolvedImageUrl && (
         <FullScreenImageViewer
             imageUrl={resolvedImageUrl} 
             altText={message.text || 'Chat image'}
             onClose={() => setIsImageViewerOpen(false)}
         />
     )}
    </>
  );
}

