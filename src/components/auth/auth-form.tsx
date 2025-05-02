
"use client";

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  AuthError, // Import AuthError for better type checking
  UserCredential, // Import UserCredential
  updateProfile, // Import updateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'; // Import Firestore functions
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, Chrome, ImagePlus, Upload } from 'lucide-react'; // Use Chrome icon for Google, ImagePlus/Upload for profile pic
import type { UserProfile } from '@/types'; // Import UserProfile type
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage"; // Firebase Storage
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Import Avatar components

// Extend schema for sign up to include optional display name and photo URL
const signUpSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  displayName: z.string().optional(),
  photoFile: z.instanceof(File).optional().nullable(), // Allow File or null/undefined
});

const signInSchema = z.object({
    email: z.string().email({ message: 'Invalid email address.' }),
    password: z.string().min(1, { message: 'Password is required.' }), // Can be min 1 for sign-in check
});


type SignUpFormData = z.infer<typeof signUpSchema>;
type SignInFormData = z.infer<typeof signInSchema>;

// Helper function to get a user-friendly error message
const getFirebaseAuthErrorMessage = (error: AuthError): string => {
  switch (error.code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'This email address is already in use.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a stronger password.';
    case 'auth/invalid-email':
      return 'Invalid email address format.';
    case 'auth/popup-closed-by-user':
        return 'Sign-in popup closed before completion. Please try again.';
    case 'auth/cancelled-popup-request':
        return 'Multiple sign-in attempts detected. Please close other popups and try again.';
    case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by the browser. Please allow popups for this site.';
    // Add more specific Firebase error codes as needed
    default:
      // Check for network errors specifically
      if (error.code === 'auth/network-request-failed') {
        return 'Network error. Please check your internet connection and try again.';
      }
      console.error("Unhandled Firebase Auth Error:", error.code, error.message); // Log unhandled errors
      return error.message || 'An unknown authentication error occurred.';
  }
};

// Function to update user profile in Firestore and Firebase Auth
const updateUserProfile = async (userCred: UserCredential, displayName?: string, photoURL?: string | null) => {
    const user = userCred.user;
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    // Check if it's a new user registration or sign-in based on metadata or Firestore doc existence
    // Using creationTime and lastSignInTime is more reliable than additionalUserInfo.isNewUser
    const isNewUser = user.metadata.creationTime === user.metadata.lastSignInTime;
    console.log("Is new user?", isNewUser, user.metadata.creationTime, user.metadata.lastSignInTime);


    // Prepare data for Firebase Auth update
    const authUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
    // Only update if new data is provided and different from existing user data
    if (displayName && displayName !== user.displayName) authUpdateData.displayName = displayName;
    if (photoURL !== undefined && photoURL !== user.photoURL) authUpdateData.photoURL = photoURL;

    // Prepare data for Firestore update/create
    const firestoreData: Partial<UserProfile> = {
        uid: user.uid,
        email: user.email, // Always include email
        // Use provided values or fallback to existing user data (important for Google sign-in merge)
        displayName: displayName ?? user.displayName ?? null,
        photoURL: photoURL !== undefined ? photoURL : user.photoURL ?? null,
        lastSeen: serverTimestamp(), // Update last seen on login/signup
    };
    // Only add createdAt for new users
    if (isNewUser) {
        firestoreData.createdAt = serverTimestamp();
    }


    try {
        // 1. Update Firebase Auth profile (if necessary)
        if (Object.keys(authUpdateData).length > 0) {
            await updateProfile(user, authUpdateData);
            console.log("Firebase Auth profile updated:", authUpdateData);
        }

        // 2. Create or update Firestore document
        // Use setDoc with merge: true to create or update.
        await setDoc(userRef, firestoreData, { merge: true });

        console.log("User profile updated/created in Firestore:", firestoreData);

    } catch (error) {
        console.error("Error updating user profile:", error);
        // Optionally handle Firestore/Auth update error (e.g., show a toast)
        // Consider if a partial update is acceptable or if rollback is needed
        throw new Error("Failed to update user profile."); // Re-throw to be caught by caller
    }
};

// Helper to get initials
const getInitials = (name: string | null | undefined): string => {
    if (!name) return '';
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '?'; // Fallback
};


