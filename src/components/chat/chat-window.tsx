
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

// Helper function to create a unique chat ID between two users
const getChatId = (uid1: string, uid2: string): string => {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

// Helper function to get initials
const getInitials = (name: string | null): string => {
    if (!name) return '';
    // Handle potential multiple spaces or leading/trailing spaces
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase(); // Use first and last name initial
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    // Fallback for names like " J " or empty strings after trimming
    return name.trim().length > 0 ? name.trim()[0].toUpperCase() : '?';
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
    const usersQuery = query(collection(db, 'users'), where('uid', '!=', user.uid)); // Exclude current user

    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const fetchedUsers: UserProfile[] = [];
      snapshot.forEach((doc) => {
        fetchedUsers.push(doc.data() as UserProfile);
      });
      setUsers(fetchedUsers);
      setLoadingUsers(false);
    }, (error) => {
        console.error("Error fetching users:", error);
        setLoadingUsers(false);
         // Optionally show an error toast
         toast({
            title: "Error",
            description: "Could not fetch user list.",
            variant: "destructive",
          });
    });

    // Update current user's lastSeen on mount and periodically (optional)
    const updateUserPresence = async () => {
      if(user) {
        const userRef = doc(db, 'users', user.uid);
        try {
          await setDoc(userRef, { lastSeen: serverTimestamp() }, { merge: true });
        } catch (error) {
          console.error("Error updating user presence:", error);
        }
      }
    };
    updateUserPresence();
    // Consider adding a timer to update presence more frequently if needed

    // Cleanup subscription on unmount
    return () => unsubscribeUsers();
  }, [user, toast]); // Re-run when user logs in/out


  // Fetch messages when a chat partner is selected
  useEffect(() => {
     // Cleanup previous listener before setting up a new one
     if (messageListenerUnsubscribe.current) {
        messageListenerUnsubscribe.current();
        messageListenerUnsubscribe.current = null; // Reset the ref
      }

    if (!user || !selectedChatPartner) {
        setMessages([]); // Clear messages if no chat is selected
        setLoadingMessages(false);
        setChatId(null);
        isInitialMessagesLoad.current = true; // Reset initial load flag
        return; // Exit early
    }

    setLoadingMessages(true);
    isInitialMessagesLoad.current = true; // Set flag for initial load
    const currentChatId = getChatId(user.uid, selectedChatPartner.uid);
    setChatId(currentChatId); // Store the current chat ID

    const messagesQuery = query(
      collection(db, 'chats', currentChatId, 'messages'),
      orderBy('timestamp', 'asc'), // Order by asc to easily append new messages
      limit(50) // Consider pagination for very long chats
    );

    // Store the new unsubscribe function
    messageListenerUnsubscribe.current = onSnapshot(messagesQuery, (querySnapshot) => {
      const fetchedMessages: Message[] = [];
      let newMessagesReceived = false; // Track if new messages were added in this snapshot

      querySnapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
              newMessagesReceived = true;
              const data = change.doc.data();
              const message = { ...data, id: change.doc.id } as Message;

               // Basic validation for timestamp
              if (!message.timestamp || typeof message.timestamp.toDate !== 'function') {
                  console.warn("Message missing or invalid timestamp:", change.doc.id, data);
                   // Assign a server timestamp if missing, or handle appropriately
                   message.timestamp = Timestamp.now();
              }


              // Check if message is new *after* initial load and not from current user
              // Display notification logic
              if (!isInitialMessagesLoad.current && message.uid !== user?.uid) {
                   // Show notification using toast if the document (tab/window) is hidden
                   if (document.hidden) {
                        toast({
                            title: `New message from ${message.displayName || 'User'}`,
                            description: message.text.substring(0, 50) + (message.text.length > 50 ? '...' : ''),
                            // Optional: Add an action to focus the window/tab or navigate to the chat
                        });
                   }
              }
              fetchedMessages.push(message);
          }
          // Handle 'modified' or 'removed' changes if necessary
      });


       // Append new messages and sort correctly (though 'asc' query helps)
       setMessages(prevMessages => {
           // Create a map of existing messages to avoid duplicates if snapshot re-runs
           const messageMap = new Map(prevMessages.map(m => [m.id, m]));
           fetchedMessages.forEach(m => messageMap.set(m.id, m));
           // Sort again ensures order, especially if timestamps are very close
           return Array.from(messageMap.values()).sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
       });


      setLoadingMessages(false);

      // Scroll to bottom only if new messages were added or it's the initial load
      if (newMessagesReceived || isInitialMessagesLoad.current) {
           // Scroll to bottom after messages load or update
           setTimeout(() => scrollToBottom(), 100); // Add a small delay
      }

      // After processing the first snapshot, mark initial load as complete
      isInitialMessagesLoad.current = false;


    }, (error) => {
        console.error("Error fetching messages:", error);
        setLoadingMessages(false);
        isInitialMessagesLoad.current = false; // Ensure flag is reset on error too
        messageListenerUnsubscribe.current = null; // Clear ref on error
        toast({
            title: "Error",
            description: "Could not fetch messages.",
            variant: "destructive",
        });
    });

    // Cleanup message subscription on component unmount
     return () => {
        if (messageListenerUnsubscribe.current) {
          messageListenerUnsubscribe.current();
        }
      };

  }, [user, selectedChatPartner, toast]); // Re-run when user or selected chat partner changes


   // Auto-scrolling effect
   const scrollToBottom = () => {
    if (viewportRef.current) {
      // Use scrollIntoView on a dummy element at the end for potentially smoother scrolling
      // const endElement = document.getElementById('chat-end');
      // endElement?.scrollIntoView({ behavior: 'smooth' });
      // Or stick to scrollTop:
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  };


  const handleSelectUser = (partner: UserProfile) => {
     if (selectedChatPartner?.uid !== partner.uid) { // Only proceed if a different user is selected
        setSelectedChatPartner(partner);
        // Reset message loading state immediately for better UX
        setMessages([]);
        setLoadingMessages(true);
        isInitialMessagesLoad.current = true; // Reset flag when switching chats
        setChatId(null); // Reset chat ID until new one is determined in useEffect
      }
  };

   // Filter users based on search term
   const filteredUsers = users.filter(u =>
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );


  return (
    <div className="flex h-screen bg-secondary">
       {/* Sidebar for User List */}
       <aside className="w-64 flex flex-col border-r bg-background shadow-md">
         {/* Sidebar Header */}
         <header className="flex items-center justify-between p-4 border-b">
             <div className="flex items-center gap-2 overflow-hidden"> {/* Added overflow-hidden */}
                <Avatar className="h-8 w-8 flex-shrink-0"> {/* Added flex-shrink-0 */}
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || 'User'} data-ai-hint="user profile avatar"/>
                    <AvatarFallback>{getInitials(user?.displayName)}</AvatarFallback>
                </Avatar>
                <span className="font-semibold text-foreground truncate flex-1 min-w-0">{user?.displayName || user?.email || 'Chat User'}</span> {/* Added truncate, flex-1, min-w-0 */}
             </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="flex-shrink-0"> {/* Added flex-shrink-0 */}
              <LogOut className="h-5 w-5" />
            </Button>
         </header>

         {/* Search Input */}
         <div className="p-3 border-b">
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search users..."
                    className="pl-8 h-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search for users"
                />
            </div>
         </div>

          {/* User List */}
         <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
                 {loadingUsers && (
                     <>
                        {/* Consistent Skeleton Loaders */}
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center space-x-3 p-2">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-[150px]" />
                                </div>
                            </div>
                        ))}
                     </>
                 )}
                 {!loadingUsers && filteredUsers.length === 0 && (
                    <p className="p-4 text-sm text-center text-muted-foreground">
                        {searchTerm ? "No users found matching your search." : "No other users available to chat."}
                    </p>
                 )}
                 {!loadingUsers && filteredUsers.map((u) => (
                    <Button
                        key={u.uid}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start h-auto py-2 px-3 text-left",
                            selectedChatPartner?.uid === u.uid ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:bg-muted/50" // Improved hover and active states
                        )}
                        onClick={() => handleSelectUser(u)}
                        aria-pressed={selectedChatPartner?.uid === u.uid} // Accessibility
                    >
                        <Avatar className="h-8 w-8 mr-3">
                            <AvatarImage src={u.photoURL || undefined} alt={u.displayName || 'User'} data-ai-hint="user avatar"/>
                            <AvatarFallback>{getInitials(u.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col w-full truncate min-w-0"> {/* Ensure truncation works */}
                            <span className="font-medium truncate">{u.displayName || u.email || 'Unnamed User'}</span>
                             {/* Optional: Show last message snippet or online status here */}
                        </div>
                    </Button>
                 ))}
            </div>
         </ScrollArea>
       </aside>

       {/* Main Chat Area */}
       <main className="flex-1 flex flex-col bg-background">
            {selectedChatPartner ? (
                 <>
                 {/* Chat Header */}
                 <header className="flex items-center gap-3 p-4 border-b shadow-sm bg-card">
                    <Avatar className="h-9 w-9">
                        <AvatarImage src={selectedChatPartner.photoURL || undefined} alt={selectedChatPartner.displayName || 'User'} data-ai-hint="chat partner avatar"/>
                        <AvatarFallback>{getInitials(selectedChatPartner.displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="font-semibold text-card-foreground">{selectedChatPartner.displayName || selectedChatPartner.email}</span>
                        {/* Optional: Display online status or last seen */}
                        {/* <span className="text-xs text-muted-foreground">Online</span> */}
                    </div>
                 </header>

                {/* Message List */}
                <ScrollArea className="flex-1" ref={scrollAreaRef}>
                    {/* Viewport div for scrolling */}
                    <div ref={viewportRef} className="flex flex-col min-h-full p-4 space-y-2">
                        {/* Spacer div to push messages up when content is short */}
                        {messages.length > 0 && <div className="flex-grow" />}

                        {loadingMessages && messages.length === 0 && ( // Show skeletons only if messages are truly empty initially
                            <div className="space-y-4 p-4">
                                <Skeleton className="h-16 w-3/4 rounded-lg" />
                                <Skeleton className="h-16 w-3/4 ml-auto rounded-lg" />
                                <Skeleton className="h-16 w-2/3 rounded-lg" />
                            </div>
                        )}
                        {!loadingMessages && messages.length === 0 && (
                             <div className="flex-grow flex items-center justify-center">
                                <div className="text-center text-muted-foreground">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-2" />
                                    <p>No messages yet.</p>
                                    <p className="text-sm">Start the conversation with {selectedChatPartner.displayName || selectedChatPartner.email}!</p>
                                </div>
                             </div>
                        )}
                        {/* Always render messages if they exist, even while loading new ones */}
                        {messages.map((msg) => (
                            <ChatMessage key={msg.id} message={msg} />
                        ))}
                         {/* Dummy element for scrolling */}
                         {/* <div id="chat-end" /> */}
                    </div>
                </ScrollArea>


                {/* Chat Input */}
                <ChatInput chatId={chatId} />
                </>
            ) : (
                 // Placeholder when no chat is selected
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
                    <Users className="h-16 w-16 mb-4 text-primary" /> {/* Use Users icon */}
                    <h2 className="text-xl font-semibold text-foreground mb-1">Welcome to Chat!</h2>
                    <p className="text-base mb-4">Select a user from the list on the left to begin a conversation.</p>
                     {/* Suggestion for mobile */}
                    <p className="text-sm md:hidden">Tap the menu icon to open the user list.</p>
                </div>
            )}
       </main>
    </div>
  );
}
