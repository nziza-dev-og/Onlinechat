
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getPasswordChangeRequests, reviewPasswordChangeRequest } from '@/lib/user-profile.service';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ShieldAlert, CheckCircle, XCircle, UserCheck, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNowStrict, parseISO } from 'date-fns'; // Import date-fns if needed for timestamps
import { getFirestore, doc, getDoc, type Firestore } from 'firebase/firestore'; // Import Firestore functions

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
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null); // null = checking, false = not admin, true = is admin
  const [processingUserId, setProcessingUserId] = React.useState<string | null>(null); // Track which request is being processed
  const { toast } = useToast();

  // Fetch admin status and requests on mount and when user changes
  React.useEffect(() => {
    if (authLoading) {
      setIsAdmin(null); // Still checking auth
      setLoadingRequests(true);
      setRequests([]);
      setError(null);
      return;
    }
    if (!user) {
      setIsAdmin(false); // Not logged in, not admin
      setLoadingRequests(false);
      setRequests([]);
      setError("Please log in to access the admin page.");
      return;
    }

    // Need db instance here
     const db = getFirestore(); // Get db instance here
     if (!db) {
        console.error("Failed to get Firestore instance in AdminPage");
        setError("Database unavailable.");
        setIsAdmin(false);
        setLoadingRequests(false);
        return;
     }

    // Define the async function inside useEffect or useCallback
    const checkAdminAndFetchRequests = async (firestoreInstance: Firestore) => {
        setLoadingRequests(true);
        setError(null);
        try {
             // Placeholder: fetch profile to check isAdmin flag
             const profile = await getDoc(doc(firestoreInstance, 'users', user.uid)); // Use the passed instance
             const isAdminUser = profile.exists() && profile.data()?.isAdmin === true;
             setIsAdmin(isAdminUser);

             if (isAdminUser) {
                const fetchedRequests = await getPasswordChangeRequests(user.uid);
                setRequests(fetchedRequests);
             } else {
                setError("You do not have permission to access this page.");
                setRequests([]);
             }
        } catch (err: any) {
            console.error("Error checking admin status or fetching requests:", err);
            setError(err.message || "Failed to load admin data.");
            setIsAdmin(false); // Assume not admin on error
            setRequests([]);
        } finally {
            setLoadingRequests(false);
        }
    };

    // Call the function with the db instance
    checkAdminAndFetchRequests(db);

  }, [user, authLoading]); // Add db dependency if used directly

   // Function to handle approving/denying requests
  const handleReview = async (targetUserId: string, approve: boolean) => {
    if (!user || !isAdmin || processingUserId) return;

    setProcessingUserId(targetUserId); // Indicate processing started
    try {
      await reviewPasswordChangeRequest(user.uid, targetUserId, approve);
      toast({
        title: `Request ${approve ? 'Approved' : 'Denied'}`,
        description: `Password change request for user ${targetUserId} has been ${approve ? 'approved' : 'denied'}.`,
      });
      // Remove the processed request from the local state for immediate UI update
      setRequests(prevRequests => prevRequests.filter(req => req.uid !== targetUserId));
    } catch (err: any) {
      console.error(`Error ${approve ? 'approving' : 'denying'} request:`, err);
      toast({
        title: "Action Failed",
        description: err.message || `Could not ${approve ? 'approve' : 'deny'} the request.`,
        variant: "destructive",
      });
    } finally {
      setProcessingUserId(null); // Indicate processing finished
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
      <div className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage user password change requests.</p>
        </div>

        <Card className="shadow-lg">
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
                         {/* Optionally display request time if available */}
                         {/* <p className="text-xs text-muted-foreground mt-1">Requested: {formatDistanceToNowStrict(parseISO(reqUser.requestTimestampISO), { addSuffix: true })}</p> */}
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
      </div>
    </div>
  );
}

