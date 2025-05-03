
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getPasswordChangeRequests, reviewPasswordChangeRequest } from '@/lib/user-profile.service';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ShieldAlert, CheckCircle, XCircle, UserCheck, UserX, BarChart2, Bell, Settings, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs components
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getFirestore, doc, getDoc, type Firestore } from 'firebase/firestore';
import { app } from '@/lib/firebase'; // Import the initialized app

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
  const [onlineUsers, setOnlineUsers] = React.useState<number | null>(null); // For Analytics
  const { toast } = useToast();

  // Fetch admin status and requests on mount and when user changes
  React.useEffect(() => {
    if (authLoading) {
      setIsAdmin(null);
      setLoadingRequests(true);
      setRequests([]);
      setError(null);
      setOnlineUsers(null); // Reset analytics
      return;
    }
    if (!user) {
      setIsAdmin(false);
      setLoadingRequests(false);
      setRequests([]);
      setError("Please log in to access the admin page.");
      setOnlineUsers(null);
      return;
    }

    // Need db instance here
    const db = getFirestore(app); // Use initialized app
    if (!db) {
       console.error("Failed to get Firestore instance in AdminPage");
       setError("Database unavailable.");
       setIsAdmin(false);
       setLoadingRequests(false);
       setOnlineUsers(null);
       return;
    }

    const checkAdminAndFetchData = async (firestoreInstance: Firestore) => {
        setLoadingRequests(true);
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

                // Fetch analytics data (dummy for now)
                // Replace with actual API call: e.g., const onlineCount = await getOnlineUsersCount();
                await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
                setOnlineUsers(Math.floor(Math.random() * 50) + 1); // Dummy online user count

             } else {
                setError("You do not have permission to access this page.");
                setRequests([]);
                setOnlineUsers(null);
             }
        } catch (err: any) {
            console.error("Error checking admin status or fetching data:", err);
            setError(err.message || "Failed to load admin data.");
            setIsAdmin(false);
            setRequests([]);
            setOnlineUsers(null);
        } finally {
            setLoadingRequests(false);
        }
    };

    checkAdminAndFetchData(db);

  }, [user, authLoading, toast]); // Rerun if user or auth state changes


   // Function to handle approving/denying requests
  const handleReview = async (targetUserId: string, approve: boolean) => {
    if (!user || !isAdmin || processingUserId) return;

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


  // --- Render Logic ---

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading admin dashboard...</p>
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
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5"> {/* Adjust columns for different screen sizes */}
            <TabsTrigger value="requests"><ShieldAlert className="mr-2 h-4 w-4 inline-block"/> Requests</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart2 className="mr-2 h-4 w-4 inline-block"/> Analytics</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="mr-2 h-4 w-4 inline-block"/> Notifications</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="mr-2 h-4 w-4 inline-block"/> Settings</TabsTrigger>
            <TabsTrigger value="security"><ShieldCheck className="mr-2 h-4 w-4 inline-block"/> Security</TabsTrigger>
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
                      {onlineUsers === null && !error && <Skeleton className="h-8 w-32 mb-4" />}
                      {onlineUsers !== null && (
                          <div className="p-4 border rounded-md bg-primary/10">
                              <h3 className="text-lg font-semibold text-primary-foreground">Real-time</h3>
                              <p className="text-muted-foreground">Online Users: <span className="font-bold text-foreground">{onlineUsers}</span></p>
                              {/* Add more real-time stats here */}
                          </div>
                      )}
                       {error && <p className="text-destructive">Could not load analytics data.</p>}
                      <p className="text-muted-foreground italic text-center">More detailed usage statistics and reports coming soon...</p>
                      {/* Placeholder for charts and detailed stats */}
                  </CardContent>
              </Card>
           </TabsContent>

           {/* Notifications Tab */}
           <TabsContent value="notifications">
              <Card className="shadow-lg mt-4">
                  <CardHeader>
                      <CardTitle>Notifications & Announcements</CardTitle>
                      <CardDescription>Send messages to users or make platform-wide announcements.</CardDescription>
                  </CardHeader>
                  <CardContent>
                       <p className="text-muted-foreground italic text-center">Notification and announcement features coming soon...</p>
                      {/* Placeholder for notification form */}
                  </CardContent>
              </Card>
           </TabsContent>

           {/* Settings Tab */}
           <TabsContent value="settings">
              <Card className="shadow-lg mt-4">
                  <CardHeader>
                      <CardTitle>Platform Settings</CardTitle>
                      <CardDescription>Configure chat features, branding, and integrations.</CardDescription>
                  </CardHeader>
                  <CardContent>
                       <p className="text-muted-foreground italic text-center">Configuration options coming soon...</p>
                      {/* Placeholder for settings form */}
                  </CardContent>
              </Card>
           </TabsContent>

           {/* Security Tab */}
           <TabsContent value="security">
              <Card className="shadow-lg mt-4">
                  <CardHeader>
                      <CardTitle>Security & Access Control</CardTitle>
                      <CardDescription>Monitor activity and manage platform security settings.</CardDescription>
                  </CardHeader>
                  <CardContent>
                       <p className="text-muted-foreground italic text-center">Security monitoring and control features coming soon...</p>
                      {/* Placeholder for security tools */}
                  </CardContent>
              </Card>
           </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
```
  </change>
  <change>
    <file>src/components/ui/tabs.tsx</file>
    <description>Ensure Tabs components are available (no changes needed, file already exists).</description>
    <content><![CDATA[
"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
