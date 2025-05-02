
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db, storage } from '@/lib/firebase'; // Import storage
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import type { UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { updateProfile as updateAuthProfile } from 'firebase/auth'; // Rename to avoid conflict
import { updateUserProfileDocument } from '@/lib/user-profile.service'; // Import the service
import { Edit, Save, User, Mail, CalendarDays, Camera, Loader2 } from 'lucide-react';
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

// Validation schema for the edit form
const profileSchema = z.object({
  displayName: z.string().min(1, { message: "Display name cannot be empty." }).max(50, { message: "Display name too long." }).optional(),
  photoFile: z.instanceof(File).optional().nullable(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

// Upload photo helper (similar to auth-form, could be moved to service)
const uploadPhoto = async (file: File, uid: string): Promise<string | null> => {
    if (!file) return null;
    const toast = useToast().toast; // Get toast inside async function context if needed

    // Use a consistent file name or a unique ID for the profile picture
    const fileName = `profile_${uid}_${Date.now()}.${file.name.split('.').pop()}`; // Add timestamp for uniqueness
    const storageRef = ref(storage, `profilePictures/${uid}/${fileName}`);

    try {
       const reader = new FileReader();
       const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(reader.error || new Error("FileReader error"));
            reader.readAsDataURL(file);
       });

      console.log(`Uploading photo for user ${uid} to ${storageRef.fullPath}...`);
      const snapshot = await uploadString(storageRef, dataUrl, 'data_url');
      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log(`Photo uploaded successfully: ${downloadURL}`);
      return downloadURL;
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      toast({
        title: "Photo Upload Failed",
        description: `Could not upload profile picture: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
      return null;
    }
  };


export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [profileData, setProfileData] = React.useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      photoFile: null,
    },
  });

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
      const userDocRef = doc(db, 'users', user.uid);
      try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          setProfileData(data);
          form.reset({ displayName: data.displayName || '' }); // Pre-fill form
          setPhotoPreview(data.photoURL); // Set initial preview
        } else {
          console.log("No such profile document!");
          // Maybe create a default profile doc here if needed?
          // For now, use auth data as fallback
           setProfileData({
               uid: user.uid,
               email: user.email,
               displayName: user.displayName,
               photoURL: user.photoURL,
               // createdAt and lastSeen might be missing if doc doesn't exist
           });
           form.reset({ displayName: user.displayName || '' });
           setPhotoPreview(user.photoURL);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast({
          title: "Error",
          description: "Could not load profile data.",
          variant: "destructive",
        });
        // Set minimal data from auth as fallback on error
        setProfileData({ uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL });
        form.reset({ displayName: user.displayName || '' });
        setPhotoPreview(user.photoURL);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchProfile();
  }, [user, authLoading, toast, form]); // form added to dependency array

  // Handle file input change
   const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
          toast({ title: "File Too Large", description: "Image must be smaller than 5MB.", variant: "destructive" });
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
      }
       if (!file.type.startsWith('image/')) {
            toast({ title: "Invalid File Type", description: "Please select an image (JPG, PNG, GIF).", variant: "destructive" });
            if (fileInputRef.current) fileInputRef.current.value = "";
             return;
        }

      form.setValue('photoFile', file, { shouldValidate: true });
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
       form.setValue('photoFile', null, { shouldValidate: true });
       // Revert preview to original photoURL if file is removed
       setPhotoPreview(profileData?.photoURL ?? user?.photoURL ?? null);
    }
  };

  // Handle profile update submission
  const onSubmit = async (data: ProfileFormData) => {
     if (!user || !profileData) return; // Should not happen if button is enabled

     setIsSaving(true);
     let newPhotoURL: string | null | undefined = undefined; // undefined means no change requested

     try {
        // 1. Upload new photo if provided
        if (data.photoFile) {
            newPhotoURL = await uploadPhoto(data.photoFile, user.uid);
             if (newPhotoURL === null) {
                 // Upload failed, toast shown in uploadPhoto, stop saving
                 setIsSaving(false);
                 return;
             }
        }

        // 2. Prepare update data for Firebase Auth
         const authUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
         // Only include fields if they actually changed
         const newDisplayName = data.displayName?.trim(); // Trim whitespace
         if (newDisplayName !== undefined && newDisplayName !== (profileData.displayName ?? user.displayName)) {
            authUpdateData.displayName = newDisplayName || null; // Use null if empty string after trim
         }
         if (newPhotoURL !== undefined && newPhotoURL !== (profileData.photoURL ?? user.photoURL)) {
             authUpdateData.photoURL = newPhotoURL;
         }


         // 3. Update Auth profile if necessary
         if (Object.keys(authUpdateData).length > 0) {
            await updateAuthProfile(user, authUpdateData);
             console.log("Firebase Auth profile updated:", authUpdateData);
         }

        // 4. Update Firestore document
        // Pass only changed values to the service function
        const firestoreUpdateData: Partial<UserProfile> = {};
         if ('displayName' in authUpdateData) {
             firestoreUpdateData.displayName = authUpdateData.displayName;
         }
         if ('photoURL' in authUpdateData) {
             firestoreUpdateData.photoURL = authUpdateData.photoURL;
         }

         if (Object.keys(firestoreUpdateData).length > 0) {
            await updateUserProfileDocument(user.uid, firestoreUpdateData);
            console.log("Firestore profile updated:", firestoreUpdateData);

            // Optimistically update local state for immediate feedback
            setProfileData(prev => prev ? { ...prev, ...firestoreUpdateData } : null);
         }


        toast({ title: 'Profile updated successfully!' });
        setIsEditing(false); // Exit edit mode
        form.reset({ // Reset form with potentially new data
            displayName: firestoreUpdateData.displayName ?? profileData.displayName ?? user.displayName ?? '',
            photoFile: null // Clear file input state
        });
        // Clear visual file input
        if (fileInputRef.current) fileInputRef.current.value = "";
        // Update preview to the final URL (could be new or existing)
        setPhotoPreview(firestoreUpdateData.photoURL !== undefined ? firestoreUpdateData.photoURL : (profileData?.photoURL ?? user?.photoURL ?? null));


     } catch (error: any) {
         console.error("Error updating profile:", error);
         toast({
           title: 'Update Failed',
           description: `Could not update profile: ${error.message || 'Unknown error'}`,
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
      photoFile: null
    });
    setPhotoPreview(profileData?.photoURL ?? user?.photoURL ?? null);
    if (fileInputRef.current) fileInputRef.current.value = ""; // Clear file input
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
                 {/* Avatar and Edit */}
                 <div className="relative mb-4">
                    <Avatar className="h-28 w-28 border-4 border-background shadow-md">
                         {/* Use photoPreview for instant feedback */}
                        <AvatarImage src={photoPreview || undefined} alt="Profile Picture" data-ai-hint="user profile picture" />
                        <AvatarFallback className="text-4xl bg-muted">
                            {getInitials(isEditing ? form.watch('displayName') : profileData.displayName)}
                        </AvatarFallback>
                    </Avatar>
                    {/* Edit button for photo */}
                    {isEditing && (
                        <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="absolute bottom-0 right-0 rounded-full bg-background hover:bg-muted border shadow-sm h-9 w-9"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSaving}
                            aria-label="Change profile picture"
                        >
                            <Camera className="h-5 w-5" />
                        </Button>
                    )}
                 </div>
                 {/* Hidden file input */}
                 <Input
                    id="photo-upload-profile"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    disabled={!isEditing || isSaving}
                 />

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
                 {/* Simple placeholder for additional profile info */}
                 {/* <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">About Me</Label>
                    {isEditing ? (
                        <Textarea placeholder="Tell us a bit about yourself..." disabled={isSaving} />
                    ) : (
                        <p className="text-foreground leading-relaxed">{profileData.bio || "No bio yet."}</p>
                    )}
                 </div> */}

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
                        <Button type="submit" disabled={isSaving || !form.formState.isValid}>
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