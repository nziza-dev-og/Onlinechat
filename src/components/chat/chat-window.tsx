"use client";

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import type { Message } from '@/types';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut, UserCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();

  // Auto-scrolling effect
  useEffect(() => {
    const scrollToBottom = () => {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      }
    };
    // Scroll on initial load and whenever messages change
    scrollToBottom();
  }, [messages]);

  // Fetch messages from Firestore
  useEffect(() => {
    setLoadingMessages(true);
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'), limit(50)); // Limit messages for performance

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedMessages: Message[] = [];
      querySnapshot.forEach((doc) => {
        // Ensure timestamp exists and is a Firestore Timestamp before converting
        const data = doc.data();
        if (data.timestamp && typeof data.timestamp.toDate === 'function') {
           fetchedMessages.push({ ...data, id: doc.id } as Message);
        } else {
          // Handle cases where timestamp might be missing or not a Firestore Timestamp
          // You could assign a default date, log an error, or skip the message
          console.warn("Message missing or invalid timestamp:", doc.id, data);
           fetchedMessages.push({ ...data, id: doc.id, timestamp: null } as any); // Or handle differently
        }

      });
       // Filter out messages with null timestamps before setting state
      setMessages(fetchedMessages.filter(msg => msg.timestamp !== null));
      setLoadingMessages(false);

    }, (error) => {
        console.error("Error fetching messages:", error);
        setLoadingMessages(false);
        // Optionally show an error toast
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

   // Function to get initials from display name
   const getInitials = (name: string | null): string => {
    if (!name) return '';
    const nameParts = name.split(' ');
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '';
  };


  return (
    <div className="flex flex-col h-screen bg-secondary">
       <header className="flex items-center justify-between p-4 border-b bg-background shadow-sm">
         <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
                <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || 'User'} data-ai-hint="user profile avatar"/>
                <AvatarFallback>{getInitials(user?.displayName)}</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-foreground">{user?.displayName || user?.email || 'Chat User'}</span>
         </div>

        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
          <LogOut className="h-5 w-5" />
        </Button>
      </header>
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div ref={viewportRef} className="h-full">
          {loadingMessages && (
             <div className="space-y-4 p-4">
                <Skeleton className="h-16 w-3/4" />
                <Skeleton className="h-16 w-3/4 ml-auto" />
                <Skeleton className="h-16 w-2/3" />
                 <Skeleton className="h-16 w-1/2 ml-auto" />
            </div>
          )}
          {!loadingMessages && messages.length === 0 && (
             <div className="flex items-center justify-center h-full">
               <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
            </div>
          )}
          {!loadingMessages && messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </div>
      </ScrollArea>
      <ChatInput />
    </div>
  );
}
