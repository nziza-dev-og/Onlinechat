
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Users, MessageSquareText, Image as ImageIcon, User as UserIcon, LogOut, Settings, BarChart2, Bell, Check, Palette, Clapperboard } from 'lucide-react'; // Added Clapperboard
import Link from 'next/link';
import { getOnlineUsersCount } from '@/lib/admin.service'; // Re-using admin service for count
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase'; // Import db
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp, type Unsubscribe } from 'firebase/firestore'; // Import firestore functions
import type { NotificationSerializable } from '@/lib/notification.service'; // Import type
import { formatDistanceToNowStrict } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area'; // Import ScrollArea
import { cn } from '@/lib/utils'; // Import cn
import { ThemeToggle } from '@/components/theme/theme-toggle'; // Import ThemeToggle

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

// Helper to format timestamp or ISO string relative time
const formatRelativeTime = (timestampISO: string | null | undefined): string => {
    if (!timestampISO) return 'just now';
    try {
        const date = new Date(timestampISO); // Works directly with ISO string
        return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch {
        return 'Invalid date';
    }
};


export default function DashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [onlineUsers, setOnlineUsers] = React.useState<number | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = React.useState(true);
  const [notifications, setNotifications] = React.useState<NotificationSerializable[]>([]);
  const [loadingNotifications, setLoadingNotifications] = React.useState(true);
  const { toast } = useToast();
  const notificationListenersUnsubscribeRef = React.useRef<Unsubscribe | null>(null); // Ref to hold combined listener cleanup

  // Fetch analytics data on mount
  React.useEffect(() => {
    if (authLoading) {
        setLoadingAnalytics(true);
        return;
    }
    if (!user) {
        setLoadingAnalytics(false); // No user, no analytics needed
        setOnlineUsers(null);
        return;
    }

    const fetchAnalytics = async () => {
        setLoadingAnalytics(true);
        try {
            const onlineCount = await getOnlineUsersCount();
            setOnlineUsers(onlineCount);
        } catch (analyticsError: any) {
             console.error("Error fetching analytics for dashboard:", analyticsError);
             // Don't toast here, less critical for dashboard
             setOnlineUsers(0); // Default to 0 on error
        } finally {
             setLoadingAnalytics(false);
        }
    };

    fetchAnalytics();

  }, [user, authLoading]);


  // Fetch notifications for the current user
  React.useEffect(() => {
     // Cleanup previous listener if it exists
     if (notificationListenersUnsubscribeRef.current) {
         console.log("Dashboard: Cleaning up previous notification listeners.");
         notificationListenersUnsubscribeRef.current();
         notificationListenersUnsubscribeRef.current = null;
     }

    if (!user || !db) { // Ensure db instance is available
        console.log("Dashboard: Waiting for user or DB for notifications.");
        setLoadingNotifications(!user && !db); // Loading if user or db is expected but not ready
        setNotifications([]);
        return;
    }

    console.log("Dashboard: Setting up notification listeners.");
    setLoadingNotifications(true);

    try {
        const notificationsRef = collection(db, 'notifications');
        // Separate queries for global and targeted
        const globalQuery = query(
            notificationsRef,
            where('isGlobal', '==', true),
            orderBy('timestamp', 'desc'),
            limit(15) // Limit global separately
        );
        const targetedQuery = query(
             notificationsRef,
             where('targetUserId', '==', user.uid),
             orderBy('timestamp', 'desc'),
             limit(15) // Limit targeted separately
        );

        const notificationMap = new Map<string, NotificationSerializable>(); // Use Map to deduplicate

        const processSnapshot = (snapshot: any, source: 'global' | 'targeted') => {
             console.log(`Dashboard: Received ${snapshot.docs.length} docs from ${source} notification listener.`);
             snapshot.docs.forEach((doc: any) => {
                const data = doc.data();
                 // Robust timestamp check
                 let timestamp: Date | null = null;
                 if (data.timestamp instanceof Timestamp) {
                     timestamp = data.timestamp.toDate();
                 } else if (data.timestamp && typeof data.timestamp.toDate === 'function') {
                     try { timestamp = data.timestamp.toDate(); } catch { /* ignore invalid */ }
                 } else if (typeof data.timestamp === 'string') {
                     try { timestamp = new Date(data.timestamp); } catch { /* ignore invalid */ }
                 } else if (typeof data.timestamp?.seconds === 'number') { // Handle plain objects
                     try { timestamp = new Timestamp(data.timestamp.seconds, data.timestamp.nanoseconds).toDate(); } catch { /* ignore invalid */ }
                 }

                if (timestamp && !isNaN(timestamp.getTime())) {
                    const notification: NotificationSerializable = {
                        id: doc.id,
                        message: data.message || '',
                        timestamp: timestamp.toISOString(),
                        isGlobal: data.isGlobal ?? false,
                        targetUserId: data.targetUserId ?? null,
                        isRead: source === 'targeted' ? (data.isRead ?? false) : undefined, // isRead only relevant for targeted
                    };
                    notificationMap.set(notification.id, notification);
                } else {
                    console.warn("Skipping notification with invalid timestamp:", doc.id, data);
                }
             });

             const combinedNotifications = Array.from(notificationMap.values())
                                       .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort combined list

             setNotifications(combinedNotifications);
             setLoadingNotifications(false); // Set loading false after processing *any* snapshot
             console.log(`Dashboard: Updated notifications state with ${combinedNotifications.length} items.`);
        };

        // Setup individual listeners
        const unsubscribeGlobal = onSnapshot(globalQuery, (snapshot) => processSnapshot(snapshot, 'global'), (error) => {
            console.error("Error fetching global notifications:", error);
            toast({ title: "Notification Error", description: "Could not load announcements.", variant: "destructive" });
            setLoadingNotifications(false);
        });

        const unsubscribeTargeted = onSnapshot(targetedQuery, (snapshot) => processSnapshot(snapshot, 'targeted'), (error) => {
            console.error("Error fetching targeted notifications:", error);
             toast({ title: "Notification Error", description: "Could not load personal notifications.", variant: "destructive" });
            setLoadingNotifications(false);
        });

        // Store combined unsubscribe function in the ref
        notificationListenersUnsubscribeRef.current = () => {
            console.log("Dashboard: Running combined notification listener cleanup.");
            unsubscribeGlobal();
            unsubscribeTargeted();
        };

    } catch (error) {
        console.error("Error setting up notification listeners:", error);
        toast({ title: "Setup Error", description: "Failed to initialize notification listeners.", variant: "destructive" });
        setLoadingNotifications(false);
        if (notificationListenersUnsubscribeRef.current) {
           notificationListenersUnsubscribeRef.current(); // Attempt cleanup on setup error
           notificationListenersUnsubscribeRef.current = null;
        }
    }

    // Cleanup listener on unmount or when dependencies change
    return () => {
      if (notificationListenersUnsubscribeRef.current) {
         console.log("Dashboard: Cleaning up notification listeners in useEffect return.");
         notificationListenersUnsubscribeRef.current();
         notificationListenersUnsubscribeRef.current = null;
      }
    };
  }, [user, db, toast]); // Rerun if user or db instance changes


  // --- Mark Notification as Read (Placeholder - Needs Implementation) ---
  const markAsRead = async (notificationId: string) => {
      console.log(`Placeholder: Mark notification ${notificationId} as read.`);
      // TODO: Implement Firestore update to set `isRead: true` for the notification
      // await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
      toast({ title: "Marked as Read (Placeholder)" });
      // Optimistic UI update (or wait for listener)
      // setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
  };


  // --- Render Logic ---

  // Loading state for authentication
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading your dashboard...</p>
      </div>
    );
  }

  // If user is not logged in, prompt to login (or redirect)
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <UserIcon className="h-12 w-12 mx-auto text-primary mb-3" />
            <CardTitle>Access Your Dashboard</CardTitle>
            <CardDescription>Please log in to view your dashboard and access chat features.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild>
              <Link href="/">Log In / Sign Up</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main Dashboard Content
  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-theme(spacing.14))] bg-muted/30 py-8 px-4">
      <div className="w-full max-w-5xl space-y-8"> {/* Slightly wider */}
        {/* Welcome Card */}
        <Card className="shadow-lg overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-4 p-6 bg-card border-b">
            <Avatar className="h-16 w-16 border">
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} data-ai-hint="user avatar large" />
              <AvatarFallback className="text-2xl">{getInitials(user.displayName)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-2xl font-bold text-foreground">
                Welcome back, {user.displayName || 'User'}!
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-1">
                Here's a quick overview and your recent notifications.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 ml-auto">
                <ThemeToggle />
                <Button variant="outline" size="sm" onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Quick Actions & Analytics/Notifications Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Quick Links Card */}
          <Card className="shadow-md md:col-span-1">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Jump right back in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="default" className="w-full justify-start">
                <Link href="/">
                  <MessageSquareText className="mr-2 h-4 w-4" /> Go to Chat
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/posts">
                  <ImageIcon className="mr-2 h-4 w-4" /> View Posts Feed
                </Link>
              </Button>
               <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/stories">
                  <Clapperboard className="mr-2 h-4 w-4" /> View Stories
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/profile">
                  <UserIcon className="mr-2 h-4 w-4" /> Edit Profile
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/status">
                   <Settings className="mr-2 h-4 w-4" /> Update Status
                </Link>
              </Button>
               {/* Add Theme Toggle to Quick Actions as well */}
              {/* <div className="pt-3 border-t">
                <div className="flex items-center justify-between">
                   <Label htmlFor="theme-toggle-quick" className="text-sm font-medium flex items-center gap-2">
                      <Palette className="h-4 w-4 text-muted-foreground"/> Theme
                   </Label>
                   <ThemeToggle id="theme-toggle-quick" />
                </div>
              </div> */}
            </CardContent>
          </Card>

           {/* Combined Analytics & Notifications Card */}
           <Card className="shadow-md md:col-span-2">
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary"/> Recent Notifications & Activity
                  </CardTitle>
                  <CardDescription>Latest announcements and platform stats.</CardDescription>
              </CardHeader>
               <CardContent className="space-y-4">
                   {/* Online Users */}
                   <div className="flex items-center justify-between p-3 bg-primary/10 rounded-md">
                        <div className="flex items-center gap-2">
                             <Users className="h-5 w-5 text-primary-foreground/80"/>
                             <span className="text-sm font-medium text-primary-foreground">Online Users</span>
                        </div>
                        {loadingAnalytics ? (
                            <Skeleton className="h-5 w-8" />
                        ) : (
                             <span className="text-lg font-bold text-foreground">{onlineUsers ?? 'N/A'}</span>
                        )}
                   </div>

                   {/* Notifications List */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground pl-1">Notifications</h4>
                        {loadingNotifications && (
                             <div className="space-y-2 p-2">
                                 <Skeleton className="h-10 w-full" />
                                 <Skeleton className="h-10 w-full" />
                             </div>
                        )}
                         {!loadingNotifications && notifications.length === 0 && (
                             <p className="text-xs text-center text-muted-foreground italic py-4">No new notifications.</p>
                         )}
                         {!loadingNotifications && notifications.length > 0 && (
                            <ScrollArea className="h-[200px] pr-3"> {/* Fixed height scroll area */}
                                 <div className="space-y-2">
                                     {notifications.map((n) => (
                                         <div
                                            key={n.id}
                                            className={cn(
                                                "flex items-start gap-3 p-3 border rounded-md text-sm transition-colors duration-200",
                                                n.isGlobal ? "bg-background" : "bg-card",
                                                !n.isGlobal && !n.isRead ? "border-primary/50" : "border-border/50", // Highlight unread targeted
                                            )}
                                         >
                                             <Bell className={cn("h-4 w-4 mt-0.5 flex-shrink-0", n.isGlobal ? "text-primary" : "text-muted-foreground")} />
                                             <div className="flex-1">
                                                 <p className={cn("leading-snug", !n.isGlobal && !n.isRead && "font-medium")}>{n.message}</p>
                                                 <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(n.timestamp)}</p>
                                             </div>
                                              {/* Mark as read button for targeted, unread notifications */}
                                             {!n.isGlobal && !n.isRead && (
                                                 <Button
                                                     variant="ghost"
                                                     size="icon"
                                                     className="h-7 w-7 text-muted-foreground hover:text-primary"
                                                     onClick={() => markAsRead(n.id)}
                                                     aria-label="Mark as read"
                                                 >
                                                      <Check className="h-4 w-4" />
                                                 </Button>
                                             )}
                                         </div>
                                     ))}
                                 </div>
                            </ScrollArea>
                         )}
                    </div>
               </CardContent>
               <CardFooter className="text-xs text-muted-foreground justify-center border-t pt-3">
                   Online status based on activity in the last 5 minutes.
               </CardFooter>
           </Card>
        </div>

        {/* Add a Settings Card maybe? */}
        <Card className="shadow-md">
           <CardHeader>
              <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary"/> Settings
              </CardTitle>
              <CardDescription>Manage your preferences.</CardDescription>
           </CardHeader>
            <CardContent>
                 <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                       <Palette className="h-4 w-4 text-muted-foreground"/> Appearance
                    </span>
                    <ThemeToggle />
                 </div>
            </CardContent>
        </Card>

      </div>
    </div>
  );
}

