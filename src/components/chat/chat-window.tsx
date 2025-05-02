
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
    const nameParts = name.split(' ');
    if (nameParts.length > 1 && nameParts[0].length > 0 && nameParts[1].length > 0) {
      return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '';
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
    if (!user || !selectedChatPartner) {
        setMessages([]); // Clear messages if no chat is selected
        setLoadingMessages(false);
        setChatId(null);
        isInitialMessagesLoad.current = true; // Reset initial load flag
        return;
    }

    setLoadingMessages(true);
    isInitialMessagesLoad.current = true; // Set flag for initial load
    const currentChatId = getChatId(user.uid, selectedChatPartner.uid);
    setChatId(currentChatId); // Store the current chat ID

    const messagesQuery = query(
      collection(db, 'chats', currentChatId, 'messages'),
      orderBy('timestamp', 'desc'), // Order by desc initially to easily check latest
      limit(50)
    );

    const unsubscribeMessages = onSnapshot(messagesQuery, (querySnapshot) => {
      const fetchedMessages: Message[] = [];
      let newMessagesCount = 0; // Count new messages for notification logic

      querySnapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
              const data = change.doc.data();
              const message = { ...data, id: change.doc.id } as Message;

               // Basic validation for timestamp
              if (!message.timestamp || typeof message.timestamp.toDate !== 'function') {
                  console.warn("Message missing or invalid timestamp:", change.doc.id, data);
                   // Assign a default or handle appropriately
                   message.timestamp = Timestamp.now(); // Or null, depending on requirements
              }


              // Check if message is new *after* initial load and not from current user
              if (!isInitialMessagesLoad.current && message.uid !== user.uid) {
                   newMessagesCount++;
                   // Show notification if document is hidden (user is likely in another tab/window)
                   if (document.hidden) {
                        toast({
                            title: `New message from ${message.displayName || 'User'}`,
                            description: message.text.substring(0, 50) + (message.text.length > 50 ? '...' : ''),
                            // Optional: Add action to switch to chat?
                        });
                   }
              }
              fetchedMessages.push(message);
          }
      });


       // Combine new messages with existing ones and sort correctly
       setMessages(prevMessages => {
           const messageMap = new Map(prevMessages.map(m => [m.id, m]));
           fetchedMessages.forEach(m => messageMap.set(m.id, m));
           return Array.from(messageMap.values()).sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
       });


      setLoadingMessages(false);

      // Scroll to bottom only if new messages were added or it's the initial load
      if (newMessagesCount > 0 || isInitialMessagesLoad.current) {
           // Scroll to bottom after messages load or update
           setTimeout(() => scrollToBottom(), 100); // Add a small delay
      }

      // After processing the first snapshot, mark initial load as complete
      isInitialMessagesLoad.current = false;


    }, (error) => {
        console.error("Error fetching messages:", error);
        setLoadingMessages(false);
        isInitialMessagesLoad.current = false; // Ensure flag is reset on error too
        toast({
            title: "Error",
            description: "Could not fetch messages.",
            variant: "destructive",
        });
    });

    // Cleanup message subscription on chat change or unmount
    return () => unsubscribeMessages();

  }, [user, selectedChatPartner, toast]); // Re-run when chat partner changes


   // Auto-scrolling effect
   const scrollToBottom = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  };


  const handleSelectUser = (partner: UserProfile) => {
    setSelectedChatPartner(partner);
    // Reset message loading state immediately for better UX
    setMessages([]);
    setLoadingMessages(true);
    isInitialMessagesLoad.current = true; // Reset flag when switching chats
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
             <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || 'User'} data-ai-hint="user profile avatar"/>
                    <AvatarFallback>{getInitials(user?.displayName)}</AvatarFallback>
                </Avatar>
                <span className="font-semibold text-foreground truncate">{user?.displayName || user?.email || 'Chat User'}</span>
             </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
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
                />
            </div>
         </div>

          {/* User List */}
         <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
                 {loadingUsers && (
                     <>
                        <Skeleton className="h-12 w-full rounded-md" />
                        <Skeleton className="h-12 w-full rounded-md" />
                        <Skeleton className="h-12 w-full rounded-md" />
                     </>
                 )}
                 {!loadingUsers && filteredUsers.length === 0 && (
                    <p className="p-4 text-sm text-center text-muted-foreground">
                        {searchTerm ? "No users found." : "No other users available."}
                    </p>
                 )}
                 {!loadingUsers && filteredUsers.map((u) => (
                    <Button
                        key={u.uid}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start h-auto py-2 px-3 text-left",
                            selectedChatPartner?.uid === u.uid && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => handleSelectUser(u)}
                    >
                        <Avatar className="h-8 w-8 mr-3">
                            <AvatarImage src={u.photoURL || undefined} alt={u.displayName || 'User'} data-ai-hint="user avatar"/>
                            <AvatarFallback>{getInitials(u.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col w-full truncate">
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
                    {/* Wrap content in a div that can be targeted for scroll height */}
                    <div ref={viewportRef} className="h-full p-4 space-y-2">
                        {loadingMessages && messages.length === 0 && ( // Show skeletons only if messages are truly empty initially
                            <div className="space-y-4 p-4">
                                <Skeleton className="h-16 w-3/4" />
                                <Skeleton className="h-16 w-3/4 ml-auto" />
                                <Skeleton className="h-16 w-2/3" />
                            </div>
                        )}
                        {!loadingMessages && messages.length === 0 && (
                            <div className="flex items-center justify-center h-full">
                            <p className="text-muted-foreground">Start chatting with {selectedChatPartner.displayName || selectedChatPartner.email}!</p>
                            </div>
                        )}
                        {/* Always render messages if they exist, even while loading new ones */}
                        {messages.length > 0 && messages.map((msg) => (
                            <ChatMessage key={msg.id} message={msg} />
                        ))}
                    </div>
                </ScrollArea>


                {/* Chat Input */}
                <ChatInput chatId={chatId} />
                </>
            ) : (
                 // Placeholder when no chat is selected
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <MessageSquare className="h-16 w-16 mb-4" />
                    <p className="text-lg font-medium">Select a user to start chatting</p>
                    <p className="text-sm">Choose someone from the list on the left.</p>
                </div>
            )}
       </main>
    </div>
  );
}
