
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getPasswordChangeRequests, reviewPasswordChangeRequest } from '@/lib/user-profile.service';
import type { UserProfile, AdminMessage, User, PostSerializable } from '@/types'; // Added User, PostSerializable imports
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ShieldAlert, CheckCircle, XCircle, UserCheck, UserX, BarChart2, Bell, Settings, ShieldCheck, Send, Ban, MessageSquare, Users as UsersIcon, User as UserIcon, Clapperboard, Trash2, Film } from 'lucide-react'; // Renamed Users icon import, Added Clapperboard, Trash2, Film
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getFirestore, doc, getDoc, type Firestore, collection, query, where, onSnapshot, type Unsubscribe, orderBy, limit, Timestamp } from 'firebase/firestore'; // Added collection, query, where, onSnapshot, Unsubscribe, orderBy, limit, Timestamp
import { app } from '@/lib/firebase';
import { getOnlineUsersCount, getAdminMessages } from '@/lib/admin.service'; // Added getAdminMessages import
import { sendGlobalNotification, sendTargetedNotification, sendAdminReply } from '@/lib/notification.service'; // Import specific notification services, added sendAdminReply
import { Textarea } from '@/components/ui/textarea'; // Import Textarea
import { Label } from '@/components/ui/label'; // Import Label
import { Switch } from "@/components/ui/switch"; // Import Switch for settings/security
import { Input } from "@/components/ui/input"; // Import Input for settings/security
import { blockIpAddress, logSuspiciousActivity } from '@/lib/security.service'; // Import security services
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // Import RadioGroup
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Import Select for user targeting
import { fetchPosts, deletePost } from '@/lib/posts.service'; // Import fetchPosts, deletePost
import { PostCard } from '@/components/posts/post-card'; // Import PostCard for displaying stories? Or create a dedicated StoryCard
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Import AlertDialog

// Helper to get initials
const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?';
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '?';
};

// Helper to safely format timestamp or ISO string
const formatTimestamp = (timestamp: any): string => {
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
            date = new Date(timestamp > 100000000000 ? timestamp : timestamp * 1000);
        }

        if (date && !isNaN(date.getTime())) {
            return formatDistanceToNowStrict(date, { addSuffix: true });
        } else {
            console.warn("Could not parse timestamp for formatting:", timestamp);
            return 'Invalid date';
        }
    } catch (error) {
        console.error("Error formatting timestamp:", error, timestamp);
        return 'Invalid date';
    }
};

