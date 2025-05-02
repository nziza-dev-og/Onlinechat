
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, limit, where, addDoc, serverTimestamp, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import type { Message, UserProfile } from '@/types'; // Import UserProfile
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut, Users, MessageSquare, Search } from 'lucide-react'; // Import Users and MessageSquare icons
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from '@/components/ui/input'; // Import Input for search
import { Separator } from '@/components/ui/separator'; // Import Separator
import { cn } from '@/lib/utils'; // Import cn for conditional classes
import { useToast } from "@/hooks/use-toast"; // Import useToast
import { updateUserProfileDocument } from '@/lib/user-profile.service'; // Import the service

// Helper function to create a unique chat ID between two users
const getChatId = (uid1: string, uid2: string): string => {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

// Consistent Helper function to get initials
const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?'; // Default to '?' if no name
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '?'; // Fallback if name is just whitespace or unusual format
};


export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false); // Initially false until a chat is selected
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedChatPartner, setSelectedChatPartner] = useState<UserProfile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(''); // State for search term
  const { toast } = useToast(); // Get toast function

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();
  const isInitialMessagesLoad = useRef(true); // Ref to track initial message load for notifications
  const messageListenerUnsubscribe = useRef<(() => void) | null>(null); // Ref for unsubscribe function


  // Fetch users from Firestore 'users' collection
  useEffect(() => {
    if (!user) return; // Don't fetch if user is not logged in

    setLoadingUsers(true);
    // Query users collection, excluding the current user
    const usersQuery = query(collection(db, 'users'), where('uid', '!=', user.uid));

    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const fetchedUsers: UserProfile[] = snapshot.docs.map(doc => doc.data() as UserProfile);
      // Sort users alphabetically by displayName (or email as fallback)
      fetchedUsers.sort((a, b) => {
          const nameA = a.displayName || a.email || '';
          const nameB = b.displayName || b.email || '';
          return nameA.localeCompare(nameB);
      });
      setUsers(fetchedUsers);
      setLoadingUsers(false);
    }, (error) => {
        console.error("Error fetching users:", error);
        setLoadingUsers(false);
         toast({
            title: "Error",
            description: "Could not fetch user list.",
            variant: "destructive",
          });
    });

    // Update current user's lastSeen on mount using the service
    const updateUserPresence = async () => {
      if(user) {
        try {
          await updateUserProfileDocument(user.uid, { lastSeen: serverTimestamp() });
          console.log("Updated user presence for", user.uid);
        } catch (error) {
          console.error("Error updating user presence:", error);
           // Optional: Toast notification for presence update failure
          // toast({ title: "Presence Error", description: "Could not update online status.", variant: "destructive" });
        }
      }
    };
    updateUserPresence();

    // Cleanup subscription on unmount
    return () => {
        console.log("Unsubscribing from users listener");
        unsubscribeUsers();
    };
  }, [user, toast]); // Re-run when user logs in/out


  // Fetch messages when a chat partner is selected
  useEffect(() => {
     // Cleanup previous listener before setting up a new one
     if (messageListenerUnsubscribe.current) {
        console.log("Unsubscribing from previous messages listener");
        messageListenerUnsubscribe.current();
        messageListenerUnsubscribe.current = null; // Reset the ref
      }

    if (!user || !selectedChatPartner) {
        setMessages([]); // Clear messages if no chat is selected
        setLoadingMessages(false);
        setChatId(null);
        isInitialMessagesLoad.current = true; // Reset initial load flag
        console.log("No chat partner selected, clearing messages.");
        return; // Exit early
    }

    setLoadingMessages(true);
    isInitialMessagesLoad.current = true; // Set flag for initial load
    const currentChatId = getChatId(user.uid, selectedChatPartner.uid);
    setChatId(currentChatId); // Store the current chat ID
    console.log(`Fetching messages for chat: ${currentChatId}`);

    const messagesQuery = query(
      collection(db, 'chats', currentChatId, 'messages'),
      orderBy('timestamp', 'asc'), // Order by asc
      limit(100) // Fetch more messages initially or implement pagination later
    );

    // Store the new unsubscribe function
    messageListenerUnsubscribe.current = onSnapshot(messagesQuery, (querySnapshot) => {
      const fetchedMessages: Message[] = [];
      let newMessagesReceived = false; // Track if new messages were added

      querySnapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
              newMessagesReceived = true;
              const data = change.doc.data();
              const message = { ...data, id: change.doc.id } as Message;

              // Basic validation for timestamp before processing
              if (!message.timestamp || typeof message.timestamp.toDate !== 'function') {
                  console.warn("Message missing or invalid timestamp, assigning current time:", change.doc.id, data);
                   message.timestamp = Timestamp.now(); // Assign server timestamp if missing/invalid
              }

               // --- Notification Logic ---
              // Check if message is new *after* initial load and *not* from current user
              if (!isInitialMessagesLoad.current && message.uid !== user?.uid) {
                   // Only show notification if the document (tab/window) is currently hidden
                   if (document.hidden) {
                        console.log("Document hidden, showing toast notification for new message.");
                        toast({
                            title: `New message from ${message.displayName || 'User'}`,
                            description: message.text.substring(0, 50) + (message.text.length > 50 ? '...' : ''),
                            // Optional: Add an action to bring the window to focus
                            // action: <ToastAction altText="Show chat">Show</ToastAction>,
                        });
                   } else {
                       console.log("Document visible, new message received but no toast shown.");
                       // Optional: could play a subtle sound or update favicon
                   }
              }
              fetchedMessages.push(message);
          }
          // Add logic for 'modified' or 'removed' changes if needed in the future
          // else if (change.type === "modified") { ... }
          // else if (change.type === "removed") { ... }
      });


       // Efficiently update messages state: Append new, avoid duplicates, maintain sort order
       setMessages(prevMessages => {
           const existingMessageIds = new Set(prevMessages.map(m => m.id));
           const newUniqueMessages = fetchedMessages.filter(m => !existingMessageIds.has(m.id));
           if (newUniqueMessages.length === 0) {
               return prevMessages; // No change if no new unique messages
           }
           // Combine and sort. Sorting is crucial as 'added' changes might not be perfectly ordered
           return [...prevMessages, ...newUniqueMessages].sort((a, b) => {
               const timeA = a.timestamp?.toMillis() ?? 0;
               const timeB = b.timestamp?.toMillis() ?? 0;
               return timeA - timeB;
           });
       });


      setLoadingMessages(false);

      // Scroll to bottom logic: Trigger on initial load or when new messages arrive
      if (newMessagesReceived || isInitialMessagesLoad.current) {
           console.log("Scrolling to bottom due to initial load or new messages.");
           // Use setTimeout to ensure DOM has updated before scrolling
           setTimeout(() => scrollToBottom(), 100);
      }

      // After processing the *first* snapshot, mark initial load as complete
      if(isInitialMessagesLoad.current) {
          console.log(`Initial messages loaded for chat ${currentChatId}`);
          isInitialMessagesLoad.current = false;
      }


    }, (error) => {
        console.error(`Error fetching messages for chat ${currentChatId}:`, error);
        setLoadingMessages(false);
        isInitialMessagesLoad.current = false; // Ensure flag is reset on error
        messageListenerUnsubscribe.current = null; // Clear ref on error
        toast({
            title: "Error",
            description: "Could not fetch messages.",
            variant: "destructive",
        });
    });

    // Cleanup function for this effect
     return () => {
        if (messageListenerUnsubscribe.current) {
          console.log(`Unsubscribing from messages listener for chat ${chatId}`);
          messageListenerUnsubscribe.current();
          messageListenerUnsubscribe.current = null;
        }
      };

  }, [user, selectedChatPartner, toast]); // Dependencies: user, selectedChatPartner, toast


   // Auto-scrolling effect: Scrolls the viewport to the bottom
   const scrollToBottom = () => {
    if (viewportRef.current) {
      // Using scrollTop ensures we scroll the container itself
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  };


  // Handles selecting a user from the list
  const handleSelectUser = (partner: UserProfile) => {
     if (selectedChatPartner?.uid !== partner.uid) { // Only proceed if a *different* user is selected
        console.log(`Selecting user: ${partner.displayName || partner.email} (${partner.uid})`);
        setSelectedChatPartner(partner);
        // Reset message state immediately for better perceived responsiveness
        setMessages([]);
        setLoadingMessages(true); // Indicate that messages are now loading for the new chat
        isInitialMessagesLoad.current = true; // Reset flag for the new chat's initial load
        setChatId(null); // Clear old chatId, useEffect will set the new one
      } else {
          console.log(`User ${partner.displayName || partner.email} is already selected.`);
      }
  };

   // Filter users based on search term (case-insensitive)
   const filteredUsers = users.filter(u =>
    (u.displayName && u.displayName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );


  // --- JSX ---
  return (
     // Adjusted height: screen height minus header height (h-14 typically 3.5rem or 56px)
    <div className="flex h-[calc(100vh-theme(spacing.14))] bg-secondary">
       {/* ====== Sidebar for User List ====== */}
       <aside className="w-64 flex flex-col border-r bg-background shadow-md">
         {/* --- Sidebar Header --- */}
         <header className="flex items-center justify-between p-4 border-b min-h-[65px]"> {/* Added min-height */}
             <div className="flex items-center gap-2 overflow-hidden"> {/* Prevents long names/emails from breaking layout */}
                <Avatar className="h-8 w-8 flex-shrink-0">
                    {/* Current user's avatar */}
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || 'My Avatar'} data-ai-hint="current user profile avatar"/>
                    <AvatarFallback>{getInitials(user?.displayName || user?.email)}</AvatarFallback> {/* Use email as fallback */}
                </Avatar>
                {/* Current user's name/email */}
                <span className="font-semibold text-foreground truncate flex-1 min-w-0">{user?.displayName || user?.email || 'Chat User'}</span>
             </div>
            {/* Sign Out Button */}
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="flex-shrink-0 text-muted-foreground hover:text-foreground">
              <LogOut className="h-5 w-5" />
            </Button>
         </header>

         {/* --- Search Input --- */}
         <div className="p-3 border-b">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search" // Use type="search" for potential browser features (like clear button)
                    placeholder="Search users..."
                    className="pl-8 h-9 bg-muted/50 focus:bg-background" // Subtle background
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search for users to chat with"
                />
            </div>
         </div>

          {/* --- User List --- */}
         <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
                 {/* Loading Skeletons */}
                 {loadingUsers && (
                     <div className="space-y-1 p-2">
                        {[...Array(5)].map((_, i) => ( // Show more skeletons
                            <div key={i} className="flex items-center space-x-3 p-2 h-[52px]"> {/* Match button height */}
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-4 w-3/4" />
                                     {/* <Skeleton className="h-3 w-1/2" /> */}
                                </div>
                            </div>
                        ))}
                     </div>
                 )}
                 {/* Empty State (No Users or No Search Results) */}
                 {!loadingUsers && filteredUsers.length === 0 && (
                    <p className="p-4 text-sm text-center text-muted-foreground">
                        {searchTerm ? "No users found." : "No other users available."}
                    </p>
                 )}
                 {/* User Buttons */}
                 {!loadingUsers && filteredUsers.map((u) => (
                    <Button
                        key={u.uid}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start h-auto py-2 px-3 text-left rounded-md", // Ensure consistent height and rounding
                            "gap-3", // Add gap for spacing
                            selectedChatPartner?.uid === u.uid ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:bg-muted/50"
                        )}
                        onClick={() => handleSelectUser(u)}
                        aria-pressed={selectedChatPartner?.uid === u.uid} // Accessibility for selected state
                    >
                        {/* User Avatar */}
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={u.photoURL || undefined} alt={u.displayName || 'User Avatar'} data-ai-hint="user chat list avatar"/>
                            <AvatarFallback>{getInitials(u.displayName || u.email)}</AvatarFallback>
                        </Avatar>
                        {/* User Name/Email (truncates if too long) */}
                        <div className="flex flex-col flex-1 min-w-0"> {/* Ensure text truncates */}
                            <span className="font-medium truncate text-sm">{u.displayName || u.email || 'Unnamed User'}</span>
                             {/* Optional: Add last message snippet or online status indicator here */}
                             {/* <span className="text-xs text-muted-foreground truncate">Last message...</span> */}
                        </div>
                    </Button>
                 ))}
            </div>
         </ScrollArea>
       </aside>

       {/* ====== Main Chat Area ====== */}
       <main className="flex-1 flex flex-col bg-background">
            {selectedChatPartner ? (
                 <>
                 {/* --- Chat Header --- */}
                 <header className="flex items-center gap-3 p-4 border-b shadow-sm bg-card min-h-[65px]">
                    {/* Chat Partner Avatar */}
                    <Avatar className="h-9 w-9">
                        <AvatarImage src={selectedChatPartner.photoURL || undefined} alt={selectedChatPartner.displayName || 'Chat partner avatar'} data-ai-hint="chat partner avatar"/>
                        <AvatarFallback>{getInitials(selectedChatPartner.displayName || selectedChatPartner.email)}</AvatarFallback>
                    </Avatar>
                     {/* Chat Partner Name/Email */}
                    <div className="flex flex-col">
                        <span className="font-semibold text-card-foreground">{selectedChatPartner.displayName || selectedChatPartner.email}</span>
                        {/* Optional: Display online status or last seen time here */}
                        {/* <span className="text-xs text-muted-foreground">Online</span> */}
                        {/* <span className="text-xs text-muted-foreground">Last seen: {formatDistanceToNow(selectedChatPartner.lastSeen.toDate())} ago</span> */}
                    </div>
                 </header>

                {/* --- Message List --- */}
                <ScrollArea className="flex-1" ref={scrollAreaRef}>
                    {/* Viewport div for controlling scroll */}
                     {/* Make viewport take remaining height */}
                    <div ref={viewportRef} className="flex flex-col h-full p-4 space-y-2 overflow-y-auto">
                        {/* Spacer div pushes messages up when content is short */}
                        {messages.length > 0 && <div className="flex-grow" />}

                        {/* Loading Skeletons for Messages */}
                        {loadingMessages && messages.length === 0 && (
                            <div className="space-y-4 p-4 flex flex-col flex-grow justify-end"> {/* Adjust for loading state */}
                                <Skeleton className="h-12 w-3/5 rounded-lg self-start" />
                                <Skeleton className="h-16 w-3/4 rounded-lg self-end" />
                                <Skeleton className="h-10 w-1/2 rounded-lg self-start" />
                                <Skeleton className="h-14 w-2/3 rounded-lg self-end" />
                            </div>
                        )}
                        {/* Empty Chat Placeholder */}
                        {!loadingMessages && messages.length === 0 && (
                             <div className="flex-grow flex items-center justify-center">
                                <div className="text-center text-muted-foreground p-6 bg-muted/30 rounded-lg">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-3 text-primary/80" />
                                    <p className="font-medium">No messages yet.</p>
                                    <p className="text-sm">Start the conversation with <span className="font-semibold">{selectedChatPartner.displayName || selectedChatPartner.email}</span>!</p>
                                </div>
                             </div>
                        )}
                        {/* Render Messages */}
                         {/* Add padding-bottom to prevent input overlap */}
                        <div className="pb-4">
                             {messages.map((msg) => (
                                <ChatMessage key={msg.id} message={msg} />
                            ))}
                        </div>
                         {/* Optional: Dummy element for scrollIntoView (alternative to scrollTop) */}
                         {/* <div id="chat-end" style={{ height: '1px' }} /> */}
                    </div>
                </ScrollArea>

                {/* --- Chat Input --- */}
                <ChatInput chatId={chatId} />
                </>
            ) : (
                 // ====== Placeholder when no chat is selected ======
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8 bg-gradient-to-br from-background to-muted/30">
                    <Users className="h-16 w-16 mb-4 text-primary opacity-80" />
                    <h2 className="text-xl font-semibold text-foreground mb-1">Welcome to Your Chat!</h2>
                    <p className="text-base mb-4 max-w-xs">Select a user from the list on the left to start chatting.</p>
                     {/* Suggestion for mobile users (conditionally rendered or styled) */}
                    {/* <p className="text-sm md:hidden">Tap the menu icon to see your contacts.</p> */}
                </div>
            )}
       </main>
    </div>
  );
}
