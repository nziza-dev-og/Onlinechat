
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getPasswordChangeRequests, reviewPasswordChangeRequest } from '@/lib/user-profile.service';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ShieldAlert, CheckCircle, XCircle, UserCheck, UserX, BarChart2, Bell, Settings, ShieldCheck, Send, Ban } from 'lucide-react'; // Added Ban icon
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getFirestore, doc, getDoc, type Firestore } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { getOnlineUsersCount } from '@/lib/admin.service';
import { sendNotification } from '@/lib/notification.service'; // Import notification service
import { Textarea } from '@/components/ui/textarea'; // Import Textarea
import { Label } from '@/components/ui/label'; // Import Label
import { Switch } from "@/components/ui/switch"; // Import Switch for settings
import { Input } from "@/components/ui/input"; // Import Input for settings/security
import { blockIpAddress, logSuspiciousActivity } from '@/lib/security.service'; // Import security services

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
  const [notificationMessage, setNotificationMessage] = React.useState(''); // State for notification input
  const [isSendingNotification, setIsSendingNotification] = React.useState(false); // State for notification sending

  // Placeholder states for Settings
  const [allowEmoji, setAllowEmoji] = React.useState(true);
  const [allowFileUploads, setAllowFileUploads] = React.useState(true);
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);

  // Security States
  const [ipToBlock, setIpToBlock] = React.useState('');
  const [isBlockingIp, setIsBlockingIp] = React.useState(false);
  const [blockReason, setBlockReason] = React.useState(''); // Optional reason

  const { toast } = useToast();

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
        }
    }, []);


  // Fetch admin status and data on mount and when user/db changes
  React.useEffect(() => {
    if (authLoading || dbInstance === null) { // Wait for auth and db
      setIsAdmin(null);
      setLoadingRequests(true);
      setLoadingAnalytics(true);
      setRequests([]);
      setOnlineUsers(null);
      return;
    }
    if (!user) {
      setIsAdmin(false);
      setLoadingRequests(false);
      setLoadingAnalytics(false);
      setRequests([]);
      setError("Please log in to access the admin page.");
      setOnlineUsers(null);
      return;
    }

    const checkAdminAndFetchData = async (firestoreInstance: Firestore) => {
        setLoadingRequests(true);
        setLoadingAnalytics(true);
        setError(null);
        setOnlineUsers(null);
        try {
             const profile = await getDoc(doc(firestoreInstance, 'users', user.uid));
             const isAdminUser = profile.exists() && profile.data()?.isAdmin === true;
             setIsAdmin(isAdminUser);

             if (isAdminUser) {
                // Fetch password requests
                const fetchedRequests = await getPasswordChangeRequests(user.uid);
                setRequests(fetchedRequests);
                setLoadingRequests(false); // Requests loaded

                // Fetch analytics data
                try {
                    const onlineCount = await getOnlineUsersCount();
                    setOnlineUsers(onlineCount);
                } catch (analyticsError: any) {
                     console.error("Error fetching analytics:", analyticsError);
                     toast({
                         title: "Analytics Error",
                         description: analyticsError.message || "Could not load online user count.",
                         variant: "destructive",
                     });
                     setOnlineUsers(0); // Default to 0 on error
                } finally {
                     setLoadingAnalytics(false); // Analytics loaded (or failed)
                }

                // TODO: Fetch initial settings values from config service
                // const config = await getPlatformConfig();
                // setAllowEmoji(config.allowEmoji ?? true);
                // setAllowFileUploads(config.allowFileUploads ?? true);

             } else {
                setError("You do not have permission to access this page.");
                setRequests([]);
                setOnlineUsers(null);
                setLoadingRequests(false);
                setLoadingAnalytics(false);
             }
        } catch (err: any) {
            console.error("Error checking admin status or fetching data:", err);
            setError(err.message || "Failed to load admin data.");
            setIsAdmin(false);
            setRequests([]);
            setOnlineUsers(null);
            setLoadingRequests(false);
            setLoadingAnalytics(false);
        }
    };

    checkAdminAndFetchData(firestoreInstance);

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
      toast({
        title: "Action Failed",
        description: err.message || `Could not ${approve ? 'approve' : 'deny'} the request.`,
        variant: "destructive",
      });
    } finally {
      setProcessingUserId(null);
    }
  };

   // Handle sending notifications
   const handleSendNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!notificationMessage.trim() || isSendingNotification) return;

        setIsSendingNotification(true);
        try {
            await sendNotification(notificationMessage.trim()); // Send global announcement
            toast({
                title: 'Announcement Sent',
                description: 'Your announcement has been broadcast.',
            });
            setNotificationMessage(''); // Clear input
        } catch (error: any) {
            toast({
                title: 'Send Failed',
                description: error.message || 'Could not send the announcement.',
                variant: 'destructive',
            });
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
            toast({
                title: 'IP Address Blocked',
                description: `IP address ${ipToBlock.trim()} has been blocked.`,
            });
            setIpToBlock(''); // Clear input
            setBlockReason(''); // Clear reason input
        } catch (error: any) {
             toast({
                title: 'IP Block Failed',
                description: error.message || 'Could not block the IP address.',
                variant: 'destructive',
             });
              // Log the failed attempt
             try {
                 await logSuspiciousActivity('ip_block_failure', {
                     adminUid: user.uid,
                     targetIp: ipToBlock.trim(),
                     error: error.message,
                 });
             } catch (logError) {
                 console.error("Failed to log IP block failure:", logError);
             }
        } finally {
            setIsBlockingIp(false);
        }
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
    <div className="flex flex-col items-center min-h-screen bg-muted/30 py-8 px-4">
      <div className="w-full max-w-6xl"> {/* Increased max-width */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage users, view analytics, and configure the platform.</p>
        </div>

        <Tabs defaultValue="requests" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 mb-4"> {/* Added mb-4 */}
            <TabsTrigger value="requests"><ShieldCheck className="mr-2 h-4 w-4 inline-block"/> Requests</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart2 className="mr-2 h-4 w-4 inline-block"/> Analytics</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="mr-2 h-4 w-4 inline-block"/> Notifications</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="mr-2 h-4 w-4 inline-block"/> Settings</TabsTrigger>
            <TabsTrigger value="security"><ShieldAlert className="mr-2 h-4 w-4 inline-block"/> Security</TabsTrigger>
          </TabsList>

          {/* Password Change Requests Tab */}
          <TabsContent value="requests">
            <Card className="shadow-lg mt-4">
              <CardHeader>
                <CardTitle>Password Change Requests</CardTitle>
                <CardDescription>Review and approve or deny requests from users.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingRequests && (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-md bg-background">
                         <div className="flex items-center gap-3">
                            <Skeleton className="h-9 w-9 rounded-full" />
                            <div className="space-y-1.5">
                                 <Skeleton className="h-4 w-32" />
                                 <Skeleton className="h-3 w-48" />
                            </div>
                         </div>
                         <div className="flex gap-2">
                            <Skeleton className="h-9 w-20" />
                            <Skeleton className="h-9 w-20" />
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
                  <div key={reqUser.uid} className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow duration-200">
                     <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-10 w-10 border">
                            <AvatarImage src={reqUser.photoURL || undefined} alt={reqUser.displayName || 'User'} data-ai-hint="user avatar"/>
                            <AvatarFallback>{getInitials(reqUser.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                             <p className="text-sm font-medium text-foreground truncate">{reqUser.displayName || 'Unnamed User'}</p>
                             <p className="text-xs text-muted-foreground truncate">{reqUser.email}</p>
                        </div>
                     </div>
                     <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
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
              <Card className="shadow-lg mt-4">
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

           {/* Notifications Tab */}
           <TabsContent value="notifications">
              <Card className="shadow-lg mt-4">
                  <CardHeader>
                      <CardTitle>Notifications & Announcements</CardTitle>
                      <CardDescription>Send platform-wide announcements to all users.</CardDescription>
                  </CardHeader>
                  <CardContent>
                        <form onSubmit={handleSendNotification} className="space-y-4">
                             <div className="space-y-2">
                                 <Label htmlFor="notification-message">Announcement Message</Label>
                                 <Textarea
                                     id="notification-message"
                                     placeholder="Enter your announcement here..."
                                     value={notificationMessage}
                                     onChange={(e) => setNotificationMessage(e.target.value)}
                                     required
                                     minLength={10}
                                     maxLength={500} // Example limits
                                     disabled={isSendingNotification}
                                     className="min-h-[100px]"
                                 />
                                  <p className="text-xs text-muted-foreground text-right">
                                     {notificationMessage.length} / 500
                                  </p>
                             </div>
                             <Button type="submit" disabled={!notificationMessage.trim() || isSendingNotification}>
                                 {isSendingNotification ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                                 Send Announcement
                             </Button>
                        </form>
                       <p className="text-muted-foreground italic text-center mt-6 text-sm">Targeted notifications (to specific users) coming soon...</p>
                  </CardContent>
              </Card>
           </TabsContent>

           {/* Settings Tab */}
           <TabsContent value="settings">
              <Card className="shadow-lg mt-4">
                  <CardHeader>
                      <CardTitle>Platform Settings</CardTitle>
                      <CardDescription>Configure chat features and platform behavior.</CardDescription>
                  </CardHeader>
                   <CardContent className="space-y-6 pt-6"> {/* Add pt-6 */}
                       <div className="flex items-center justify-between space-x-2 border p-4 rounded-md">
                           <Label htmlFor="allow-emoji" className="flex flex-col space-y-1">
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
                           />
                       </div>
                        <div className="flex items-center justify-between space-x-2 border p-4 rounded-md">
                           <Label htmlFor="allow-file-uploads" className="flex flex-col space-y-1">
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
              <Card className="shadow-lg mt-4">
                  <CardHeader>
                      <CardTitle>Security & Access Control</CardTitle>
                      <CardDescription>Monitor activity and manage platform security.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                        {/* IP Blocking */}
                        <form onSubmit={handleBlockIp} className="border p-4 rounded-md space-y-4">
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
                                    pattern="\b(?:\d{1,3}\.){3}\d{1,3}\b" // Basic IP validation pattern
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


    