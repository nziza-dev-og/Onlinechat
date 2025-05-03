
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db, auth as clientAuth } from '@/lib/firebase'; // Keep db import for profile fetching, import clientAuth for password update
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
import { updateProfile as updateAuthProfile, updatePassword as updateAuthPassword } from 'firebase/auth'; // Rename to avoid conflict
import { updateUserProfileDocument, requestPasswordChange, checkPasswordChangeApproval, resetPasswordChangeApproval } from '@/lib/user-profile.service'; // Import relevant services
import { Edit, Save, User, Mail, CalendarDays, Loader2, Image as ImageIcon, KeyRound, Send, Lock } from 'lucide-react'; // Added KeyRound, Send, Lock
import { format } from 'date-fns'; // For formatting dates
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
} from "@/components/ui/alert-dialog";

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

// Validation schema for the new password form
const passwordSchema = z.object({
    newPassword: z.string().min(6, { message: "Password must be at least 6 characters." }),
    confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"], // Error applies to the confirmation field
});


type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [profileData, setProfileData] = React.useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRequestingPasswordChange, setIsRequestingPasswordChange] = React.useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false);
  const [showPasswordForm, setShowPasswordForm] = React.useState(false);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const { toast } = useToast();

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      photoURL: '', // Initialize with empty string
    },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
        newPassword: '',
        confirmPassword: '',
    },
  });

  // Watch photoURL field for preview updates
  const watchedPhotoURL = profileForm.watch('photoURL');
  React.useEffect(() => {
    if (isEditing) {
      setPhotoPreview(watchedPhotoURL);
    }
  }, [watchedPhotoURL, isEditing]);


  // Fetch profile data and approval status from Firestore
  React.useEffect(() => {
    if (authLoading || !user) {
        // Reset states if user logs out or while auth is loading
        setProfileData(null);
        setLoadingProfile(authLoading); // Reflect auth loading state
        setIsEditing(false);
        setPhotoPreview(null);
        setShowPasswordForm(false);
        return;
    }

    setLoadingProfile(true);
    const fetchProfileAndStatus = async () => {
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
          profileForm.reset({
             displayName: data.displayName || '',
             photoURL: data.photoURL || '' // Pre-fill form with photoURL
            });
          setPhotoPreview(data.photoURL); // Set initial preview
          // Show password form only if approved
          setShowPasswordForm(data.passwordChangeApproved ?? false);
        } else {
          console.log("No such profile document! Using auth data as fallback.");
          // Use auth data as fallback
           const fallbackData = {
               uid: user.uid,
               email: user.email,
               displayName: user.displayName,
               photoURL: user.photoURL,
               passwordChangeApproved: false, // Assume false if no profile
               passwordChangeRequested: false,
           };
           setProfileData(fallbackData);
           profileForm.reset({
                displayName: fallbackData.displayName || '',
                photoURL: fallbackData.photoURL || ''
            });
           setPhotoPreview(fallbackData.photoURL);
           setShowPasswordForm(false);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast({
          title: "Error",
          description: "Could not load profile data.",
          variant: "destructive",
        });
        // Set minimal data from auth as fallback on error
        const fallbackData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            passwordChangeApproved: false,
            passwordChangeRequested: false,
        };
        setProfileData(fallbackData);
        profileForm.reset({
            displayName: fallbackData.displayName || '',
            photoURL: fallbackData.photoURL || ''
        });
        setPhotoPreview(fallbackData.photoURL);
        setShowPasswordForm(false);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchProfileAndStatus();
  }, [user, authLoading, toast, profileForm]);


  // Handle profile update submission (displayName, photoURL)
  const onProfileSubmit = async (data: ProfileFormData) => {
     if (!user || !profileData) return; // Should not happen if button is enabled

     setIsSaving(true);
     const newPhotoURL = data.photoURL === '' ? null : data.photoURL;
     const newDisplayName = data.displayName?.trim() || null;

     try {
         const authUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
         if (newDisplayName !== (profileData.displayName ?? user.displayName)) {
            authUpdateData.displayName = newDisplayName;
         }
         if (newPhotoURL !== (profileData.photoURL ?? user.photoURL)) {
             authUpdateData.photoURL = newPhotoURL;
         }

         if (Object.keys(authUpdateData).length > 0) {
            await updateAuthProfile(user, authUpdateData);
             console.log("Firebase Auth profile updated:", authUpdateData);
         }

        const firestoreUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
         if ('displayName' in authUpdateData) {
             firestoreUpdateData.displayName = authUpdateData.displayName;
         }
         if ('photoURL' in authUpdateData) {
             firestoreUpdateData.photoURL = authUpdateData.photoURL;
         }

         if (Object.keys(firestoreUpdateData).length > 0) {
            console.log("Calling updateUserProfileDocument with:", firestoreUpdateData);
            await updateUserProfileDocument(user.uid, firestoreUpdateData);
            console.log("Firestore profile updated via server action:", firestoreUpdateData);
            setProfileData(prev => prev ? { ...prev, ...firestoreUpdateData } : null);
         }

        toast({ title: 'Profile updated successfully!' });
        setIsEditing(false); // Exit edit mode
        profileForm.reset({ // Reset form with potentially new data
            displayName: firestoreUpdateData.displayName ?? profileData.displayName ?? user.displayName ?? '',
            photoURL: firestoreUpdateData.photoURL ?? profileData.photoURL ?? user.photoURL ?? '',
        });
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

   // Handle request password change
   const handleRequestPasswordChange = async () => {
     if (!user) return;
     setIsRequestingPasswordChange(true);
     try {
         await requestPasswordChange(user.uid);
         setProfileData(prev => prev ? { ...prev, passwordChangeRequested: true } : null); // Optimistic update
         toast({
             title: 'Request Sent',
             description: 'Your request to change password has been sent to the admin for approval.',
         });
     } catch (error: any) {
         toast({
             title: 'Request Failed',
             description: error.message || 'Could not send password change request.',
             variant: 'destructive',
         });
     } finally {
         setIsRequestingPasswordChange(false);
     }
   };

   // Handle password update submission
   const onPasswordSubmit = async (data: PasswordFormData) => {
        if (!user || !clientAuth || !profileData?.passwordChangeApproved) return; // Ensure user exists, auth is available, and change is approved

        setIsUpdatingPassword(true);
        try {
            // Update Firebase Authentication password
            const currentUser = clientAuth.currentUser;
            if (!currentUser) throw new Error("Current user not found in auth state.");
            await updateAuthPassword(currentUser, data.newPassword);

            // Reset the approval flag in Firestore
            await resetPasswordChangeApproval(user.uid);

             // Optimistically update local state
            setProfileData(prev => prev ? { ...prev, passwordChangeApproved: false } : null);
            setShowPasswordForm(false); // Hide form after success
            passwordForm.reset(); // Clear password fields

            toast({ title: 'Password Updated Successfully!' });

        } catch (error: any) {
            console.error("Error updating password:", error);
            let description = "Could not update password. Please try again.";
            if (error.code === 'auth/requires-recent-login') {
                 description = "This operation is sensitive and requires recent authentication. Please log out and log back in before changing your password.";
            } else if (error.code === 'auth/weak-password') {
                 description = "Password is too weak. Please choose a stronger password.";
            } else {
                 description = error.message || description;
            }
            toast({
                 title: 'Password Update Failed',
                 description: description,
                 variant: 'destructive',
            });
        } finally {
            setIsUpdatingPassword(false);
        }
   };


  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset form and preview to original state
    profileForm.reset({
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

  // Handle case where user is not logged in
  if (!user || !profileData) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-secondary p-4">
        <Card className="w-full max-w-lg shadow-lg">
            <CardHeader>
                <CardTitle>Access Denied</CardTitle>
                 <CardDescription>Please log in to view your profile.</CardDescription>
            </CardHeader>
        </Card>
      </div>
    );
  }

  // Safely format timestamp
  const formatDate = (timestamp: Timestamp | Date | undefined): string => {
    if (!timestamp) return 'N/A';
    let date: Date | null = null;
    try {
        if (timestamp instanceof Date) {
            date = timestamp;
        } else if (timestamp && typeof (timestamp as Timestamp).toDate === 'function') { // Check if it's a Firestore Timestamp
            date = (timestamp as Timestamp).toDate();
        }

        if (date && !isNaN(date.getTime())) {
            return format(date, 'PPP'); // e.g., Jun 15th, 2024
        } else {
             console.warn("Could not parse timestamp for formatting:", timestamp);
             return 'Invalid date';
        }
    } catch (error) {
        console.error("Error formatting date:", error, timestamp);
        return 'Invalid date';
    }
};


  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-secondary p-4 sm:p-6 md:p-10 pt-10 space-y-6">
      {/* Profile Edit Card */}
      <Card className="w-full max-w-2xl shadow-xl rounded-lg overflow-hidden">
         {/* Using a div instead of form here to avoid nesting */}
         <div>
            <CardHeader className="items-center text-center bg-card p-6 border-b">
                 {/* Avatar */}
                 <div className="relative mb-4">
                    <Avatar className="h-28 w-28 border-4 border-background shadow-md">
                        <AvatarImage src={photoPreview || undefined} alt="Profile Picture" data-ai-hint="user profile picture" />
                        <AvatarFallback className="text-4xl bg-muted">
                            {getInitials(isEditing ? profileForm.watch('displayName') : profileData.displayName)}
                        </AvatarFallback>
                    </Avatar>
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
                            {...profileForm.register('displayName')}
                            disabled={isSaving}
                        />
                         {profileForm.formState.errors.displayName && (
                            <p className="text-sm text-destructive">{profileForm.formState.errors.displayName.message}</p>
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
                            {...profileForm.register('photoURL')}
                            disabled={isSaving}
                         />
                         {profileForm.formState.errors.photoURL && (
                            <p className="text-sm text-destructive">{profileForm.formState.errors.photoURL.message}</p>
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

                  {/* Moved Password Change Section OUTSIDE the main profile form's CardContent */}

            </CardContent>

            <CardFooter className="bg-muted/30 p-4 border-t flex justify-end gap-3">
                {isEditing ? (
                    <>
                        <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
                             Cancel
                        </Button>
                        {/* Trigger the form submission handler */}
                        <Button type="button" onClick={profileForm.handleSubmit(onProfileSubmit)} disabled={isSaving || !profileForm.formState.isDirty}>
                             {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                             Save Changes
                        </Button>
                    </>
                ) : (
                    <Button type="button" onClick={() => setIsEditing(true)} disabled={showPasswordForm}>
                         <Edit className="mr-2 h-4 w-4" /> Edit Profile
                    </Button>
                )}
            </CardFooter>
         </div> {/* End of div replacing form */}
      </Card>

       {/* Password Change Card (Separate Card and Form) */}
       <Card className="w-full max-w-2xl shadow-xl rounded-lg overflow-hidden">
          <CardHeader className="bg-card p-6 border-b">
             <h3 className="text-lg font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary"/> Change Password</h3>
          </CardHeader>
           <CardContent className="p-6 space-y-3">
               {profileData.passwordChangeRequested && (
                   <p className="text-sm text-primary flex items-center gap-1"><Loader2 className="h-4 w-4 animate-spin"/> Your request is pending admin approval.</p>
               )}
               {showPasswordForm && profileData.passwordChangeApproved && (
                   <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 pt-2">
                       <p className="text-sm text-green-600">Your password change request has been approved. Set your new password below.</p>
                       <div className="space-y-2">
                           <Label htmlFor="newPassword">New Password</Label>
                           <Input
                               id="newPassword"
                               type="password"
                               placeholder="Enter new password (min. 6 chars)"
                               {...passwordForm.register('newPassword')}
                               disabled={isUpdatingPassword}
                           />
                           {passwordForm.formState.errors.newPassword && (
                               <p className="text-sm text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
                           )}
                       </div>
                       <div className="space-y-2">
                           <Label htmlFor="confirmPassword">Confirm New Password</Label>
                           <Input
                               id="confirmPassword"
                               type="password"
                               placeholder="Confirm new password"
                               {...passwordForm.register('confirmPassword')}
                               disabled={isUpdatingPassword}
                           />
                           {passwordForm.formState.errors.confirmPassword && (
                               <p className="text-sm text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
                           )}
                       </div>
                       <Button type="submit" disabled={isUpdatingPassword || !passwordForm.formState.isValid}>
                           {isUpdatingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                           Update Password
                       </Button>
                   </form>
               )}
               {!profileData.passwordChangeRequested && !showPasswordForm && (
                   <Button
                       type="button"
                       variant="outline"
                       onClick={handleRequestPasswordChange}
                       disabled={isRequestingPasswordChange}
                   >
                       {isRequestingPasswordChange ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                       Request Password Change
                   </Button>
               )}
           </CardContent>
       </Card>

    </div>
  );
}
