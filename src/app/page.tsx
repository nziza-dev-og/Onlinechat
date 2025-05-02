"use client";

import { useAuth } from '@/hooks/use-auth';
import { AuthForm } from '@/components/auth/auth-form';
import { ChatWindow } from '@/components/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton'; // Use Skeleton for loading state

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    // Display a loading state, maybe a full-page spinner or skeleton
    return (
        <div className="flex items-center justify-center min-h-screen bg-secondary">
            <div className="space-y-4 p-4 w-full max-w-md">
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-1/2 mx-auto" />
            </div>
      </div>
    );
  }

  return user ? <ChatWindow /> : <AuthForm />;
}
