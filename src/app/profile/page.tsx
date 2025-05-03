
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db, auth as clientAuth, storage } from '@/lib/firebase'; // Import storage
import { doc, getDoc, Timestamp, updateDoc as updateFirestoreDoc } from 'firebase/firestore'; // Rename updateDoc to avoid conflict
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
import { updateProfile as updateAuthProfile, updatePassword as updateAuthPassword } from 'firebase/auth';
import { updateUserProfileDocument, requestPasswordChange, resetPasswordChangeApproval, checkPasswordChangeApproval } from '@/lib/user-profile.service';
import { Edit, Save, User, Mail, CalendarDays, Loader2, Image as ImageIcon, KeyRound, Send, Lock, Upload } from 'lucide-react'; // Added Upload
import { format } from 'date-fns';
import { ref, uploadBytesResumable, getDownloadURL, type UploadTaskSnapshot, type StorageError } from 'firebase/storage'; // Import storage functions
import { Progress } from '@/components/ui/progress'; // Import Progress
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

// Validation schema for the edit form, including photoURL
const profileSchema = z.object({
  displayName: z.string().min(1, { message: "Display name cannot be empty." }).max(50, { message: "Display name too long." }).optional(),
  // Allow empty string, null, or a valid URL for photoURL
  photoURL: z.string().url({ message: "Please enter a valid URL." }).max(1024, { message: "URL is too long." }).or(z.literal('')).optional().nullable(),
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
  const [photoFile, setPhotoFile] = React.useState<File | null>(null); // State for selected file
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null); // Upload progress
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null); // Ref for file input

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

   // Watch photoURL field and photoFile for preview updates
   const watchedPhotoURL = profileForm.watch('photoURL');
   React.useEffect(() => {
     if (isEditing) {
       if (photoFile) {
         // Create temporary URL for file preview
         const reader = new FileReader();
         reader.onloadend = () => {
           setPhotoPreview(reader.result as string);
         };
         reader.readAsDataURL(photoFile);
       } else {
         // Use the URL field if no file is selected
         setPhotoPreview(watchedPhotoURL || profileData?.photoURL || null); // Fallback to original if URL field is empty
       }
     } else {
       // When not editing, show the saved profile picture
       setPhotoPreview(profileData?.photoURL || null);
     }
   }, [watchedPhotoURL, photoFile, isEditing, profileData?.photoURL]);


  // Fetch profile data and approval status from Firestore
  React.useEffect(() => {
    if (authLoading || !user) {
        setProfileData(null);
        setLoadingProfile(authLoading);
        setIsEditing(false);
        setPhotoPreview(null);
        setShowPasswordForm(false);
        setPhotoFile(null);
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
             photoURL: data.photoURL || '' // Pre-fill URL field
            });
          setPhotoPreview(data.photoURL); // Set initial preview (from Firestore)
          setShowPasswordForm(data.passwordChangeApproved ?? false);
        } else {
          console.log("No such profile document! Using auth data as fallback.");
           const fallbackData = { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL, passwordChangeApproved: false, passwordChangeRequested: false };
           setProfileData(fallbackData);
           profileForm.reset({ displayName: fallbackData.displayName || '', photoURL: fallbackData.photoURL || '' });
           setPhotoPreview(fallbackData.photoURL);
           setShowPasswordForm(false);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast({ title: "Error", description: "Could not load profile data.", variant: "destructive" });
        const fallbackData = { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL, passwordChangeApproved: false, passwordChangeRequested: false };
        setProfileData(fallbackData);
        profileForm.reset({ displayName: fallbackData.displayName || '', photoURL: fallbackData.photoURL || '' });
        setPhotoPreview(fallbackData.photoURL);
        setShowPasswordForm(false);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchProfileAndStatus();
  }, [user, authLoading, toast, profileForm]);


  // Handle file selection
   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                toast({ title: "File Too Large", description: "Please select an image under 5MB.", variant: "destructive" });
                return;
            }
            if (!file.type.startsWith('image/')) {
                 toast({ title: "Invalid File Type", description: "Please select an image file (e.g., JPG, PNG, GIF).", variant: "destructive" });
                 return;
            }
            setPhotoFile(file);
            profileForm.setValue('photoURL', '', { shouldDirty: true }); // Clear URL field when file is selected
            console.log("Photo file selected:", file.name);
        }
         // Reset file input value so the same file can be selected again if needed
         if (e.target) {
           e.target.value = '';
         }
    };

   // Trigger hidden file input click
   const handleUploadButtonClick = () => {
      fileInputRef.current?.click();
   };


   // Function to upload photo and return URL
   const uploadPhoto = (file: File, uid: string): Promise<string> => {
       return new Promise((resolve, reject) => {
           if (!storage) {
               reject(new Error("Firebase Storage not initialized."));
               return;
           }
           const timestamp = Date.now();
           const fileExtension = file.name.split('.').pop();
           const filePath = `profilePictures/${uid}_${timestamp}.${fileExtension}`;
           const storageRef = ref(storage, filePath);
           const uploadTask = uploadBytesResumable(storageRef, file);

           uploadTask.on('state_changed',
               (snapshot: UploadTaskSnapshot) => {
                   const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                   setUploadProgress(progress);
               },
               (error: StorageError) => {
                   console.error("Upload failed:", error);
                   setUploadProgress(null);
                   reject(new Error(`Upload failed: ${error.message}`));
               },
               async () => {
                   try {
                       const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                       console.log('File available at', downloadURL);
                       setUploadProgress(100); // Indicate completion
                        // Reset progress after a short delay
                       setTimeout(() => setUploadProgress(null), 1500);
                       resolve(downloadURL);
                   } catch (getUrlError: any) {
                        console.error("Failed to get download URL:", getUrlError);
                        setUploadProgress(null);
                        reject(new Error(`Failed to get download URL: ${getUrlError.message}`));
                   }
               }
           );
       });
   };



  // Handle profile update submission (displayName, photoURL via upload or URL)
  const onProfileSubmit = async (data: ProfileFormData) => {
     if (!user || !profileData) return;

     setIsSaving(true);
     setUploadProgress(null); // Reset progress before potentially starting a new upload

     let finalPhotoURL: string | null = profileData.photoURL || user.photoURL || null; // Start with current photo

     try {
         // 1. Upload new photo if selected
         if (photoFile) {
            console.log("Uploading new photo file...");
            finalPhotoURL = await uploadPhoto(photoFile, user.uid);
         } else if (data.photoURL !== undefined && data.photoURL !== (profileData.photoURL || user.photoURL)) {
            // 2. Use photoURL from form if it changed and no file was uploaded
            console.log("Using new photo URL from input...");
            finalPhotoURL = data.photoURL === '' ? null : data.photoURL; // Handle clearing the URL
         }

         const newDisplayName = data.displayName?.trim() || null;

         // 3. Prepare data for Auth and Firestore update
         const authUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
         const firestoreUpdateData: UserProfileUpdateData = {}; // Use the stricter type

         if (newDisplayName !== (profileData.displayName ?? user.displayName)) {
            authUpdateData.displayName = newDisplayName;
            firestoreUpdateData.displayName = newDisplayName; // This is allowed in UserProfileUpdateData
         }
         if (finalPhotoURL !== (profileData.photoURL ?? user.photoURL)) {
             authUpdateData.photoURL = finalPhotoURL;
             firestoreUpdateData.photoURL = finalPhotoURL; // This is allowed in UserProfileUpdateData
         }

         // 4. Update Firebase Auth Profile (Client-Side)
         if (Object.keys(authUpdateData).length > 0) {
            await updateAuthProfile(user, authUpdateData);
             console.log("Firebase Auth profile updated:", authUpdateData);
         }

         // 5. Update Firestore Profile Document (Server-Side via service)
         if (Object.keys(firestoreUpdateData).length > 0) {
            console.log("Calling updateUserProfileDocument with:", firestoreUpdateData);
            // Use the imported function which runs as a server action
            await updateUserProfileDocument(user.uid, firestoreUpdateData);
            console.log("Firestore profile updated via server action:", firestoreUpdateData);
            // Update local state optimistically/after success
            setProfileData(prev => prev ? { ...prev, ...firestoreUpdateData } : null);
         }

        toast({ title: 'Profile updated successfully!' });
        setIsEditing(false); // Exit edit mode
        setPhotoFile(null); // Clear selected file
        // Reset form to reflect the saved state
        profileForm.reset({
            displayName: newDisplayName ?? profileData.displayName ?? user.displayName ?? '',
            photoURL: finalPhotoURL ?? '', // Reset URL field with the final URL or empty string
        });
        // Preview should update automatically via useEffect watching profileData

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
         setUploadProgress(null); // Ensure progress is cleared on finish/error
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
            const currentUser = clientAuth.currentUser;
            if (!currentUser) throw new Error("Current user not found in auth state.");
            await updateAuthPassword(currentUser, data.newPassword);
            await resetPasswordChangeApproval(user.uid);

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
            toast({ title: 'Password Update Failed', description: description, variant: 'destructive' });
        } finally {
            setIsUpdatingPassword(false);
        }
   };


  const handleCancelEdit = () => {
    setIsEditing(false);
    setPhotoFile(null); // Clear any selected file
    setUploadProgress(null); // Clear progress
    // Reset form and preview to original Firestore state
    profileForm.reset({
      displayName: profileData?.displayName || user?.displayName || '',
      photoURL: profileData?.photoURL || user?.photoURL || '',
    });
    // Preview will be updated by the useEffect watching profileData/isEditing
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
        if (timestamp instanceof Date) date = timestamp;
        else if (timestamp && typeof (timestamp as Timestamp).toDate === 'function') date = (timestamp as Timestamp).toDate();
        if (date && !isNaN(date.getTime())) return format(date, 'PPP');
        else return 'Invalid date';
    } catch (error) {
        console.error("Error formatting date:", error, timestamp);
        return 'Invalid date';
    }
};


  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-secondary p-4 sm:p-6 md:p-10 pt-10 space-y-6">
      {/* Profile Edit Card */}
      {/* Adjusted max-width for better responsiveness */}
      <Card className="w-full max-w-xl shadow-xl rounded-lg overflow-hidden">
         {/* Using a div instead of form here to avoid nesting */}
         <div>
            <CardHeader className="items-center text-center bg-card p-6 border-b">
                 {/* Avatar */}
                 <div className="relative mb-4 group/avatar"> {/* Added group for hover effect */}
                    <Avatar className="h-28 w-28 border-4 border-background shadow-md">
                        <AvatarImage src={photoPreview || undefined} alt="Profile Picture" data-ai-hint="user profile picture" />
                        <AvatarFallback className="text-4xl bg-muted">
                            {getInitials(isEditing ? profileForm.watch('displayName') : profileData.displayName)}
                        </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                        <>
                           {/* Overlay Button */}
                           <button
                             type="button"
                             onClick={handleUploadButtonClick}
                             className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200 cursor-pointer"
                             aria-label="Change profile picture"
                             disabled={isSaving}
                           >
                             <Upload className="h-8 w-8 text-white/80" />
                           </button>
                           {/* Hidden File Input */}
                           <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileChange}
                              accept="image/png, image/jpeg, image/gif, image/webp" // Specify acceptable image types
                              className="hidden"
                              aria-hidden="true"
                              disabled={isSaving}
                           />
                        </>
                    )}
                 </div>

                 {/* Upload Progress */}
                {isEditing && uploadProgress !== null && (
                    <div className="w-3/4 max-w-xs mx-auto mt-2 mb-1">
                         <Progress value={uploadProgress} className="h-2" />
                         <p className="text-xs text-muted-foreground text-center mt-1">{uploadProgress < 100 ? `Uploading... ${Math.round(uploadProgress)}%` : 'Upload complete!'}</p>
                    </div>
                )}


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
                 {/* Photo Upload/URL Input Fields (Only in Edit Mode) */}
                 {isEditing && (
                     <div className="space-y-4">
                         {/* File Upload Button (triggers hidden input) */}
                         <div className="space-y-2">
                             <Label>Upload New Photo</Label>
                             <div className="flex items-center gap-2">
                                <Button
                                   type="button"
                                   variant="outline"
                                   onClick={handleUploadButtonClick}
                                   disabled={isSaving}
                                >
                                   <Upload className="mr-2 h-4 w-4" /> Choose File
                                </Button>
                                {photoFile && <span className="text-sm text-muted-foreground truncate">{photoFile.name}</span>}
                             </div>
                             {!photoFile && !profileForm.getValues('photoURL') && <p className="text-xs text-muted-foreground">Or enter an image URL below.</p>}
                              {photoFile && <p className="text-xs text-muted-foreground">Selected: {photoFile.name}</p>}
                         </div>

                         <div className="text-center text-xs text-muted-foreground">OR</div>

                         {/* URL Input */}
                         <div className="space-y-2">
                             <Label htmlFor="photoURL">Set Photo by URL</Label>
                             <Input
                                id="photoURL"
                                type="url"
                                placeholder="https://example.com/your-photo.jpg"
                                {...profileForm.register('photoURL')}
                                disabled={isSaving || !!photoFile} // Disable if file is selected
                             />
                             {profileForm.formState.errors.photoURL && (
                                <p className="text-sm text-destructive">{profileForm.formState.errors.photoURL.message}</p>
                             )}
                             <p className="text-xs text-muted-foreground">Enter the URL of your desired profile image. Leave blank or clear to remove current photo (if no file is uploaded).</p>
                         </div>
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


            <CardFooter className="bg-muted/30 p-4 border-t flex flex-col sm:flex-row justify-end gap-3"> {/* Responsive footer */}
                {isEditing ? (
                    <>
                        <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
                             Cancel
                        </Button>
                        <Button type="button" onClick={profileForm.handleSubmit(onProfileSubmit)} disabled={isSaving || (!profileForm.formState.isDirty && !photoFile)}>
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
       {/* Adjusted max-width */}
       <Card className="w-full max-w-xl shadow-xl rounded-lg overflow-hidden">
          <CardHeader className="bg-card p-6 border-b">
             <h3 className="text-lg font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary"/> Change Password</h3>
          </CardHeader>
           <CardContent className="p-6 space-y-3">
               {profileData.passwordChangeRequested && !profileData.passwordChangeApproved && (
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
                       disabled={isRequestingPasswordChange || isEditing}
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

