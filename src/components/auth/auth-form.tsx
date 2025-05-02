
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
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'; // Import Firestore functions
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, Chrome } from 'lucide-react'; // Use Chrome icon for Google
import type { UserProfile } from '@/types'; // Import UserProfile type

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

type FormData = z.infer<typeof formSchema>;

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
      return error.message || 'An unknown authentication error occurred.';
  }
};

// Function to update user profile in Firestore
const updateUserProfile = async (userCred: UserCredential) => {
    const user = userCred.user;
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const userData: UserProfile = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        lastSeen: serverTimestamp(), // Update last seen time
    };

    try {
        // Use setDoc with merge: true to create or update the document
        await setDoc(userRef, userData, { merge: true });
    } catch (error) {
        console.error("Error updating user profile in Firestore:", error);
        // Optionally handle Firestore update error (e.g., show a toast)
    }
};


export function AuthForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    // Reset form errors when switching tabs
    shouldUnregister: false,
  });


  const handleEmailPasswordAuth = async (data: FormData, isSignUp: boolean) => {
    setIsSubmitting(true);
    try {
      let userCredential: UserCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        toast({ title: 'Account created successfully!' });
      } else {
        userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
        toast({ title: 'Signed in successfully!' });
      }
      await updateUserProfile(userCredential); // Save/Update user profile in Firestore
      // User state will be updated by the AuthProvider listener
    } catch (error: any) {
      console.error('Email/Password Auth Error:', error); // Log the full error
      toast({
        title: 'Authentication Failed',
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
      toast({ title: 'Signed in with Google successfully!' });
      await updateUserProfile(userCredential); // Save/Update user profile in Firestore
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
      form.reset(); // Reset form fields and errors
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary">
      <Tabs defaultValue="signin" className="w-[400px]" onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign In</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>
        <TabsContent value="signin">
          <Card>
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>Enter your credentials to access your account.</CardDescription>
            </CardHeader>
            {/* Use a unique key to force re-render and state reset if needed, or rely on onValueChange */}
            <form onSubmit={form.handleSubmit((data) => handleEmailPasswordAuth(data, false))}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signin">Email</Label>
                  <Input
                    id="email-signin"
                    type="email"
                    placeholder="m@example.com"
                    {...form.register('email')}
                    disabled={isSubmitting}
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signin">Password</Label>
                  <Input
                    id="password-signin"
                    type="password"
                    placeholder="******"
                    {...form.register('password')}
                    disabled={isSubmitting}
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={isSubmitting || !form.formState.isValid}>
                  <LogIn className="mr-2 h-4 w-4" /> {isSubmitting ? 'Signing In...' : 'Sign In'}
                </Button>
                <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isSubmitting}>
                  <Chrome className="mr-2 h-4 w-4" /> Sign In with Google
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
        <TabsContent value="signup">
          <Card>
            <CardHeader>
              <CardTitle>Sign Up</CardTitle>
              <CardDescription>Create a new account.</CardDescription>
            </CardHeader>
             {/* Use a unique key to force re-render and state reset if needed, or rely on onValueChange */}
             <form onSubmit={form.handleSubmit((data) => handleEmailPasswordAuth(data, true))}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signup">Email</Label>
                  <Input
                    id="email-signup"
                    type="email"
                    placeholder="m@example.com"
                    {...form.register('email')}
                    disabled={isSubmitting}
                  />
                   {form.formState.errors.email && (
                    <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signup">Password</Label>
                  <Input
                    id="password-signup"
                    type="password"
                    placeholder="******"
                    {...form.register('password')}
                    disabled={isSubmitting}
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                 <Button type="submit" className="w-full" disabled={isSubmitting || !form.formState.isValid}>
                   <UserPlus className="mr-2 h-4 w-4" /> {isSubmitting ? 'Signing Up...' : 'Sign Up'}
                 </Button>
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
