
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, limit, where, addDoc, serverTimestamp, doc, getDoc, setDoc, Timestamp, type Unsubscribe, type FirestoreError } from 'firebase/firestore';
import type { Message, UserProfile } from '@/types'; // Import UserProfile
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut, Users, MessageSquare, Search, CircleDot } from 'lucide-react'; // Added CircleDot
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from '@/components/ui/input'; // Import Input for search
import { Separator } from '@/components/ui/separator'; // Import Separator
import { cn } from '@/lib/utils'; // Import cn for conditional classes
import { useToast } from "@/hooks/use-toast"; // Import useToast
import { updateUserProfileDocument, createOrUpdateUserProfile } from '@/lib/user-profile.service'; // Import the services
import { isFirebaseError } from '@/lib/firebase-errors'; // Import the error checking utility
import { formatDistanceToNowStrict } from 'date-fns'; // Use strict format for online status


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

// Helper to determine online status based on lastSeen timestamp
const isOnline = (lastSeen: Timestamp | Date | undefined): boolean => {
    if (!lastSeen) return false;
    const lastSeenDate = lastSeen instanceof Timestamp ? lastSeen.toDate() : lastSeen;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes tolerance
    return lastSeenDate > fiveMinutesAgo;
};

// Helper to format last seen time or 'Online'
const formatLastSeen = (lastSeen: Timestamp | Date | undefined): string => {
    if (isOnline(lastSeen)) {
        return 'Online';
    }
    if (!lastSeen) return ''; // No data
    const lastSeenDate = lastSeen instanceof Timestamp ? lastSeen.toDate() : lastSeen;
    // Use strict formatting for brevity, e.g., "5m", "2h", "3d"
    return formatDistanceToNowStrict(lastSeenDate, { addSuffix: true });
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
  const isInitialMessagesLoadForScroll = useRef(true); // Ref to track initial message load ONLY for auto-scrolling
  const messageListenerUnsubscribe = useRef<Unsubscribe | null>(null); // Ref for unsubscribe function
  const userListenerUnsubscribe = useRef<Unsubscribe | null>(null); // Ref for user listener unsubscribe

   // Auto-scrolling effect: Scrolls the viewport to the bottom
   const scrollToBottom = useCallback(() => {
    if (viewportRef.current) {
      // Using scrollTop ensures we scroll the container itself
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      // console.log("Scrolled to bottom"); // Debug log
    }
  }, []);


   // Update user presence (lastSeen) periodically and on focus
   useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isFocused = typeof document !== 'undefined' ? document.hasFocus() : true; // Assume focus on server

    const updateUserPresence = async (reason: string) => {
        if (!user?.uid) {
          // console.log(`Presence update skipped (${reason}): No user.`);
          return;
        }
         // Check if db is available before calling the service
         if (!db) {
           console.warn(`Presence update skipped for ${user.uid} (${reason}): DB service not ready.`);
           return;
         }

        try {
           // console.log(`Updating presence for ${user.uid} (${reason})...`);
           // IMPORTANT: Pass the string 'SERVER_TIMESTAMP' to the server action
           await updateUserProfileDocument(user.uid, { lastSeen: 'SERVER_TIMESTAMP' });
           // console.log(`Presence updated for ${user.uid} (${reason}).`);
        } catch (error: any) {
           // Log the detailed error from the service function
           console.error(`🔴 Error updating user presence for ${user.uid} (${reason}):`, error.message, error);
           // Optional: Show a less technical toast to the user
           toast({
               title: "Presence Error",
               description: `Could not update online status. Please check console for details.`,
               variant: "destructive",
               duration: 5000,
           });
        }
      };


    // Initial update
    const initialTimeoutId = setTimeout(() => updateUserPresence('initial'), 1500);

    // Periodic update
    intervalId = setInterval(() => updateUserPresence('interval'), 4 * 60 * 1000); // Every 4 minutes

    // Update when window gains focus
    const handleFocus = () => {
        if (!isFocused) {
            // console.log('Window gained focus');
            isFocused = true;
            updateUserPresence('focus');
        }
    };

    // Track when window loses focus (useful for knowing when to show notifications)
    const handleBlur = () => {
        // console.log('Window lost focus');
        isFocused = false;
        // Optionally update presence immediately on blur?
        // updateUserPresence('blur');
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);
    }

    // Cleanup
    return () => {
      clearTimeout(initialTimeoutId);
      if (intervalId) clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('blur', handleBlur);
      }
    };
  }, [user, toast]); // Depend on user and toast


  // Fetch users from Firestore 'users' collection
  useEffect(() => {
    // Cleanup previous listener
    if (userListenerUnsubscribe.current) {
      console.log("Unsubscribing from Firestore 'users' listener.");
      userListenerUnsubscribe.current();
      userListenerUnsubscribe.current = null;
    }

    if (!user) {
      console.log("User fetching skipped: No authenticated user.");
      setUsers([]);
      setLoadingUsers(false);
      return;
    }
    if (!db) {
      console.log("User fetching skipped: Firestore DB service not ready yet.");
      setUsers([]);
      setLoadingUsers(true); // Keep loading until db is ready
      return;
    }

    setLoadingUsers(true);
    console.log(`Setting up Firestore listener for 'users' collection, excluding self: ${user.uid}`);
    // Query all users including the current user initially
    const usersQuery = query(collection(db, 'users')); // Get all users

    // Store the new unsubscribe function
    userListenerUnsubscribe.current = onSnapshot(usersQuery, (snapshot) => {
      console.log(`Firestore 'users' snapshot received. Docs count: ${snapshot.docs.length}`);
      if (snapshot.empty) {
        console.log("No user documents found in 'users' collection.");
      }

      const fetchedUsers: UserProfile[] = snapshot.docs
        .map(doc => {
          const data = doc.data();
          // Validate essential fields
          if (!data.uid || typeof data.uid !== 'string') {
            console.warn("Fetched user document missing or invalid UID:", doc.id, data);
            return null; // Skip this document
          }
          return {
            uid: data.uid,
            displayName: data.displayName ?? null,
            email: data.email ?? null,
            photoURL: data.photoURL ?? null,
            status: data.status ?? null, // Add status field
            lastSeen: data.lastSeen instanceof Timestamp ? data.lastSeen : undefined, // Ensure it's a Timestamp or undefined
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
          };
        })
        .filter((u): u is UserProfile => u !== null && u.uid !== user.uid); // Filter out nulls AND the current user

      // Sort users: Online first, then alphabetically by displayName (case-insensitive, fallback to email)
      fetchedUsers.sort((a, b) => {
          const onlineA = isOnline(a.lastSeen);
          const onlineB = isOnline(b.lastSeen);
          if (onlineA && !onlineB) return -1; // Online users first
          if (!onlineA && onlineB) return 1;

          const nameA = (a.displayName || a.email || '').toLowerCase();
          const nameB = (b.displayName || b.email || '').toLowerCase();
          if (nameA < nameB) return -1;
          if (nameA > nameB) return 1;
          return 0;
      });

      // console.log(`Mapped, filtered, and sorted ${fetchedUsers.length} other users. UIDs:`, fetchedUsers.map(u => u.uid));
      setUsers(fetchedUsers);
      setLoadingUsers(false);

      // Update selectedChatPartner with fresh data if it exists in the new snapshot
      if (selectedChatPartner) {
          const updatedPartner = fetchedUsers.find(u => u.uid === selectedChatPartner.uid);
          if (updatedPartner) {
             setSelectedChatPartner(updatedPartner);
          } else {
              // Handle case where the selected partner is no longer in the list (e.g., deleted)
              console.warn(`Selected chat partner ${selectedChatPartner.uid} not found in latest snapshot.`);
              setSelectedChatPartner(null);
              setChatId(null);
          }
      }


    }, (error: FirestoreError) => { // Use FirestoreError type
      console.error("🔴 Error fetching users from Firestore:", error.code, error.message, error);
      setLoadingUsers(false);
      userListenerUnsubscribe.current = null; // Clear ref on error
      toast({
        title: "Error Fetching Users",
        description: `Could not load user list: ${error.message} (${error.code})`,
        variant: "destructive",
      });
    });

    // Cleanup subscription on unmount or when user changes
    return () => {
      if (userListenerUnsubscribe.current) {
        console.log("Unsubscribing from Firestore 'users' listener on cleanup.");
        userListenerUnsubscribe.current();
        userListenerUnsubscribe.current = null;
      }
    };
  }, [user, toast]); // Re-run when user logs in/out or toast function changes (unlikely but safe)


  // Fetch messages when a chat partner is selected
  useEffect(() => {
     // Cleanup previous listener before setting up a new one
     if (messageListenerUnsubscribe.current) {
        console.log("Unsubscribing from previous messages listener.");
        messageListenerUnsubscribe.current();
        messageListenerUnsubscribe.current = null; // Reset the ref
      }

    if (!user || !selectedChatPartner || !db) { // Also check for db
        setMessages([]); // Clear messages
        setLoadingMessages(false);
        setChatId(null);
        isInitialMessagesLoadForScroll.current = true; // Reset initial scroll flag
        // console.log("Message fetching skipped: No chat partner selected or DB not ready.");
        return; // Exit early
    }

    setLoadingMessages(true);
    isInitialMessagesLoadForScroll.current = true; // Set flag for initial scroll
    const currentChatId = getChatId(user.uid, selectedChatPartner.uid);
    setChatId(currentChatId); // Store the current chat ID
    console.log(`Setting up messages listener for chat: ${currentChatId}`);

    const messagesQuery = query(
      collection(db, 'chats', currentChatId, 'messages'),
      orderBy('timestamp', 'asc'), // Order by ascending timestamp
      limit(100) // Consider pagination for very long chats
    );

    // Store the new unsubscribe function
    messageListenerUnsubscribe.current = onSnapshot(messagesQuery, (querySnapshot) => {
       const newMessagesBatch: Message[] = []; // Collect new messages from this snapshot
       let newMessagesAdded = false; // Track if actual new messages were added in this snapshot

       querySnapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
              const data = change.doc.data();
              // Basic validation
              if (!data.text || !data.uid || !(data.timestamp instanceof Timestamp)) {
                 console.warn("Skipping invalid message:", change.doc.id, data);
                 return;
              }

               const message: Message = {
                  id: change.doc.id,
                  text: data.text,
                  timestamp: data.timestamp, // Already validated as Timestamp
                  uid: data.uid,
                  displayName: data.displayName ?? null,
                  photoURL: data.photoURL ?? null,
               };
               newMessagesBatch.push(message);
               newMessagesAdded = true; // Mark that a new message was processed

                // --- Notification Logic ---
                // Show notification if:
                // 1. The message is NOT from the current user.
                // 2. The document/tab is currently hidden.
                 // 3. A chat partner IS selected (don't show for random messages if no chat is active)
                 const isDifferentUser = message.uid !== user?.uid;
                 const isTabHidden = typeof document !== 'undefined' && document.hidden;
                 const isChatSelected = !!selectedChatPartner; // True if a partner is selected

                if (isDifferentUser && isTabHidden && isChatSelected) {
                     console.log(`New message from ${message.displayName || 'User'} while tab hidden. Showing toast.`);
                     toast({
                         title: `New message from ${message.displayName || 'User'}`,
                         description: message.text.substring(0, 50) + (message.text.length > 50 ? '...' : ''),
                         duration: 5000, // Show for 5 seconds
                     });
                     // Also update the document title to indicate a new message
                      if (typeof document !== 'undefined' && !document.title.startsWith('(*)')) {
                           document.title = `(*) ${document.title}`;
                      }
                } else {
                    // console.log("New message received while tab visible, from self, or no chat selected. No toast/title update.");
                }
          }
          // Handle 'modified' or 'removed' if needed
       });

       // Update state efficiently and ensure correct order ONLY if new messages were added
       if (newMessagesAdded) {
           setMessages(prevMessages => {
               const existingIds = new Set(prevMessages.map(m => m.id));
               const trulyNewMessages = newMessagesBatch.filter(m => !existingIds.has(m.id));
               if (trulyNewMessages.length === 0) return prevMessages; // No actual new messages to add

               const combined = [...prevMessages, ...trulyNewMessages];
               // Ensure final sort order by timestamp
               return combined.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
           });
       }

       setLoadingMessages(false);

        // Scroll to bottom logic
        setTimeout(() => {
            // Scroll only if it's the initial load OR if new messages were actually added
            // AND the document is currently VISIBLE
             // AND a chat partner IS selected
            const shouldScroll = (isInitialMessagesLoadForScroll.current || newMessagesAdded)
                                  && typeof document !== 'undefined' && !document.hidden
                                  && !!selectedChatPartner;

            if (shouldScroll) {
                 // console.log(`Scrolling to bottom. Initial scroll flag: ${isInitialMessagesLoadForScroll.current}, New msgs added: ${newMessagesAdded}, Doc hidden: ${document?.hidden}`);
                 scrollToBottom();
            } else {
                 // console.log(`Scroll skipped. Initial scroll flag: ${isInitialMessagesLoadForScroll.current}, New msgs added: ${newMessagesAdded}, Doc hidden: ${document?.hidden}`);
            }

            // Mark initial scroll flag as complete *after* the first snapshot processing where messages were potentially added
            if (isInitialMessagesLoadForScroll.current && newMessagesAdded) {
                 // console.log(`Initial message scroll check complete for chat ${currentChatId}.`);
                 isInitialMessagesLoadForScroll.current = false;
            }
        }, 100); // Small delay often helps

    }, (error: FirestoreError) => {
        console.error(`🔴 Error fetching messages for chat ${currentChatId}:`, error.code, error.message, error);
        setLoadingMessages(false);
        isInitialMessagesLoadForScroll.current = false; // Ensure flag is reset on error
        messageListenerUnsubscribe.current = null; // Clear ref on error
        toast({
            title: "Error Fetching Messages",
            description: `Could not load messages: ${error.message} (${error.code})`,
            variant: "destructive",
        });
    });

    // Cleanup function for this effect
     return () => {
        if (messageListenerUnsubscribe.current) {
          console.log(`Unsubscribing from messages listener for chat ${chatId ?? 'unknown'}`); // Log chatId safely
          messageListenerUnsubscribe.current();
          messageListenerUnsubscribe.current = null;
        }
      };

  }, [user, selectedChatPartner, toast, scrollToBottom]); // Add scrollToBottom to dependencies


  // Effect to remove the (*) from the title when the window/tab gains focus
  useEffect(() => {
    const handleFocus = () => {
        if (typeof document !== 'undefined' && document.title.startsWith('(*)')) {
            // console.log("Window focused, removing notification indicator from title.");
            document.title = document.title.replace(/^\(\*\)\s*/, ''); // Remove (*) prefix
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleFocus);
    }

    // Initial check in case the page loaded while hidden with unread messages
    handleFocus();

    // Cleanup
    return () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('focus', handleFocus);
        }
    };
  }, []); // Empty dependency array, runs once on mount


  // Handles selecting a user from the list
  const handleSelectUser = useCallback(async (partner: UserProfile) => {
     if (selectedChatPartner?.uid !== partner.uid && user?.uid) { // Only proceed if a *different* user is selected and current user exists
        console.log(`Selecting chat partner: ${partner.displayName || partner.email} (${partner.uid})`);
        setSelectedChatPartner(partner);
        // Reset state immediately for better perceived responsiveness
        setMessages([]);
        setLoadingMessages(true); // Indicate loading for the new chat
        isInitialMessagesLoadForScroll.current = true; // Reset flag for the new chat's initial scroll
        const newChatId = getChatId(user.uid, partner.uid);
        setChatId(newChatId); // Set the new chat ID

        // Ensure the chat document exists in Firestore.
        // This helps if users haven't chatted before.
        if (db) {
            const chatDocRef = doc(db, 'chats', newChatId);
            try {
                const chatDocSnap = await getDoc(chatDocRef);
                if (!chatDocSnap.exists()) {
                     console.log(`Chat document ${newChatId} does not exist. Creating...`);
                    // Create the chat document with participants array (optional, but good practice)
                    await setDoc(chatDocRef, {
                        participants: [user.uid, partner.uid],
                        createdAt: serverTimestamp() // Use actual serverTimestamp
                    });
                    console.log(`Chat document ${newChatId} created.`);
                }
            } catch (error) {
                console.error(`Error ensuring chat document ${newChatId} exists:`, error);
                toast({
                    title: "Chat Error",
                    description: "Could not initialize chat session.",
                    variant: "destructive"
                });
            }
        }

        // Clear search term when a user is selected? Optional UX choice.
        // setSearchTerm('');
      } else {
          console.log(`User ${partner.displayName || partner.email} is already selected or current user is missing.`);
      }
  }, [selectedChatPartner?.uid, user?.uid, toast]); // Dependencies


   // Filter users based on search term (case-insensitive)
   const filteredUsers = users.filter(u =>
    (u.displayName && u.displayName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );


  // --- JSX ---
  return (
     // Adjusted height: screen height minus header height (h-14 is theme(spacing.14))
    <div className="flex h-[calc(100vh-theme(spacing.14))] bg-secondary">
       {/* ====== Sidebar for User List ====== */}
       <aside className="w-64 flex flex-col border-r bg-background shadow-md">
         {/* --- Sidebar Header --- */}
         <header className="flex items-center justify-between p-4 border-b min-h-[65px]"> {/* Ensure consistent height */}
             <div className="flex items-center gap-2 overflow-hidden mr-2"> {/* Allow space for button */}
                <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || 'My Avatar'} data-ai-hint="current user profile avatar"/>
                    <AvatarFallback>{getInitials(user?.displayName || user?.email)}</AvatarFallback>
                </Avatar>
                {/* Use tooltip for long names? */}
                <span className="font-semibold text-foreground truncate flex-1 min-w-0 text-sm">{user?.displayName || user?.email || 'User'}</span>
             </div>
            {/* Sign Out Button */}
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="flex-shrink-0 text-muted-foreground hover:text-destructive h-8 w-8">
              <LogOut className="h-4 w-4" />
            </Button>
         </header>

         {/* --- Search Input --- */}
         <div className="p-3 border-b">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search users..."
                    className="pl-8 h-9 bg-muted/50 focus:bg-background"
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
                        {[...Array(6)].map((_, i) => ( // Consistent skeleton layout
                            <div key={i} className="flex items-center space-x-3 p-2 h-[52px]">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                            </div>
                        ))}
                     </div>
                 )}
                 {/* Empty State (No Users or No Search Results) */}
                 {!loadingUsers && filteredUsers.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                         <Users className="h-10 w-10 mb-3 text-primary/70" />
                        <p className="text-sm font-medium">
                            {searchTerm ? "No users found" : (users.length === 0 ? "No other users available" : "No users found matching search")}
                        </p>
                         {searchTerm && <p className="text-xs mt-1">Try a different name or email.</p>}
                         {!searchTerm && users.length === 0 && <p className="text-xs mt-1">Invite others or wait for them to join!</p>}
                    </div>
                 )}
                 {/* User Buttons */}
                 {!loadingUsers && filteredUsers.map((u) => (
                     <Button
                        key={u.uid}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start h-auto py-2 px-3 text-left rounded-md",
                            "gap-3 items-center relative", // Added relative for status dot positioning
                            selectedChatPartner?.uid === u.uid ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:bg-muted/50"
                        )}
                        onClick={() => handleSelectUser(u)}
                        aria-pressed={selectedChatPartner?.uid === u.uid}
                    >
                        {/* Online Status Dot */}
                        {isOnline(u.lastSeen) && (
                            <span className="absolute left-1 top-1.5 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" aria-label="Online"/>
                        )}
                        <Avatar className="h-8 w-8 flex-shrink-0 ml-1"> {/* Adjusted margin for dot */}
                            <AvatarImage src={u.photoURL || undefined} alt={u.displayName || 'User Avatar'} data-ai-hint="user chat list avatar"/>
                            <AvatarFallback>{getInitials(u.displayName || u.email)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col flex-1 min-w-0"> {/* Truncation container */}
                            <span className="font-medium truncate text-sm">{u.displayName || u.email || 'Unnamed User'}</span>
                            {/* Display Status if available and user is NOT online */}
                            {!isOnline(u.lastSeen) && u.status && (
                                <span className="text-xs text-muted-foreground truncate italic">
                                    {u.status}
                                </span>
                            )}
                             {/* Display Last Seen if NOT online and NO status */}
                             {!isOnline(u.lastSeen) && !u.status && u.lastSeen && (
                                 <span className="text-xs text-muted-foreground truncate">
                                     {formatLastSeen(u.lastSeen)}
                                 </span>
                             )}
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
                    <div className="relative">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={selectedChatPartner.photoURL || undefined} alt={selectedChatPartner.displayName || 'Chat partner avatar'} data-ai-hint="chat partner avatar"/>
                            <AvatarFallback>{getInitials(selectedChatPartner.displayName || selectedChatPartner.email)}</AvatarFallback>
                        </Avatar>
                         {/* Online Status Dot in Header */}
                        {isOnline(selectedChatPartner.lastSeen) && (
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card border border-background" aria-label="Online"/>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-card-foreground">{selectedChatPartner.displayName || selectedChatPartner.email}</span>
                         {/* Display Status or Last Seen in Header */}
                        <span className="text-xs text-muted-foreground">
                           {isOnline(selectedChatPartner.lastSeen)
                               ? (selectedChatPartner.status || 'Online') // Show status if online, else 'Online'
                               : (selectedChatPartner.status || formatLastSeen(selectedChatPartner.lastSeen)) // Show status if offline, else last seen
                           }
                        </span>
                    </div>
                 </header>

                {/* --- Message List --- */}
                {/* Wrap ScrollArea in a flex-1 container to make it fill space */}
                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full" ref={scrollAreaRef}>
                         {/* Viewport takes full height of ScrollArea */}
                        <div ref={viewportRef} className="h-full flex flex-col p-4 space-y-2">
                             {/* Spacer grows to push messages down */}
                            <div className="flex-grow" />

                            {/* Loading Skeletons */}
                            {loadingMessages && messages.length === 0 && (
                                <div className="space-y-4 p-4">
                                    {[...Array(4)].map((_, i) => (
                                        <React.Fragment key={i}>
                                         <Skeleton className={cn("h-12 rounded-lg", i % 2 === 0 ? "w-3/5 self-start" : "w-3/4 self-end")}/>
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                            {/* Empty Chat Placeholder */}
                            {!loadingMessages && messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-6">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-3 text-primary/80" />
                                    <p className="font-medium">Start your conversation!</p>
                                    <p className="text-sm">Send a message to {selectedChatPartner.displayName || selectedChatPartner.email}.</p>
                                </div>
                            )}
                            {/* Render Messages */}
                            <div className="pb-4"> {/* Padding at the bottom */}
                                {messages.map((msg) => (
                                    <ChatMessage key={msg.id} message={msg} />
                                ))}
                            </div>
                             {/* Dummy element for scrollIntoView (alternative if scrollTop fails) */}
                             {/* <div ref={messagesEndRef} /> */}
                        </div>
                    </ScrollArea>
                </div>

                {/* --- Chat Input --- */}
                <ChatInput chatId={chatId} />
                </>
            ) : (
                 // ====== Placeholder when no chat is selected ======
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8 bg-gradient-to-br from-background to-muted/30">
                    <Users className="h-16 w-16 mb-4 text-primary opacity-80" />
                    <h2 className="text-xl font-semibold text-foreground mb-1">Select a Chat</h2>
                    <p className="text-base mb-4 max-w-xs">Choose someone from the list on the left to start messaging.</p>
                </div>
            )}
       </main>
    </div>
  );
}

