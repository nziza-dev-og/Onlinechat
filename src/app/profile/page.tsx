
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase'; // Keep db import for profile fetching
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { updateProfile as updateAuthProfile } from 'firebase/auth'; // Rename to avoid conflict
import { updateUserProfileDocument } from '@/lib/user-profile.service'; // Import the service
import { Edit, Save, User, Mail, CalendarDays, Loader2, Image as ImageIcon } from 'lucide-react'; // Changed Camera to ImageIcon
import { format } from 'date-fns'; // For formatting dates

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

// Validation schema for the edit form, using photoURL
const profileSchema = z.object({
  displayName: z.string().min(1, { message: "Display name cannot be empty." }).max(50, { message: "Display name too long." }).optional(),
  photoURL: z.string().url({ message: "Please enter a valid URL." }).max(1024, { message: "URL is too long." }).or(z.literal('')).optional().nullable(), // Allow empty string or null
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [profileData, setProfileData] = React.useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null); // Use string for URL preview
  const { toast } = useToast();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      photoURL: '', // Initialize with empty string
    },
  });

  // Watch photoURL field for preview updates
  const watchedPhotoURL = form.watch('photoURL');
  React.useEffect(() => {
    if (isEditing) {
      setPhotoPreview(watchedPhotoURL);
    }
  }, [watchedPhotoURL, isEditing]);


  // Fetch profile data from Firestore
  React.useEffect(() => {
    if (authLoading || !user) {
        // Reset states if user logs out or while auth is loading
        setProfileData(null);
        setLoadingProfile(authLoading); // Reflect auth loading state
        setIsEditing(false);
        setPhotoPreview(null);
        return;
    }

    setLoadingProfile(true);
    const fetchProfile = async () => {
      if (!db) {
          console.error("Firestore (db) not available in ProfilePage useEffect");
          setLoadingProfile(false);
          toast({ title: "Error", description: "Database connection failed.", variant: "destructive" });
          return;
      }
      const userDocRef = doc(db, 'users', user.uid);
      try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          setProfileData(data);
          form.reset({
             displayName: data.displayName || '',
             photoURL: data.photoURL || '' // Pre-fill form with photoURL
            });
          setPhotoPreview(data.photoURL); // Set initial preview
        } else {
          console.log("No such profile document! Using auth data as fallback.");
          // Use auth data as fallback
           const fallbackData = {
               uid: user.uid,
               email: user.email,
               displayName: user.displayName,
               photoURL: user.photoURL,
           };
           setProfileData(fallbackData);
           form.reset({
                displayName: fallbackData.displayName || '',
                photoURL: fallbackData.photoURL || ''
            });
           setPhotoPreview(fallbackData.photoURL);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast({
          title: "Error",
          description: "Could not load profile data.",
          variant: "destructive",
        });
        // Set minimal data from auth as fallback on error
        const fallbackData = { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL };
        setProfileData(fallbackData);
        form.reset({
            displayName: fallbackData.displayName || '',
            photoURL: fallbackData.photoURL || ''
        });
        setPhotoPreview(fallbackData.photoURL);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchProfile();
  }, [user, authLoading, toast, form]);


  // Handle profile update submission
  const onSubmit = async (data: ProfileFormData) => {
     if (!user || !profileData) return; // Should not happen if button is enabled

     setIsSaving(true);
     // Get the new photo URL from form data. Handle empty string as null.
     const newPhotoURL = data.photoURL === '' ? null : data.photoURL;
     const newDisplayName = data.displayName?.trim() || null; // Trim whitespace, fallback to null

     try {
        // 1. Prepare update data for Firebase Auth
         const authUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
         // Only include fields if they actually changed OR if they are being set for the first time
         if (newDisplayName !== (profileData.displayName ?? user.displayName)) {
            authUpdateData.displayName = newDisplayName;
         }
         if (newPhotoURL !== (profileData.photoURL ?? user.photoURL)) {
             authUpdateData.photoURL = newPhotoURL;
         }

         // 2. Update Auth profile if necessary
         if (Object.keys(authUpdateData).length > 0) {
            await updateAuthProfile(user, authUpdateData);
             console.log("Firebase Auth profile updated:", authUpdateData);
         }

        // 3. Update Firestore document using the Server Action
        const firestoreUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
         if ('displayName' in authUpdateData) {
             firestoreUpdateData.displayName = authUpdateData.displayName;
         }
         if ('photoURL' in authUpdateData) {
             firestoreUpdateData.photoURL = authUpdateData.photoURL;
         }

         // Only call the update service if there's actually data to update
         if (Object.keys(firestoreUpdateData).length > 0) {
            console.log("Calling updateUserProfileDocument with:", firestoreUpdateData);
            await updateUserProfileDocument(user.uid, firestoreUpdateData);
            console.log("Firestore profile updated via server action:", firestoreUpdateData);

            // Optimistically update local state for immediate feedback
            setProfileData(prev => prev ? { ...prev, ...firestoreUpdateData } : null);
         }


        toast({ title: 'Profile updated successfully!' });
        setIsEditing(false); // Exit edit mode
        form.reset({ // Reset form with potentially new data
            displayName: firestoreUpdateData.displayName ?? profileData.displayName ?? user.displayName ?? '',
            photoURL: firestoreUpdateData.photoURL ?? profileData.photoURL ?? user.photoURL ?? '',
        });
        // Update preview to the final URL
        setPhotoPreview(firestoreUpdateData.photoURL !== undefined ? firestoreUpdateData.photoURL : (profileData?.photoURL ?? user?.photoURL ?? null));


     } catch (error: any) {
         console.error("Error during profile update onSubmit:", error);
         const errorMessage = error.message || 'Unknown error during profile update';
         console.error(`Detailed error: ${errorMessage}`);

         toast({
           title: 'Update Failed',
           description: `Could not update profile: ${errorMessage}`,
           variant: 'destructive',
         });
     } finally {
         setIsSaving(false);
     }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset form and preview to original state
    form.reset({
      displayName: profileData?.displayName || user?.displayName || '',
      photoURL: profileData?.photoURL || user?.photoURL || '',
    });
    setPhotoPreview(profileData?.photoURL ?? user?.photoURL ?? null);
  };

  // Handle loading states
  if (authLoading || loadingProfile) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-secondary p-4">
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader className="items-center">
            <Skeleton className="h-24 w-24 rounded-full mb-4" />
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
             <Skeleton className="h-10 w-full" />
             <Skeleton className="h-10 w-full" />
             <Skeleton className="h-10 w-full" />
          </CardContent>
          <CardFooter className="justify-end">
            <Skeleton className="h-10 w-24" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Handle case where user is not logged in (should ideally be handled by routing/middleware)
  if (!user || !profileData) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-secondary p-4">
        <Card className="w-full max-w-lg shadow-lg">
            <CardHeader>
                <CardTitle>Access Denied</CardTitle>
                 <CardDescription>Please log in to view your profile.</CardDescription>
            </CardHeader>
            {/* Optionally add a link to the login page */}
        </Card>
      </div>
    );
  }

  // Safely format timestamp
  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      try {
        return format(timestamp.toDate(), 'PPP'); // e.g., Jun 15th, 2024
      } catch {
        return 'N/A';
      }
    }
    return 'N/A';
  };


  return (
    <div className="flex justify-center items-start min-h-screen bg-secondary p-4 sm:p-6 md:p-10 pt-10">
      <Card className="w-full max-w-2xl shadow-xl rounded-lg overflow-hidden">
         <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader className="items-center text-center bg-card p-6 border-b">
                 {/* Avatar (shows current or preview) */}
                 <div className="relative mb-4">
                    <Avatar className="h-28 w-28 border-4 border-background shadow-md">
                         {/* Use photoPreview for instant feedback */}
                        <AvatarImage src={photoPreview || undefined} alt="Profile Picture" data-ai-hint="user profile picture" />
                        <AvatarFallback className="text-4xl bg-muted">
                            {getInitials(isEditing ? form.watch('displayName') : profileData.displayName)}
                        </AvatarFallback>
                    </Avatar>
                    {/* Icon indicates photo URL field in edit mode */}
                    {isEditing && (
                        <div className="absolute bottom-0 right-0 rounded-full bg-background border shadow-sm h-9 w-9 flex items-center justify-center">
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                    )}
                 </div>

                {/* Display Name */}
                {isEditing ? (
                    <div className="w-full max-w-xs space-y-1">
                        <Label htmlFor="displayName" className="sr-only">Display Name</Label>
                        <Input
                            id="displayName"
                            className="text-center text-2xl font-semibold border-dashed"
                            placeholder="Your Display Name"
                            {...form.register('displayName')}
                            disabled={isSaving}
                        />
                         {form.formState.errors.displayName && (
                            <p className="text-sm text-destructive">{form.formState.errors.displayName.message}</p>
                         )}
                    </div>
                ) : (
                    <CardTitle className="text-2xl font-semibold">{profileData.displayName || 'User'}</CardTitle>
                )}
                 {/* Email */}
                <CardDescription className="text-base text-muted-foreground flex items-center gap-1.5 mt-1">
                     <Mail className="h-4 w-4 opacity-80"/>
                     {profileData.email || 'No email provided'}
                </CardDescription>
                 {/* Joined Date */}
                 <CardDescription className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                    <CalendarDays className="h-4 w-4 opacity-80"/>
                     Joined: {formatDate(profileData.createdAt)}
                 </CardDescription>

            </CardHeader>

            <CardContent className="p-6 space-y-5">
                 {/* Photo URL Input Field (Only in Edit Mode) */}
                 {isEditing && (
                     <div className="space-y-2">
                         <Label htmlFor="photoURL">Profile Picture URL</Label>
                         <Input
                            id="photoURL"
                            type="url"
                            placeholder="https://example.com/your-photo.jpg"
                            {...form.register('photoURL')}
                            disabled={isSaving}
                         />
                         {form.formState.errors.photoURL && (
                            <p className="text-sm text-destructive">{form.formState.errors.photoURL.message}</p>
                         )}
                         <p className="text-xs text-muted-foreground">Enter the URL of your desired profile image. Leave blank to remove.</p>
                     </div>
                 )}


                 <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                     <div className="flex items-center gap-3">
                         <User className="h-5 w-5 text-muted-foreground" />
                         <span className="text-sm font-medium text-foreground">User ID</span>
                     </div>
                     <span className="text-sm text-muted-foreground font-mono select-all">{profileData.uid}</span>
                 </div>


            </CardContent>

            <CardFooter className="bg-muted/30 p-4 border-t flex justify-end gap-3">
                {isEditing ? (
                    <>
                        <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
                             Cancel
                        </Button>
                        <Button type="submit" disabled={isSaving || !form.formState.isDirty}>
                             {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                             Save Changes
                        </Button>
                    </>
                ) : (
                    <Button type="button" onClick={() => setIsEditing(true)}>
                         <Edit className="mr-2 h-4 w-4" /> Edit Profile
                    </Button>
                )}
            </CardFooter>
         </form>
      </Card>
    </div>
  );
}