export function AuthForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'signin' | 'signup'>('signin');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);


  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
      photoFile: null, // Initialize as null
    },
  });

  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Determine which form is active based on the tab
  const form = activeTab === 'signup' ? signUpForm : signInForm;
  const currentErrors = form.formState.errors;


  // Handle file selection and preview
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Basic validation (optional: add size/type checks here)
      if (file.size > 5 * 1024 * 1024) { // Example: 5MB limit
          toast({
            title: "File Too Large",
            description: "Please select an image smaller than 5MB.",
            variant: "destructive",
          });
          if (fileInputRef.current) fileInputRef.current.value = ""; // Clear input
          return;
      }
       if (!file.type.startsWith('image/')) {
             toast({
               title: "Invalid File Type",
               description: "Please select an image file (e.g., JPG, PNG, GIF).",
               variant: "destructive",
             });
            if (fileInputRef.current) fileInputRef.current.value = ""; // Clear input
             return;
        }

      signUpForm.setValue('photoFile', file, { shouldValidate: true }); // Set file in form state and validate
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
       signUpForm.setValue('photoFile', null, { shouldValidate: true }); // Set back to null
       setPhotoPreview(null);
    }
  };

   // Upload photo to Firebase Storage
   const uploadPhoto = async (file: File, uid: string): Promise<string | null> => {
    if (!file) return null; // No file provided

    const storage = getStorage();
    // Use a consistent file name or a unique ID for the profile picture
    const fileName = `profile_${uid}.${file.name.split('.').pop()}`; // e.g., profile_userId.png
    const storageRef = ref(storage, `profilePictures/${uid}/${fileName}`);

    try {
      // Convert file to data URL for uploadString
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
      return null; // Return null if upload fails
    }
  };


  const handleEmailPasswordAuth = async (data: SignUpFormData | SignInFormData) => {
    setIsSubmitting(true);
    const isSignUp = activeTab === 'signup';
    let photoURL: string | null = null; // Keep track of the photo URL

    try {
      let userCredential: UserCredential;

      if (isSignUp) {
        // --- Sign Up Logic ---
        const signUpData = data as SignUpFormData;
        console.log("Attempting sign up with:", signUpData.email);

        // 1. Create user in Firebase Auth
        userCredential = await createUserWithEmailAndPassword(auth, signUpData.email, signUpData.password);
        const user = userCredential.user;
        console.log("User created in Auth:", user.uid);

         // 2. Upload photo if provided
        if (signUpData.photoFile && user) {
             photoURL = await uploadPhoto(signUpData.photoFile, user.uid);
             // If upload failed, photoURL will be null, proceed without it but maybe log/warn
             if (!photoURL) {
                console.warn("Photo upload failed, proceeding without profile picture.");
             }
        }

        // 3. Update profile (Auth and Firestore) - Pass displayName and photoURL
        console.log("Updating profile with:", { displayName: signUpData.displayName, photoURL });
        await updateUserProfile(userCredential, signUpData.displayName || undefined, photoURL); // Pass undefined if empty string
        toast({ title: 'Account created successfully!' });

      } else {
        // --- Sign In Logic ---
        const signInData = data as SignInFormData;
        console.log("Attempting sign in with:", signInData.email);
        userCredential = await signInWithEmailAndPassword(auth, signInData.email, signInData.password);
        console.log("User signed in:", userCredential.user.uid);

        // Update lastSeen in Firestore on successful sign-in (no displayName/photoURL needed here)
        await updateUserProfile(userCredential);
        toast({ title: 'Signed in successfully!' });
      }

      // AuthProvider listener handles redirect/UI update

    } catch (error: any) {
      console.error(`${isSignUp ? 'Sign Up' : 'Sign In'} Error:`, error);
      toast({
        title: isSignUp ? 'Sign Up Failed' : 'Sign In Failed',
        description: getFirebaseAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    const provider = new GoogleAuthProvider();
    try {
      console.log("Attempting Google Sign-In...");
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      console.log("Signed in with Google:", user.uid, user.displayName, user.photoURL);

      // Update profile using Google's info (displayName, photoURL) + update lastSeen
      await updateUserProfile(userCredential, user.displayName || undefined, user.photoURL || null);
      toast({ title: 'Signed in with Google successfully!' });
      // AuthProvider listener handles redirect/UI update
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      toast({
        title: 'Google Sign-In Failed',
        description: getFirebaseAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form when tab changes
  const handleTabChange = (value: string) => {
      setActiveTab(value as 'signin' | 'signup');
      signInForm.reset(); // Reset sign-in form state and errors
      signUpForm.reset(); // Reset sign-up form state and errors
      setPhotoPreview(null); // Reset photo preview
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Clear file input visually
      }
      // Clear errors manually if reset doesn't do it consistently
      signInForm.clearErrors();
      signUpForm.clearErrors();
  }

  // --- JSX ---
  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary p-4">
      <Tabs defaultValue="signin" value={activeTab} className="w-full max-w-md" onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign In</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>

        {/* ====== Sign In Tab ====== */}
        <TabsContent value="signin">
          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>Enter your credentials to access your account.</CardDescription>
            </CardHeader>
            <form onSubmit={signInForm.handleSubmit(handleEmailPasswordAuth)}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signin">Email</Label>
                  <Input
                    id="email-signin"
                    type="email"
                    placeholder="m@example.com"
                    {...signInForm.register('email')}
                    disabled={isSubmitting}
                    aria-required="true"
                    aria-invalid={!!signInForm.formState.errors.email}
                  />
                  {signInForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{signInForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signin">Password</Label>
                  <Input
                    id="password-signin"
                    type="password"
                    placeholder="******"
                    {...signInForm.register('password')}
                    disabled={isSubmitting}
                    aria-required="true"
                     aria-invalid={!!signInForm.formState.errors.password}
                  />
                  {signInForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{signInForm.formState.errors.password.message}</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                {/* Submit Button */}
                <Button type="submit" className="w-full" disabled={isSubmitting || !signInForm.formState.isValid}>
                  <LogIn className="mr-2 h-4 w-4" /> {isSubmitting ? 'Signing In...' : 'Sign In'}
                </Button>
                 {/* Separator */}
                <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                </div>
                 {/* Google Sign In Button */}
                <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isSubmitting}>
                  <Chrome className="mr-2 h-4 w-4" /> Sign In with Google
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* ====== Sign Up Tab ====== */}
        <TabsContent value="signup">
          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle>Sign Up</CardTitle>
              <CardDescription>Create a new account.</CardDescription>
            </CardHeader>
             <form onSubmit={signUpForm.handleSubmit(handleEmailPasswordAuth)}>
              <CardContent className="space-y-4">
                 {/* --- Profile Picture Upload --- */}
                <div className="space-y-2 flex flex-col items-center">
                     {/* Clickable Avatar/Label */}
                     <Label htmlFor="photo-upload" className="cursor-pointer group">
                        <Avatar className="h-20 w-20 mb-2 border-2 border-dashed group-hover:border-primary transition-colors">
                            {/* Preview Image */}
                            <AvatarImage src={photoPreview ?? undefined} alt="Profile Preview" data-ai-hint="user profile picture preview" />
                             {/* Fallback with Initials or Icon */}
                             <AvatarFallback className="bg-muted text-muted-foreground">
                                {photoPreview && signUpForm.getValues('displayName') ? getInitials(signUpForm.getValues('displayName')) : <ImagePlus className="h-8 w-8" />}
                             </AvatarFallback>
                        </Avatar>
                     </Label>
                     {/* Hidden File Input */}
                     <Input
                        id="photo-upload"
                        type="file"
                        accept="image/*" // Accept only image files
                        className="hidden" // Hide the default input visually
                        onChange={handleFileChange}
                        ref={fileInputRef}
                        disabled={isSubmitting}
                        aria-label="Upload profile picture (optional)"
                     />
                     {/* Trigger Button */}
                     <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
                        <Upload className="mr-2 h-4 w-4" />
                        {photoPreview ? 'Change Photo' : 'Add Photo (Optional)'}
                     </Button>
                     {/* Error Message */}
                     {signUpForm.formState.errors.photoFile && (
                        <p className="text-sm text-destructive">{signUpForm.formState.errors.photoFile.message}</p>
                    )}
                 </div>

                 {/* --- Display Name --- */}
                 <div className="space-y-2">
                    <Label htmlFor="displayName-signup">Display Name (Optional)</Label>
                    <Input
                      id="displayName-signup"
                      type="text"
                      placeholder="Your Name"
                      {...signUpForm.register('displayName')}
                      disabled={isSubmitting}
                      aria-invalid={!!signUpForm.formState.errors.displayName}
                    />
                    {/* Only show error if specific validation (e.g., min/max length) is added */}
                     {signUpForm.formState.errors.displayName && (
                        <p className="text-sm text-destructive">{signUpForm.formState.errors.displayName.message}</p>
                      )}
                 </div>

                 {/* --- Email --- */}
                <div className="space-y-2">
                  <Label htmlFor="email-signup">Email</Label>
                  <Input
                    id="email-signup"
                    type="email"
                    placeholder="m@example.com"
                    {...signUpForm.register('email')}
                    disabled={isSubmitting}
                    aria-required="true"
                     aria-invalid={!!signUpForm.formState.errors.email}
                  />
                   {signUpForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{signUpForm.formState.errors.email.message}</p>
                  )}
                </div>
                 {/* --- Password --- */}
                <div className="space-y-2">
                  <Label htmlFor="password-signup">Password</Label>
                  <Input
                    id="password-signup"
                    type="password"
                    placeholder="At least 6 characters"
                    {...signUpForm.register('password')}
                    disabled={isSubmitting}
                    aria-required="true"
                    aria-invalid={!!signUpForm.formState.errors.password}
                  />
                  {signUpForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{signUpForm.formState.errors.password.message}</p>
                  )}
                </div>
              </CardContent>
               {/* --- Card Footer --- */}
              <CardFooter className="flex flex-col gap-4">
                  {/* Submit Button */}
                 <Button type="submit" className="w-full" disabled={isSubmitting || !signUpForm.formState.isValid}>
                   <UserPlus className="mr-2 h-4 w-4" /> {isSubmitting ? 'Creating Account...' : 'Create Account'}
                 </Button>
                  {/* Separator */}
                 <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or sign up with</span>
                    </div>
                 </div>
                   {/* Google Sign Up Button */}
                  <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isSubmitting}>
                     <Chrome className="mr-2 h-4 w-4" /> Sign Up with Google
                  </Button>
              </CardFooter>
             </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
