
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
import { LogIn, UserPlus, Chrome, ImagePlus } from 'lucide-react'; // Use Chrome icon for Google, ImagePlus for profile pic upload
import type { UserProfile } from '@/types'; // Import UserProfile type
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage"; // Firebase Storage
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Import Avatar components

// Extend schema for sign up to include optional display name and photo URL
const signUpSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  displayName: z.string().optional(),
  photoFile: z.instanceof(File).optional(), // Use File type for upload
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
    const isNewUser = userCred.additionalUserInfo?.isNewUser; // Check if it's a new user

    // Prepare data for Firebase Auth update
    const authUpdateData: { displayName?: string | null; photoURL?: string | null } = {};
    if (displayName) authUpdateData.displayName = displayName;
    if (photoURL !== undefined) authUpdateData.photoURL = photoURL; // Allow setting null or string

    // Prepare data for Firestore update
    const firestoreUpdateData: Partial<UserProfile> = {
        uid: user.uid,
        email: user.email, // Always include email
        // Use provided values or fallback to existing user data
        displayName: displayName ?? user.displayName,
        photoURL: photoURL !== undefined ? photoURL : user.photoURL,
    };
    // Only set lastSeen for existing users or add createdAt for new users
    if (isNewUser) {
        firestoreUpdateData.createdAt = serverTimestamp();
        firestoreUpdateData.lastSeen = serverTimestamp();
    } else {
        firestoreUpdateData.lastSeen = serverTimestamp(); // Update last seen time for logins
    }


    try {
        // 1. Update Firebase Auth profile (if necessary)
        if (Object.keys(authUpdateData).length > 0) {
            await updateProfile(user, authUpdateData);
        }

        // 2. Create or update Firestore document
        // Use setDoc with merge: true to create/update. Ensure essential fields exist.
        await setDoc(userRef, firestoreUpdateData, { merge: true });

        console.log("User profile updated successfully in Auth and Firestore.");

    } catch (error) {
        console.error("Error updating user profile:", error);
        // Optionally handle Firestore/Auth update error (e.g., show a toast)
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
    return name.trim().length > 0 ? name.trim()[0].toUpperCase() : '?';
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
      photoFile: undefined,
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

  // Handle file selection and preview
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      signUpForm.setValue('photoFile', file); // Set file in form state
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
       signUpForm.setValue('photoFile', undefined);
       setPhotoPreview(null);
    }
  };

   // Upload photo to Firebase Storage
   const uploadPhoto = async (file: File, uid: string): Promise<string | null> => {
    const storage = getStorage();
    const storageRef = ref(storage, `profilePictures/${uid}/${file.name}`);
    try {
      // Convert file to data URL for uploadString
       const reader = new FileReader();
       const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
       });

      const snapshot = await uploadString(storageRef, dataUrl, 'data_url');
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading photo:", error);
      toast({
        title: "Photo Upload Failed",
        description: "Could not upload your profile picture. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };


  const handleEmailPasswordAuth = async (data: SignUpFormData | SignInFormData) => {
    setIsSubmitting(true);
    const isSignUp = activeTab === 'signup';
    let photoURL: string | null = null;

    try {
      let userCredential: UserCredential;

      if (isSignUp) {
        // Sign Up Logic
        const signUpData = data as SignUpFormData;
        userCredential = await createUserWithEmailAndPassword(auth, signUpData.email, signUpData.password);

         // Upload photo if provided
        if (signUpData.photoFile && userCredential.user) {
             photoURL = await uploadPhoto(signUpData.photoFile, userCredential.user.uid);
        }

        // Update profile (Auth and Firestore)
        await updateUserProfile(userCredential, signUpData.displayName || null, photoURL);
        toast({ title: 'Account created successfully!' });

      } else {
        // Sign In Logic
        const signInData = data as SignInFormData;
        userCredential = await signInWithEmailAndPassword(auth, signInData.email, signInData.password);
        // Update lastSeen in Firestore on successful sign-in
        await updateUserProfile(userCredential);
        toast({ title: 'Signed in successfully!' });
      }

      // User state will be updated by the AuthProvider listener

    } catch (error: any) {
      console.error('Email/Password Auth Error:', error); // Log the full error
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
      const userCredential = await signInWithPopup(auth, provider);
      // Use Google's profile info, but allow Firestore merge to update lastSeen
      await updateUserProfile(userCredential);
      toast({ title: 'Signed in with Google successfully!' });
      // User state will be updated by the AuthProvider listener
    } catch (error: any) {
      console.error('Google Sign-In Error:', error); // Log the full error object
      toast({
        title: 'Google Sign-In Failed',
        description: getFirebaseAuthErrorMessage(error), // Use the helper function
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form when tab changes
  const handleTabChange = (value: string) => {
      setActiveTab(value as 'signin' | 'signup');
      signInForm.reset(); // Reset sign-in form
      signUpForm.reset(); // Reset sign-up form
      setPhotoPreview(null); // Reset photo preview
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Clear file input visually
      }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary p-4"> {/* Added padding */}
      <Tabs defaultValue="signin" value={activeTab} className="w-full max-w-md" onValueChange={handleTabChange}> {/* Responsive width */}
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign In</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>

        {/* Sign In Tab */}
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
                  />
                  {signInForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{signInForm.formState.errors.password.message}</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={isSubmitting || !signInForm.formState.isValid}>
                  <LogIn className="mr-2 h-4 w-4" /> {isSubmitting ? 'Signing In...' : 'Sign In'}
                </Button>
                <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                </div>
                <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isSubmitting}>
                  <Chrome className="mr-2 h-4 w-4" /> Sign In with Google
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* Sign Up Tab */}
        <TabsContent value="signup">
          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle>Sign Up</CardTitle>
              <CardDescription>Create a new account.</CardDescription>
            </CardHeader>
             <form onSubmit={signUpForm.handleSubmit(handleEmailPasswordAuth)}>
              <CardContent className="space-y-4">
                 {/* Profile Picture Upload */}
                <div className="space-y-2 flex flex-col items-center">
                     <Label htmlFor="photo-upload" className="cursor-pointer">
                        <Avatar className="h-20 w-20 mb-2 border-2 border-dashed hover:border-primary transition-colors">
                            <AvatarImage src={photoPreview ?? undefined} alt="Profile Preview" data-ai-hint="user profile picture preview" />
                             <AvatarFallback className="bg-muted">
                                {photoPreview ? getInitials(signUpForm.getValues('displayName')) : <ImagePlus className="h-8 w-8 text-muted-foreground" />}
                             </AvatarFallback>
                        </Avatar>
                     </Label>
                     <Input
                        id="photo-upload"
                        type="file"
                        accept="image/*" // Accept only image files
                        className="hidden" // Hide the default input
                        onChange={handleFileChange}
                        ref={fileInputRef}
                        disabled={isSubmitting}
                        aria-label="Upload profile picture"
                     />
                     <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
                        {photoPreview ? 'Change Photo' : 'Add Photo (Optional)'}
                     </Button>
                     {signUpForm.formState.errors.photoFile && (
                        <p className="text-sm text-destructive">{signUpForm.formState.errors.photoFile.message}</p>
                    )}
                 </div>

                 <div className="space-y-2">
                    <Label htmlFor="displayName-signup">Display Name (Optional)</Label>
                    <Input
                      id="displayName-signup"
                      type="text"
                      placeholder="Your Name"
                      {...signUpForm.register('displayName')}
                      disabled={isSubmitting}
                    />
                    {/* No error display needed for optional field unless specific validation is added */}
                 </div>

                <div className="space-y-2">
                  <Label htmlFor="email-signup">Email</Label>
                  <Input
                    id="email-signup"
                    type="email"
                    placeholder="m@example.com"
                    {...signUpForm.register('email')}
                    disabled={isSubmitting}
                    aria-required="true"
                  />
                   {signUpForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{signUpForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signup">Password</Label>
                  <Input
                    id="password-signup"
                    type="password"
                    placeholder="******"
                    {...signUpForm.register('password')}
                    disabled={isSubmitting}
                    aria-required="true"
                  />
                  {signUpForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{signUpForm.formState.errors.password.message}</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                 <Button type="submit" className="w-full" disabled={isSubmitting || !signUpForm.formState.isValid}>
                   <UserPlus className="mr-2 h-4 w-4" /> {isSubmitting ? 'Creating Account...' : 'Create Account'}
                 </Button>
                 <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or sign up with</span>
                    </div>
                 </div>
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
