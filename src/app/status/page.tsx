
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { StatusForm } from '@/components/status/status-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function StatusPage() {
  const { user, loading: authLoading } = useAuth();
  const [currentStatus, setCurrentStatus] = React.useState<string | null | undefined>(undefined); // undefined indicates loading
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const { toast } = useToast();

  // Fetch current status when user is loaded
  React.useEffect(() => {
    if (authLoading) {
        setLoadingProfile(true); // Still loading auth
        setCurrentStatus(undefined);
        return;
    }
    if (!user) {
        setLoadingProfile(false); // Auth finished, no user
        setCurrentStatus(null); // No user, no status
        return;
    }

    setLoadingProfile(true); // Start loading profile data
    const fetchStatus = async () => {
       if (!db) {
           console.error("Firestore (db) not available in StatusPage useEffect");
           toast({ title: "Error", description: "Database connection failed.", variant: "destructive" });
           setLoadingProfile(false);
           setCurrentStatus(null); // Error state
           return;
       }
      const userDocRef = doc(db, 'users', user.uid);
      try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const profileData = docSnap.data() as UserProfile;
          setCurrentStatus(profileData.status || null); // Set status, default to null if missing/empty
        } else {
          console.warn("No profile document found for status page, status will be null.");
          setCurrentStatus(null); // No profile, status is null
        }
      } catch (error) {
        console.error("Error fetching user status:", error);
        toast({
          title: "Error",
          description: "Could not load current status.",
          variant: "destructive",
        });
        setCurrentStatus(null); // Error state
      } finally {
        setLoadingProfile(false); // Finish loading profile
      }
    };

    fetchStatus();
  }, [user, authLoading, toast]);

  // Callback function for StatusForm to update local state
  const handleStatusUpdate = (newStatus: string | null) => {
    setCurrentStatus(newStatus);
  };

  // --- Render Logic ---

  if (authLoading || loadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
         <Card className="w-full max-w-lg p-6">
             <Skeleton className="h-6 w-3/4 mb-2" />
             <Skeleton className="h-4 w-1/2 mb-6" />
             <Skeleton className="h-20 w-full mb-4" />
             <div className="flex justify-end">
                <Skeleton className="h-10 w-28" />
             </div>
         </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
         <Card className="w-full max-w-lg p-6 text-center">
            <CardHeader>
                 <CardTitle>Access Denied</CardTitle>
                 <CardDescription>Please log in to update your status.</CardDescription>
            </CardHeader>
            {/* Optionally link to login */}
         </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-start min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4 sm:p-6 md:p-10 pt-10">
       <div className="w-full max-w-lg">
          {/* Pass initialStatus and the update callback to StatusForm */}
          <StatusForm
             initialStatus={currentStatus}
             onStatusUpdate={handleStatusUpdate}
          />
       </div>
    </div>
  );
}
