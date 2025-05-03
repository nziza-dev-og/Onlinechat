
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
  updateProfile as updateAuthProfile, // Import Firebase Auth update function
} from 'firebase/auth';
import { auth, storage } from '@/lib/firebase'; // Import auth (storage might not be needed here anymore)
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, Chrome, User as UserIcon } from 'lucide-react'; // Changed icons
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createOrUpdateUserProfile, type UserProfileInput } from '@/lib/user-profile.service'; // Import the service and the input type

// Schema for sign up, removed photoFile
const signUpSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  displayName: z.string().min(1, { message: "Display name is required." }).max(50, { message: "Display name too long." }).optional(), // Optional but with validation if present
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
    case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection and try again.';
    // Add more specific Firebase error codes as needed
    default:
      console.error("Unhandled Firebase Auth Error:", error.code, error.message); // Log unhandled errors
      return error.message || 'An unknown authentication error occurred.';
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

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
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


  const handleEmailPasswordAuth = async (data: SignUpFormData | SignInFormData) => {
    setIsSubmitting(true);
    const isSignUp = activeTab === 'signup';
    let finalDisplayName: string | null = null;

    if (!auth) {
        toast({ title: 'Authentication Error', description: 'Auth service not available.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }

    try {
      let userCredential: UserCredential;
      let userId: string;
      let userEmail: string | null;

      if (isSignUp) {
        // --- Sign Up Logic ---
        const signUpData = data as SignUpFormData;
        console.log("Attempting sign up with:", signUpData.email);

        // 1. Create user in Firebase Auth
        userCredential = await createUserWithEmailAndPassword(auth, signUpData.email, signUpData.password);
        const user = userCredential.user;
        userId = user.uid;
        userEmail = user.email;
        console.log("User created in Auth:", userId);

        // 2. Prepare displayName (use provided or null)
        finalDisplayName = signUpData.displayName?.trim() || null;

        // 3. Update Firebase Auth Profile (displayName only) - Happens Client-Side
        if (finalDisplayName !== user.displayName) {
            try {
                await updateAuthProfile(user, { displayName: finalDisplayName });
                console.log("Firebase Auth profile updated (displayName):", finalDisplayName);
            } catch (authUpdateError: any) {
                 console.error("Error updating Firebase Auth profile during sign up:", authUpdateError);
                 toast({ title: "Auth Profile Update Warning", description: `Could not update Auth display name: ${authUpdateError.message}`, variant: "default" });
            }
        }

        // 4. Prepare data for Firestore profile creation/update (using primitives)
        const profileData: UserProfileInput = {
            uid: userId,
            email: userEmail,
            displayName: finalDisplayName, // Use the potentially updated display name
            photoURL: user.photoURL // Use default photoURL from auth if any, or null
        };

        // Call the service function to create/update the Firestore document
        console.log("Creating/Updating Firestore profile with:", profileData);
        await createOrUpdateUserProfile(profileData);
        console.log(`Firestore profile created/updated for user ${userId}`);
        toast({ title: 'Account created successfully!' });

      } else {
        // --- Sign In Logic ---
        const signInData = data as SignInFormData;
        console.log("Attempting sign in with:", signInData.email);
        userCredential = await signInWithEmailAndPassword(auth, signInData.email, signInData.password);
        const user = userCredential.user;
        userId = user.uid;
        userEmail = user.email;
        console.log("User signed in:", userId);

        // Prepare data for Firestore profile update (only uid and email needed for lastSeen update by the service)
        const profileData: UserProfileInput = {
            uid: userId,
            email: userEmail,
        };

        // Update lastSeen in Firestore on successful sign-in using the service
        console.log("Updating Firestore profile (lastSeen) for:", profileData.uid);
        await createOrUpdateUserProfile(profileData); // Service handles adding/merging lastSeen
        toast({ title: 'Signed in successfully!' });
      }

      // AuthProvider listener handles redirect/UI update

    } catch (error: any) {
      console.error(`${isSignUp ? 'Sign Up' : 'Sign In'} Error:`, error);
      const errorMessage = error instanceof Error && 'code' in error
            ? getFirebaseAuthErrorMessage(error as AuthError)
            : error.message || 'An unexpected error occurred.';

      toast({
        title: isSignUp ? 'Sign Up Failed' : 'Sign In Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    if (!auth) {
        toast({ title: 'Authentication Error', description: 'Auth service not available.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }
    const provider = new GoogleAuthProvider();
    try {
      console.log("Attempting Google Sign-In...");
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      console.log("Signed in with Google:", user.uid, user.displayName, user.photoURL);

      // Prepare data for Firestore profile update (using primitives from Google's profile)
      const profileData: UserProfileInput = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || null, // Get data from Google user object
          photoURL: user.photoURL || null     // Get data from Google user object
      };

      // Update profile using Google's info + update lastSeen via service
      console.log("Creating/Updating Firestore profile via Google Sign-In:", profileData);
      await createOrUpdateUserProfile(profileData);
      toast({ title: 'Signed in with Google successfully!' });
      // AuthProvider listener handles redirect/UI update
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
       const errorMessage = error instanceof Error && 'code' in error
            ? getFirebaseAuthErrorMessage(error as AuthError)
            : error.message || 'An unexpected error occurred during Google Sign-In.';
      toast({
        title: 'Google Sign-In Failed',
        description: errorMessage,
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
      // Clear errors manually if reset doesn't do it consistently
      signInForm.clearErrors();
      signUpForm.clearErrors();
  }

  // --- JSX ---
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4"> {/* Adjust min-height for header */}
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
                 {/* --- Default Avatar Placeholder --- */}
                <div className="space-y-2 flex flex-col items-center">
                    <Avatar className="h-20 w-20 mb-2 border-2 border-dashed">
                         <AvatarFallback className="bg-muted text-muted-foreground">
                            {/* Use initials if displayName is entered, otherwise default icon */}
                            {signUpForm.watch('displayName') ? getInitials(signUpForm.watch('displayName')) : <UserIcon className="h-8 w-8" />}
                         </AvatarFallback>
                    </Avatar>
                    <p className="text-xs text-muted-foreground">You can add a profile picture later on your profile page.</p>
                 </div>

                 {/* --- Display Name --- */}
                 <div className="space-y-2">
                    <Label htmlFor="displayName-signup">Display Name</Label>
                    <Input
                      id="displayName-signup"
                      type="text"
                      placeholder="Your Name"
                      {...signUpForm.register('displayName')}
                      disabled={isSubmitting}
                      aria-invalid={!!signUpForm.formState.errors.displayName}
                    />
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