// Story Preview Component (Simple version)
const StoryPreview = ({ story, onDelete }: { story: PostSerializable; onDelete: (storyId: string) => void }) => {
    const [isDeleting, setIsDeleting] = React.useState(false);
    const { toast } = useToast();

     const handleDelete = async () => {
        setIsDeleting(true);
        try {
            // Assuming admins have universal delete rights, pass a dummy user ID or handle appropriately in deletePost
            // Here we use the story's author UID to check ownership, but admin rights should bypass this in a real app
            // For now, we pass the author UID. **A proper admin authorization check should be in deletePost.**
            await deletePost(story.id, story.uid); // Pass story author UID for now
            toast({ title: "Story Deleted", description: "The story has been removed." });
            onDelete(story.id); // Notify parent to remove from state
        } catch (error: any) {
             toast({ title: "Delete Failed", description: error.message || "Could not delete story.", variant: "destructive" });
             setIsDeleting(false); // Reset on error
        }
        // Don't reset isDeleting on success, as component will likely unmount
     };


    return (
        <Card className="flex items-center justify-between p-3 gap-3 bg-card shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar className="h-9 w-9 border flex-shrink-0">
                    <AvatarImage src={story.photoURL || undefined} alt={story.displayName || 'User'} data-ai-hint="user avatar" />
                    <AvatarFallback>{getInitials(story.displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{story.displayName || 'Unknown User'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                        {story.imageUrl ? 'Image Story' : (story.videoUrl ? 'Video Story' : 'Text Story?')} - {formatTimestamp(story.timestamp)}
                    </p>
                     {story.text && <p className="text-xs text-muted-foreground italic truncate">{story.text}</p>}
                </div>
            </div>
            {/* Delete Button with Confirmation */}
             <AlertDialog>
                 <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 flex-shrink-0 h-8 w-8" disabled={isDeleting}>
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>}
                        <span className="sr-only">Delete Story</span>
                    </Button>
                 </AlertDialogTrigger>
                 <AlertDialogContent>
                    <AlertDialogHeader>
                         <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                         <AlertDialogDescription>
                            Are you sure you want to delete this story permanently? This action cannot be undone.
                         </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                         <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                         <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                             {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Delete Story
                         </AlertDialogAction>
                    </AlertDialogFooter>
                 </AlertDialogContent>
             </AlertDialog>
        </Card>
    );
};


export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [requests, setRequests] = React.useState<UserProfile[]>([]);
  const [loadingRequests, setLoadingRequests] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [processingUserId, setProcessingUserId] = React.useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = React.useState<number | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = React.useState(true);
  const [dbInstance, setDbInstance] = React.useState<Firestore | null>(null);

  // --- Notification States ---
  const [notificationMessage, setNotificationMessage] = React.useState('');
  const [isSendingNotification, setIsSendingNotification] = React.useState(false);
  const [notificationType, setNotificationType] = React.useState<'global' | 'targeted'>('global');
  const [targetUserId, setTargetUserId] = React.useState<string | undefined>(undefined);
  const [userList, setUserList] = React.useState<UserProfile[]>([]);
  const [loadingUserList, setLoadingUserList] = React.useState(false);
  // --- End Notification States ---

  // Placeholder states for Settings
  const [allowEmoji, setAllowEmoji] = React.useState(true);
  const [allowFileUploads, setAllowFileUploads] = React.useState(true);
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);

  // Security States
  const [ipToBlock, setIpToBlock] = React.useState('');
  const [isBlockingIp, setIsBlockingIp] = React.useState(false);
  const [blockReason, setBlockReason] = React.useState(''); // Optional reason

  // Admin Messages State
  const [adminMessages, setAdminMessages] = React.useState<AdminMessage[]>([]);
  const [loadingAdminMessages, setLoadingAdminMessages] = React.useState(true);
  const [replyingToAdminMessage, setReplyingToAdminMessage] = React.useState<AdminMessage | null>(null);
  const [replyText, setReplyText] = React.useState('');
  const [isSendingReply, setIsSendingReply] = React.useState(false);

  // Story Management State
  const [stories, setStories] = React.useState<PostSerializable[]>([]);
  const [loadingStories, setLoadingStories] = React.useState(true);

  const { toast } = useToast();
  const userListListenerUnsubscribeRef = React.useRef<Unsubscribe | null>(null); // Ref for user list listener
  const adminMessagesListenerUnsubscribeRef = React.useRef<Unsubscribe | null>(null); // Ref for admin messages listener

   // Initialize Firestore instance on mount
   React.useEffect(() => {
        try {
            const currentDb = getFirestore(app);
            setDbInstance(currentDb);
            console.log("Firestore instance obtained successfully in AdminPage.");
        } catch (error) {
            console.error("🔴 Failed to get Firestore instance in AdminPage:", error);
            setError("Database connection failed. Admin features may be limited.");
            setIsAdmin(false); // Assume not admin if DB fails
            setLoadingRequests(false);
            setLoadingAnalytics(false);
            setLoadingAdminMessages(false);
            setLoadingUserList(false);
            setLoadingStories(false); // Set story loading false
        }
    }, []);


  // Fetch admin status and data on mount and when user/db changes
  React.useEffect(() => {
    if (authLoading || !dbInstance) { // Wait for auth and db
      console.log("AdminPage: Waiting for auth or dbInstance.");
      setIsAdmin(null);
      setLoadingRequests(true);
      setLoadingAnalytics(true);
      setLoadingAdminMessages(true);
      setLoadingUserList(true);
      setLoadingStories(true); // Set story loading true
      setRequests([]);
      setOnlineUsers(null);
      setAdminMessages([]);
      setUserList([]);
      setStories([]); // Reset stories
      return;
    }
    if (!user) {
      console.log("AdminPage: No user logged in.");
      setIsAdmin(false);
      setLoadingRequests(false);
      setLoadingAnalytics(false);
      setLoadingAdminMessages(false);
      setLoadingUserList(false);
      setLoadingStories(false); // Set story loading false
      setRequests([]);
      setError("Please log in to access the admin page.");
      setOnlineUsers(null);
      setAdminMessages([]);
      setUserList([]);
       setStories([]); // Reset stories
      return;
    }

    // Cleanup previous listeners if they exist
     if (userListListenerUnsubscribeRef.current) {
        console.log("AdminPage: Cleaning up previous user list listener before new setup.");
        userListListenerUnsubscribeRef.current();
        userListListenerUnsubscribeRef.current = null;
     }
     if (adminMessagesListenerUnsubscribeRef.current) {
        console.log("AdminPage: Cleaning up previous admin messages listener before new setup.");
        adminMessagesListenerUnsubscribeRef.current();
        adminMessagesListenerUnsubscribeRef.current = null;
     }

    console.log("AdminPage: Checking admin status and fetching data...");
    const checkAdminAndFetchData = async (firestoreInstance: Firestore) => {
        setLoadingRequests(true);
        setLoadingAnalytics(true);
        setLoadingAdminMessages(true);
        setLoadingUserList(true);
        setLoadingStories(true); // Set story loading true
        setError(null);
        setOnlineUsers(null);
        setAdminMessages([]);
        setUserList([]);
        setStories([]); // Reset stories

        try {
             const profile = await getDoc(doc(firestoreInstance, 'users', user.uid));
             const isAdminUser = profile.exists() && profile.data()?.isAdmin === true;
             setIsAdmin(isAdminUser);

             if (isAdminUser) {
                 console.log("AdminPage: User is admin. Fetching data...");
                // --- Fetch Data Concurrently ---
                const requestsPromise = getPasswordChangeRequests(user.uid).catch(err => { console.error("Req Fetch Err:", err); throw err; });
                const analyticsPromise = getOnlineUsersCount().catch(err => { console.error("Analytics Err:", err); throw err; });
                // Fetch stories (posts with type 'story')
                const storiesPromise = fetchPosts(100).then(posts => posts.filter(p => p.type === 'story')).catch(err => { console.error("Stories Fetch Err:", err); throw err; });

                 // --- Setup Admin Messages Listener ---
                 console.log("AdminPage: Setting up admin messages listener.");
                 const messagesQuery = query(collection(firestoreInstance, 'adminMessages'), orderBy('timestamp', 'desc'), limit(50));
                 adminMessagesListenerUnsubscribeRef.current = onSnapshot(messagesQuery, (snapshot) => {
                      const fetchedMessages: AdminMessage[] = snapshot.docs.map(doc => {
                         const data = doc.data();
                         // More robust timestamp check for messages
                         let timestampISO: string | null = null;
                         if (data.timestamp instanceof Timestamp) {
                             timestampISO = data.timestamp.toDate().toISOString();
                         } else if (data.timestamp && typeof data.timestamp.toDate === 'function') {
                             try { timestampISO = data.timestamp.toDate().toISOString(); } catch { /* ignore */ }
                         } else if (typeof data.timestamp === 'string') {
                             try { const parsedDate = parseISO(data.timestamp); timestampISO = parsedDate.toISOString(); } catch { /* ignore */ }
                         } else if (typeof data.timestamp?.seconds === 'number') { // Handle plain objects from Firestore
                             try { timestampISO = new Timestamp(data.timestamp.seconds, data.timestamp.nanoseconds).toDate().toISOString(); } catch { /* ignore */ }
                         }

                          if (!timestampISO || !data.senderUid) {
                             console.warn("Skipping invalid admin message document (missing timestamp or senderUid):", doc.id, data);
                             return null;
                          }
                         return {
                             id: doc.id,
                             senderUid: data.senderUid,
                             senderName: data.senderName ?? null,
                             senderEmail: data.senderEmail ?? null,
                             message: data.message ?? '',
                             timestamp: timestampISO,
                             isRead: data.isRead ?? false,
                             // Include reply fields if available
                             reply: data.reply ?? null,
                             repliedAt: data.repliedAt ? formatTimestamp(data.repliedAt) : null, // Format if exists
                             repliedBy: data.repliedBy ?? null,
                         };
                      }).filter((msg): msg is AdminMessage => msg !== null); // Filter out invalid docs
                      setAdminMessages(fetchedMessages);
                      setLoadingAdminMessages(false);
                      console.log(`Admin: Admin messages updated (${fetchedMessages.length} messages)`);
                 }, (error) => {
                     console.error("Error fetching admin messages:", error);
                     toast({ title: "Messages Error", description: "Could not load admin messages.", variant: "destructive" });
                     setAdminMessages([]);
                     setLoadingAdminMessages(false);
                     adminMessagesListenerUnsubscribeRef.current = null; // Clear ref on error
                 });


                 // --- Setup User List Listener (for notifications) ---
                 console.log("AdminPage: Setting up user list listener.");
                 const usersQuery = query(collection(firestoreInstance, 'users'), where('uid', '!=', user.uid)); // Exclude self
                 // Store the unsubscribe function in the ref
                 userListListenerUnsubscribeRef.current = onSnapshot(usersQuery, (snapshot) => {
                     const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile))
                         .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
                     setUserList(fetchedUsers);
                     setLoadingUserList(false);
                     console.log(`Admin: User list updated (${fetchedUsers.length} users)`);
                 }, (error) => {
                     console.error("Error fetching user list for notifications:", error);
                     toast({ title: "User List Error", description: "Could not load users for targeted notifications.", variant: "destructive" });
                     setUserList([]);
                     setLoadingUserList(false);
                      // Clear the ref on error
                     userListListenerUnsubscribeRef.current = null;
                 });

                // Await results for non-listener fetches
                 try {
                      const [fetchedRequests, onlineCount, fetchedStories] = await Promise.all([requestsPromise, analyticsPromise, storiesPromise]);
                      setRequests(fetchedRequests);
                      setOnlineUsers(onlineCount);
                      setStories(fetchedStories); // Set stories state
                 } catch (batchError: any) {
                     console.error("Error fetching initial admin data batch:", batchError);
                      // Handle specific errors if needed, or show a general error
                     toast({ title: "Data Fetch Error", description: "Could not load some admin data.", variant: "destructive" });
                      // Set sensible defaults on error
                     if (!requests.length) setRequests([]);
                     if (onlineUsers === null) setOnlineUsers(0);
                     if (!stories.length) setStories([]); // Default for stories
                 } finally {
                    setLoadingRequests(false);
                    setLoadingAnalytics(false);
                    setLoadingStories(false); // Set story loading false
                    // Message and User list loading are handled by their listeners
                 }

                // TODO: Fetch initial settings values from config service
                // const config = await getPlatformConfig();
                // setAllowEmoji(config.allowEmoji ?? true);
                // setAllowFileUploads(config.allowFileUploads ?? true);

             } else {
                 console.log("AdminPage: User is not admin.");
                setError("You do not have permission to access this page.");
                setRequests([]);
                setOnlineUsers(null);
                setAdminMessages([]);
                setUserList([]);
                setStories([]); // Reset stories
                setLoadingRequests(false);
                setLoadingAnalytics(false);
                setLoadingAdminMessages(false);
                setLoadingUserList(false);
                setLoadingStories(false); // Set story loading false
             }
        } catch (err: any) {
            console.error("Error checking admin status or fetching data:", err);
            setError(err.message || "Failed to load admin data.");
            setIsAdmin(false);
            setRequests([]);
            setOnlineUsers(null);
            setAdminMessages([]);
            setUserList([]);
            setStories([]); // Reset stories
            setLoadingRequests(false);
            setLoadingAnalytics(false);
            setLoadingAdminMessages(false);
            setLoadingUserList(false);
            setLoadingStories(false); // Set story loading false
        } finally {
             // Ensure these are false, though listeners might set them earlier
             setLoadingUserList(false);
             setLoadingAdminMessages(false);
             setLoadingStories(false); // Ensure story loading is false
        }
    };

    // Pass the correct dbInstance state variable here
    if (dbInstance) {
      checkAdminAndFetchData(dbInstance);
    }

     // Ensure cleanup runs when dependencies change or component unmounts
     return () => {
         if (userListListenerUnsubscribeRef.current) {
            console.log("AdminPage: Cleaning up user list listener in useEffect return.");
            userListListenerUnsubscribeRef.current();
            userListListenerUnsubscribeRef.current = null;
         }
          if (adminMessagesListenerUnsubscribeRef.current) {
            console.log("AdminPage: Cleaning up admin messages listener in useEffect return.");
            adminMessagesListenerUnsubscribeRef.current();
            adminMessagesListenerUnsubscribeRef.current = null;
          }
     };

  }, [user, authLoading, dbInstance, toast]); // Rerun if user, auth state, or db instance changes


   // Function to handle approving/denying requests
  const handleReview = async (targetUserId: string, approve: boolean) => {
    if (!user || !isAdmin || processingUserId || !dbInstance) return; // Check dbInstance

    setProcessingUserId(targetUserId);
    try {
      await reviewPasswordChangeRequest(user.uid, targetUserId, approve);
      toast({
        title: `Request ${approve ? 'Approved' : 'Denied'}`,
        description: `Password change request for user ${targetUserId} has been ${approve ? 'approved' : 'denied'}.`,
      });
      setRequests(prevRequests => prevRequests.filter(req => req.uid !== targetUserId));
    } catch (err: any) {
      console.error(`Error ${approve ? 'approving' : 'denying'} request:`, err);
      toast({ title: "Action Failed", description: err.message || `Could not ${approve ? 'approve' : 'deny'} the request.`, variant: "destructive"});
    } finally {
      setProcessingUserId(null);
    }
  };

   // Handle sending notifications (global or targeted)
   const handleSendNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !notificationMessage.trim() || isSendingNotification) return;
        if (notificationType === 'targeted' && !targetUserId) {
            toast({ title: 'Target Required', description: 'Please select a user for targeted notifications.', variant: 'destructive' });
            return;
        }

        setIsSendingNotification(true);
        try {
            let resultId: string;
            if (notificationType === 'global') {
                resultId = await sendGlobalNotification(notificationMessage.trim(), user.uid);
                toast({ title: 'Global Announcement Sent', description: 'Your announcement has been broadcast.' });
            } else {
                // Ensure targetUserId is not undefined before sending
                if (!targetUserId) {
                     throw new Error("Target user ID is missing for targeted notification.");
                }
                resultId = await sendTargetedNotification(notificationMessage.trim(), targetUserId, user.uid);
                // Try to find the user's name for the toast message
                const targetUserName = userList.find(u => u.uid === targetUserId)?.displayName || `user ${targetUserId}`;
                toast({ title: 'Targeted Notification Sent', description: `Notification sent to ${targetUserName}.` });
            }
             console.log(`Notification sent, Doc ID: ${resultId}`);
             setNotificationMessage(''); // Clear input
             setTargetUserId(undefined); // Reset target user selection
             // Optionally reset type to global?
             setNotificationType('global');
        } catch (error: any) {
             console.error("Error sending notification:", error);
            toast({ title: 'Send Failed', description: error.message || 'Could not send the notification.', variant: 'destructive' });
        } finally {
            setIsSendingNotification(false);
        }
   };

   // Handle saving settings (placeholder)
   const handleSaveSettings = async () => {
      setIsSavingSettings(true);
      try {
          console.log("Saving settings:", { allowEmoji, allowFileUploads });
          // TODO: Call updatePlatformConfig service
          // await updatePlatformConfig({ allowEmoji, allowFileUploads }, user.uid);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
          toast({ title: 'Settings Saved (Placeholder)' });
      } catch (error: any) {
          toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
      } finally {
          setIsSavingSettings(false);
      }
   };

   // Handle blocking IP address
   const handleBlockIp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !ipToBlock.trim() || isBlockingIp) return;

        setIsBlockingIp(true);
        const effectiveReason = blockReason.trim() || 'Blocked by administrator'; // Default reason
        try {
            await blockIpAddress(ipToBlock.trim(), effectiveReason, user.uid);
            toast({ title: 'IP Address Blocked', description: `IP address ${ipToBlock.trim()} has been blocked.` });
            setIpToBlock(''); // Clear input
            setBlockReason(''); // Clear reason input
        } catch (error: any) {
             toast({ title: 'IP Block Failed', description: error.message || 'Could not block the IP address.', variant: 'destructive' });
              // Log the failed attempt
             try {
                 await logSuspiciousActivity('ip_block_failure', { adminUid: user.uid, targetIp: ipToBlock.trim(), error: error.message });
             } catch (logError) {
                 console.error("Failed to log IP block failure:", logError);
             }
        } finally {
            setIsBlockingIp(false);
        }
   };

   // Handle sending reply to admin message
   const handleSendReply = async (e: React.FormEvent) => {
       e.preventDefault();
       if (!replyingToAdminMessage || !replyText.trim() || isSendingReply || !user) return;

       setIsSendingReply(true);
       console.log(`Admin: Replying to message ${replyingToAdminMessage.id} from ${replyingToAdminMessage.senderUid} with text: ${replyText}`);
       try {
           // Call the actual reply service
           await sendAdminReply(replyingToAdminMessage.id, replyText.trim(), user.uid);
           toast({ title: 'Reply Sent Successfully' });
           setReplyText('');
           setReplyingToAdminMessage(null); // Clear reply state

           // Listener will update the message state in UI
       } catch (error: any) {
           console.error("Error sending admin reply:", error);
           toast({ title: 'Reply Failed', description: error.message || 'Could not send the reply.', variant: 'destructive' });
       } finally {
           setIsSendingReply(false);
       }
   };

   // Handle story deletion from the list
   const handleStoryDeleted = (deletedStoryId: string) => {
        setStories(prevStories => prevStories.filter(story => story.id !== deletedStoryId));
   };


  // --- Render Logic ---

  if (authLoading || isAdmin === null || dbInstance === null) { // Check dbInstance as well
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">
            {authLoading ? "Loading user..." : (dbInstance === null ? "Connecting to database..." : "Loading dashboard...")}
        </p>
         {dbInstance === null && error && <p className="text-destructive text-sm mt-2">{error}</p>}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
         <Card className="w-full max-w-lg p-6 text-center border-destructive bg-destructive/10">
            <CardHeader>
                 <ShieldAlert className="h-10 w-10 mx-auto text-destructive mb-3" />
                 <CardTitle className="text-xl text-destructive-foreground">Access Denied</CardTitle>
                 <CardDescription className="text-destructive-foreground/80">{error || "You do not have permission to view this page."}</CardDescription>
            </CardHeader>
         </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-muted/30 py-8 px-4 sm:px-6 lg:px-8"> {/* Responsive padding */}
       {/* Use w-full and max-w-7xl for better responsiveness */}
      <div className="w-full max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage users, view analytics, and configure the platform.</p>
        </div>

        <Tabs defaultValue="requests" className="w-full">
           {/* Adjusted grid columns for responsiveness */}
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 gap-1 mb-4 sm:mb-6"> {/* Added one more column for Stories */}
            <TabsTrigger value="requests"><ShieldCheck className="mr-1 sm:mr-2 h-4 w-4 inline-block"/> Requests</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart2 className="mr-1 sm:mr-2 h-4 w-4 inline-block"/> Analytics</TabsTrigger>
            <TabsTrigger value="messages"><MessageSquare className="mr-1 sm:mr-2 h-4 w-4 inline-block"/> Messages</TabsTrigger>
            <TabsTrigger value="stories"><Film className="mr-1 sm:mr-2 h-4 w-4 inline-block"/> Stories</TabsTrigger> {/* Added Stories Trigger */}
            <TabsTrigger value="notifications"><Bell className="mr-1 sm:mr-2 h-4 w-4 inline-block"/> Notifications</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="mr-1 sm:mr-2 h-4 w-4 inline-block"/> Settings</TabsTrigger>
            <TabsTrigger value="security"><ShieldAlert className="mr-1 sm:mr-2 h-4 w-4 inline-block"/> Security</TabsTrigger>
          </TabsList>

          {/* Password Change Requests Tab */}
          <TabsContent value="requests">
            <Card className="shadow-lg mt-4 w-full"> {/* Ensure card takes full width */}
              <CardHeader>
                <CardTitle>Password Change Requests</CardTitle>
                <CardDescription>Review and approve or deny requests from users.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingRequests && (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 border rounded-md bg-background">
                         <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                            <div className="space-y-1.5 min-w-0">
                                 <Skeleton className="h-4 w-32" />
                                 <Skeleton className="h-3 w-48" />
                            </div>
                         </div>
                         <div className="flex gap-2 w-full sm:w-auto pt-2 sm:pt-0">
                            <Skeleton className="h-9 w-20 flex-1 sm:flex-none" />
                            <Skeleton className="h-9 w-20 flex-1 sm:flex-none" />
                         </div>
                      </div>
                    ))}
                  </div>
                )}

                {!loadingRequests && error && (
                  <div className="text-center text-destructive p-4 bg-destructive/10 border border-destructive rounded-md">
                    <p>Error loading requests: {error}</p>
                  </div>
                )}

                {!loadingRequests && !error && requests.length === 0 && (
                  <div className="text-center text-muted-foreground p-6 border border-dashed rounded-md">
                     <UserCheck className="h-10 w-10 mx-auto mb-3" />
                    <p>No pending password change requests found.</p>
                  </div>
                )}

                {!loadingRequests && !error && requests.map((reqUser) => (
                   // Updated flex layout for better responsiveness
                  <div key={reqUser.uid} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-4 border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow duration-200">
                     <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-10 w-10 border flex-shrink-0">
                            <AvatarImage src={reqUser.photoURL || undefined} alt={reqUser.displayName || 'User'} data-ai-hint="user avatar"/>
                            <AvatarFallback>{getInitials(reqUser.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                             <p className="text-sm font-medium text-foreground truncate">{reqUser.displayName || 'Unnamed User'}</p>
                             <p className="text-xs text-muted-foreground truncate">{reqUser.email}</p>
                              {/* Optionally display Request Timestamp */}
                              {/* <p className="text-xs text-muted-foreground">Requested: {formatTimestamp(reqUser.passwordRequestTimestamp)}</p> */}
                        </div>
                     </div>
                     <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto pt-2 sm:pt-0">
                         <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none"
                            onClick={() => handleReview(reqUser.uid, false)}
                            disabled={processingUserId === reqUser.uid}
                         >
                             {processingUserId === reqUser.uid ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <XCircle className="mr-2 h-4 w-4"/>}
                            Deny
                         </Button>
                         <Button
                             variant="default"
                             size="sm"
                             className="flex-1 sm:flex-none"
                             onClick={() => handleReview(reqUser.uid, true)}
                             disabled={processingUserId === reqUser.uid}
                        >
                            {processingUserId === reqUser.uid ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>}
                            Approve
                        </Button>
                     </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
           <TabsContent value="analytics">
              <Card className="shadow-lg mt-4 w-full">
                  <CardHeader>
                      <CardTitle>Platform Analytics</CardTitle>
                      <CardDescription>Overview of user activity and platform usage.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                       {loadingAnalytics && <Skeleton className="h-8 w-32 mb-4" />}
                       {!loadingAnalytics && onlineUsers !== null && (
                          <div className="p-4 border rounded-md bg-primary/10">
                              <h3 className="text-lg font-semibold text-primary-foreground">Real-time</h3>
                              <p className="text-muted-foreground">Online Users: <span className="font-bold text-foreground">{onlineUsers}</span></p>
                              {/* Add more real-time stats here */}
                          </div>
                       )}
                        {!loadingAnalytics && onlineUsers === null && <p className="text-muted-foreground italic">Could not load online users data.</p>}
                      <p className="text-muted-foreground italic text-center mt-4">More detailed usage statistics and reports coming soon...</p>
                      {/* Placeholder for charts and detailed stats */}
                  </CardContent>
              </Card>
           </TabsContent>

          {/* Messages Tab */}
           <TabsContent value="messages">
              <Card className="shadow-lg mt-4 w-full">
                   <CardHeader>
                       <CardTitle>Admin Messages</CardTitle>
                       <CardDescription>Messages sent directly to administrators.</CardDescription>
                   </CardHeader>
                    <CardContent className="space-y-4">
                         {loadingAdminMessages && (
                             <div className="space-y-3">
                                 {[...Array(2)].map((_, i) => (
                                     <div key={i} className="p-3 border rounded-md bg-background">
                                         <div className="flex items-center justify-between mb-1">
                                             <Skeleton className="h-4 w-1/3" />
                                             <Skeleton className="h-3 w-1/4" />
                                         </div>
                                         <Skeleton className="h-4 w-full" />
                                          <Skeleton className="h-8 w-20 mt-3" />
                                     </div>
                                 ))}
                             </div>
                         )}

                         {!loadingAdminMessages && adminMessages.length === 0 && (
                             <div className="text-center text-muted-foreground p-6 border border-dashed rounded-md">
                                 <MessageSquare className="h-10 w-10 mx-auto mb-3" />
                                 <p>No messages found for administrators.</p>
                             </div>
                         )}

                          {!loadingAdminMessages && adminMessages.map((msg) => (
                             <div key={msg.id} className="p-4 border rounded-lg bg-card shadow-sm">
                                 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 text-xs text-muted-foreground gap-1 sm:gap-3">
                                     <span className="truncate">From: {msg.senderName || 'Unknown User'} ({msg.senderEmail || 'No email'})</span>
                                     <span className="flex-shrink-0">{formatTimestamp(msg.timestamp)}</span>
                                 </div>
                                 <p className="text-sm text-foreground mb-3 whitespace-pre-wrap break-words">{msg.message}</p>
                                  {/* Display Reply if it exists */}
                                  {msg.reply && (
                                      <div className="mt-3 pt-3 border-t border-dashed">
                                           <p className="text-xs text-muted-foreground mb-1">
                                               Replied by: You ({formatTimestamp(msg.repliedAt)})
                                           </p>
                                           <p className="text-sm text-foreground italic bg-primary/10 p-2 rounded">{msg.reply}</p>
                                      </div>
                                  )}
                                 {/* Reply Section (Conditional - Show if not already replied) */}
                                 {!msg.reply && replyingToAdminMessage?.id === msg.id ? (
                                     <form onSubmit={handleSendReply} className="mt-3 space-y-2">
                                         <Label htmlFor={`reply-${msg.id}`}>Your Reply</Label>
                                         <Textarea
                                             id={`reply-${msg.id}`}
                                             value={replyText}
                                             onChange={(e) => setReplyText(e.target.value)}
                                             placeholder="Type your reply..."
                                             required
                                             minLength={5}
                                             maxLength={500}
                                             disabled={isSendingReply}
                                             className="min-h-[80px]"
                                         />
                                         <div className="flex justify-end gap-2">
                                             <Button type="button" variant="ghost" size="sm" onClick={() => { setReplyingToAdminMessage(null); setReplyText(''); }} disabled={isSendingReply}>Cancel</Button>
                                             <Button type="submit" size="sm" disabled={!replyText.trim() || isSendingReply}>
                                                 {isSendingReply ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>} Send Reply
                                             </Button>
                                         </div>
                                     </form>
                                 ) : (
                                     !msg.reply && // Only show reply button if not already replied
                                     <Button
                                         variant="outline"
                                         size="sm"
                                         onClick={() => setReplyingToAdminMessage(msg)}
                                         disabled={!!replyingToAdminMessage || isSendingReply} // Disable if already replying to another msg
                                         className="mt-2"
                                     >
                                         Reply
                                     </Button>
                                 )}
                             </div>
                         ))}
                    </CardContent>
              </Card>
           </TabsContent>

           {/* Stories Tab - New */}
           <TabsContent value="stories">
               <Card className="shadow-lg mt-4 w-full">
                   <CardHeader>
                       <CardTitle>Manage Stories</CardTitle>
                       <CardDescription>View and delete active user stories.</CardDescription>
                   </CardHeader>
                   <CardContent className="space-y-4">
                         {loadingStories && (
                             <div className="space-y-3">
                                 {[...Array(4)].map((_, i) => (
                                     <div key={i} className="flex items-center justify-between p-3 border rounded-md bg-background">
                                         <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                                            <div className="space-y-1.5 min-w-0">
                                                <Skeleton className="h-4 w-24" />
                                                <Skeleton className="h-3 w-40" />
                                            </div>
                                         </div>
                                         <Skeleton className="h-8 w-8" />
                                     </div>
                                 ))}
                             </div>
                         )}
                         {!loadingStories && stories.length === 0 && (
                            <div className="text-center text-muted-foreground p-6 border border-dashed rounded-md">
                                <Film className="h-10 w-10 mx-auto mb-3" />
                                <p>No active stories found.</p>
                             </div>
                         )}
                         {!loadingStories && stories.map((story) => (
                            <StoryPreview key={story.id} story={story} onDelete={handleStoryDeleted} />
                         ))}
                   </CardContent>
               </Card>
           </TabsContent>


           {/* Notifications Tab */}
           <TabsContent value="notifications">
              <Card className="shadow-lg mt-4 w-full">
                  <CardHeader>
                      <CardTitle>Notifications & Announcements</CardTitle>
                      <CardDescription>Send platform-wide or targeted notifications.</CardDescription>
                  </CardHeader>
                  <CardContent>
                        <form onSubmit={handleSendNotification} className="space-y-6">
                             {/* Notification Type */}
                            <div className="space-y-3">
                                <Label>Notification Type</Label>
                                 <RadioGroup
                                     value={notificationType}
                                     onValueChange={(value) => {
                                         setNotificationType(value as 'global' | 'targeted');
                                         if (value === 'global') setTargetUserId(undefined); // Clear target if global
                                     }}
                                     className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4" // Responsive layout
                                     disabled={isSendingNotification}
                                 >
                                     <div className="flex items-center space-x-2">
                                         <RadioGroupItem value="global" id="notif-global" />
                                         <Label htmlFor="notif-global">Global Announcement</Label>
                                     </div>
                                     <div className="flex items-center space-x-2">
                                         <RadioGroupItem value="targeted" id="notif-targeted" />
                                         <Label htmlFor="notif-targeted">Target Specific User</Label>
                                     </div>
                                 </RadioGroup>
                            </div>

                             {/* Target User Selection (Conditional) */}
                             {notificationType === 'targeted' && (
                                <div className="space-y-2">
                                    <Label htmlFor="target-user">Target User</Label>
                                     <Select
                                         value={targetUserId}
                                         onValueChange={setTargetUserId}
                                         disabled={loadingUserList || isSendingNotification}
                                     >
                                         <SelectTrigger id="target-user" className="w-full">
                                             <SelectValue placeholder={loadingUserList ? "Loading users..." : "Select a user..."} />
                                         </SelectTrigger>
                                         <SelectContent>
                                             {loadingUserList && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                                             {!loadingUserList && userList.length === 0 && <SelectItem value="no-users" disabled>No users available</SelectItem>}
                                             {!loadingUserList && userList.map(u => (
                                                <SelectItem key={u.uid} value={u.uid}>
                                                     <div className="flex items-center gap-2">
                                                         <Avatar className="h-5 w-5 text-xs border">
                                                             <AvatarImage src={u.photoURL || undefined} />
                                                             <AvatarFallback>{getInitials(u.displayName)}</AvatarFallback>
                                                         </Avatar>
                                                         <span className="truncate">{u.displayName || u.email}</span>
                                                     </div>
                                                </SelectItem>
                                             ))}
                                         </SelectContent>
                                     </Select>
                                      {loadingUserList && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/> Fetching user list...</p>}
                                </div>
                             )}

                            {/* Message Input */}
                             <div className="space-y-2">
                                 <Label htmlFor="notification-message">Message Content</Label>
                                 <Textarea
                                     id="notification-message"
                                     placeholder={notificationType === 'global' ? "Enter your global announcement..." : "Enter your message for the user..."}
                                     value={notificationMessage}
                                     onChange={(e) => setNotificationMessage(e.target.value)}
                                     required
                                     minLength={5}
                                     maxLength={500} // Example limits
                                     disabled={isSendingNotification}
                                     className="min-h-[100px]"
                                 />
                                  <p className="text-xs text-muted-foreground text-right">
                                     {notificationMessage.length} / 500
                                  </p>
                             </div>

                             {/* Submit Button */}
                             <Button type="submit" disabled={!notificationMessage.trim() || isSendingNotification || (notificationType === 'targeted' && !targetUserId)}>
                                 {isSendingNotification ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                                 Send Notification
                             </Button>
                        </form>
                  </CardContent>
              </Card>
           </TabsContent>

           {/* Settings Tab */}
           <TabsContent value="settings">
              <Card className="shadow-lg mt-4 w-full">
                  <CardHeader>
                      <CardTitle>Platform Settings</CardTitle>
                      <CardDescription>Configure chat features and platform behavior.</CardDescription>
                  </CardHeader>
                   <CardContent className="space-y-6 pt-6"> {/* Add pt-6 */}
                       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 sm:space-x-2 border p-4 rounded-md">
                           <Label htmlFor="allow-emoji" className="flex flex-col space-y-1 flex-1">
                               <span>Emoji Support</span>
                               <span className="font-normal leading-snug text-muted-foreground">
                                    Allow users to use emojis in chat messages.
                               </span>
                           </Label>
                           <Switch
                               id="allow-emoji"
                               checked={allowEmoji}
                               onCheckedChange={setAllowEmoji}
                               disabled={isSavingSettings}
                               className="flex-shrink-0"
                           />
                       </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 sm:space-x-2 border p-4 rounded-md">
                           <Label htmlFor="allow-file-uploads" className="flex flex-col space-y-1 flex-1">
                               <span>File Uploads</span>
                                <span className="font-normal leading-snug text-muted-foreground">
                                    Enable or disable file uploading capabilities in chat.
                                </span>
                           </Label>
                           <Switch
                               id="allow-file-uploads"
                               checked={allowFileUploads}
                               onCheckedChange={setAllowFileUploads}
                               disabled={isSavingSettings}
                               className="flex-shrink-0"
                           />
                       </div>
                        <p className="text-muted-foreground italic text-center text-sm">More configuration options (branding, integrations) coming soon...</p>
                       {/* Placeholder for more settings */}
                   </CardContent>
                  <CardFooter>
                       <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                           {isSavingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                           Save Settings
                       </Button>
                  </CardFooter>
              </Card>
           </TabsContent>

           {/* Security Tab */}
           <TabsContent value="security">
              <Card className="shadow-lg mt-4 w-full">
                  <CardHeader>
                      <CardTitle>Security & Access Control</CardTitle>
                      <CardDescription>Monitor activity and manage platform security.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                        {/* IP Blocking */}
                        <form onSubmit={handleBlockIp} className="border p-4 rounded-md space-y-4"> {/* Corrected onSubmit */}
                           <h4 className="font-medium text-lg">IP Address Blocking</h4>
                            <div className="space-y-2">
                                <Label htmlFor="ip-block">IP Address</Label>
                                <Input
                                    id="ip-block"
                                    type="text"
                                    placeholder="e.g., 192.168.1.100"
                                    value={ipToBlock}
                                    onChange={(e) => setIpToBlock(e.target.value)}
                                    required
                                    pattern="\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b" // More accurate IPv4 pattern
                                    disabled={isBlockingIp}
                                    className="font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                 <Label htmlFor="block-reason">Reason (Optional)</Label>
                                 <Input
                                     id="block-reason"
                                     type="text"
                                     placeholder="Reason for blocking..."
                                     value={blockReason}
                                     onChange={(e) => setBlockReason(e.target.value)}
                                     maxLength={100}
                                     disabled={isBlockingIp}
                                 />
                                 <p className="text-xs text-muted-foreground">Keep it brief (max 100 chars).</p>
                            </div>
                           <Button
                                variant="destructive"
                                type="submit"
                                disabled={!ipToBlock.trim() || isBlockingIp}
                            >
                               {isBlockingIp ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Ban className="mr-2 h-4 w-4" />}
                               Block IP Address
                           </Button>
                        </form>

                       <p className="text-muted-foreground italic text-center text-sm pt-4">More security monitoring and control features (audit logs, 2FA enforcement) coming soon...</p>
                      {/* Placeholder for security tools */}
                  </CardContent>
              </Card>
           </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}



