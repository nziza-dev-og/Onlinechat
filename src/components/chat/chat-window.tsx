
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { app, db as firebaseDb } from '@/lib/firebase'; // Import app and renamed db
import { collection, query, orderBy, onSnapshot, limit, where, addDoc, serverTimestamp, doc, getDoc, setDoc, Timestamp, updateDoc, type Unsubscribe, type FirestoreError, getFirestore, type Firestore } from 'firebase/firestore'; // Keep full imports here
import type { Message, UserProfile, Chat } from '@/types';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth'; // Import useAuth hook
import { Button } from '@/components/ui/button';
import { LogOut, Users, MessageSquare, Search, CircleDot, Video as VideoIcon, Circle, Menu } from 'lucide-react'; // Added Circle, Menu
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";
import { updateUserProfileDocument } from '@/lib/user-profile.service';
import { isFirebaseError } from '@/lib/firebase-errors';
import { formatDistanceToNowStrict } from 'date-fns';
import { updateTypingStatus } from '@/lib/chat.service';
import { VideoCallModal } from '@/components/chat/video-call-modal'; // Import VideoCallModal
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Import Card components
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'; // Import Sheet for mobile sidebar


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
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedChatPartner, setSelectedChatPartner] = useState<UserProfile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null); // State for replying
  const [isVideoButtonDisabled, setIsVideoButtonDisabled] = useState(true); // Disable video button initially
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false); // State for video call modal
  const [dbInstance, setDbInstance] = useState<Firestore | null>(null); // Hold Firestore instance
  const [hasUnreadMap, setHasUnreadMap] = useState<Map<string, boolean>>(new Map()); // Track unread status per user UID
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false); // State for mobile sidebar sheet

  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth(); // Get signOut function from useAuth
  const isInitialMessagesLoadForScroll = useRef(true);
  const messageListenerUnsubscribe = useRef<Unsubscribe | null>(null);
  const userListenerUnsubscribe = useRef<Unsubscribe | null>(null);
  const chatDocListenerUnsubscribe = useRef<Unsubscribe | null>(null);


  // Initialize Firestore instance on mount
  useEffect(() => {
    try {
        // Use the db instance directly imported from firebase.ts
        // This assumes firebase.ts successfully initializes and exports db
        if (!firebaseDb) {
             throw new Error("Firestore service (db) is not available from firebase.ts");
        }
        setDbInstance(firebaseDb);
        console.log("Firestore instance obtained successfully from firebase.ts.");
    } catch (error: any) {
        console.error("🔴 Failed to get Firestore instance in ChatWindow:", error.message, error);
        toast({
            title: "Database Error",
            description: "Could not connect to the database. Chat features may be limited.",
            variant: "destructive",
            duration: 10000, // Make it persistent
        });
    }
  }, [toast]); // Only run on mount


   const scrollToBottom = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, []);

   // Function to set the message being replied to
   const handleSetReplyTo = useCallback((message: Message | null) => {
     setReplyingToMessage(message);
   }, []);

   // Function to clear the reply state
   const clearReply = useCallback(() => {
     setReplyingToMessage(null);
   }, []);


    // Update user presence (lastSeen) periodically and on focus
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;
        let isFocused = typeof document !== 'undefined' ? document.hasFocus() : true;
        let currentChatIdForCleanup: string | null = null; // Variable to hold chatId for cleanup

        const updateUserPresence = async (reason: string) => {
             if (!user?.uid) {
                 // console.log("Presence update skipped: No authenticated user.");
                 return;
             }
             // Check if dbInstance is available before proceeding
             if (!dbInstance) {
                 console.warn(`Presence update skipped for ${user.uid} (${reason}): DB instance not ready.`);
                 return;
             }

             try {
                 // Call the server action to update the profile
                 await updateUserProfileDocument(user.uid, {
                     lastSeen: 'SERVER_TIMESTAMP'
                 });
                 // console.log(`✅ User presence updated for ${user.uid} (${reason}).`);
             } catch (error: any) {
                 // Log the detailed error from the service function, but avoid redundant console.error if the service already logs
                 console.error(`🔴 Error updating user presence for ${user.uid} (${reason}): "${error.message}"`, error);
                 // Show a less technical toast to the user if it's not just a network blip
                 if (!error.message?.includes("Network Error")) { // Example check
                    toast({
                        title: "Presence Error",
                        description: `Could not update online status.`, // More generic message
                        variant: "destructive",
                        duration: 5000,
                    });
                 }
             }
        };

        // --- Presence Logic ---
        const initialTimeoutId = setTimeout(() => updateUserPresence('initial'), 1500);
        intervalId = setInterval(() => updateUserPresence('interval'), 4 * 60 * 1000); // 4 minutes

        const handleFocus = () => {
            if (!isFocused) {
                isFocused = true;
                updateUserPresence('focus');
                if (typeof document !== 'undefined' && document.title.startsWith('(*)')) {
                    document.title = document.title.replace(/^\(\*\)\s*/, '');
                }
            }
        };

        const handleBlur = async () => {
            isFocused = false;
            // Update currentChatIdForCleanup when chatId changes
            currentChatIdForCleanup = chatId;
            if (user?.uid && currentChatIdForCleanup && dbInstance) {
                try {
                    await updateTypingStatus(currentChatIdForCleanup, user.uid, false);
                } catch (typingError) {
                    console.error("Error clearing typing status on blur:", typingError);
                }
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('focus', handleFocus);
            window.addEventListener('blur', handleBlur);
        }
        handleFocus(); // Initial focus check


        return () => {
             console.log("Cleaning up presence and typing effect...");
             clearTimeout(initialTimeoutId);
             if (intervalId) clearInterval(intervalId);
             if (typeof window !== 'undefined') {
                 window.removeEventListener('focus', handleFocus);
                 window.removeEventListener('blur', handleBlur);
             }
             // Cleanup typing status on unmount using the captured chatId
              if (user?.uid && currentChatIdForCleanup && dbInstance) {
                  updateTypingStatus(currentChatIdForCleanup, user.uid, false)
                     .catch(err => console.error("Cleanup error for typing status:", err));
              }
         };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid, chatId, toast, dbInstance]); // Add dbInstance to dependency array


  // Fetch users from Firestore 'users' collection
  useEffect(() => {
    // Ensure cleanup runs if dependencies change or component unmounts
    const unsubscribe = userListenerUnsubscribe.current;
    return () => {
      if (unsubscribe) {
         console.log("Cleaning up Firestore 'users' listener.");
         unsubscribe();
         userListenerUnsubscribe.current = null;
      }
    };
  }, []); // Run cleanup only on unmount

  useEffect(() => {
    // Re-setup listener if dbInstance or user changes
    if (userListenerUnsubscribe.current) {
        console.log("Cleaning up previous 'users' listener before new setup.");
        userListenerUnsubscribe.current();
        userListenerUnsubscribe.current = null;
    }

    if (!user || !dbInstance) {
      setUsers([]);
      setLoadingUsers(!user || !dbInstance); // Loading if user or db is expected but not ready
      return;
    }

    setLoadingUsers(true);
    console.log(`Setting up Firestore listener for 'users' collection, excluding self: ${user.uid}`);
    const usersQuery = query(collection(dbInstance, 'users'));

    userListenerUnsubscribe.current = onSnapshot(usersQuery, (snapshot) => {
      const fetchedUsers: UserProfile[] = snapshot.docs
        .map(doc => {
          const data = doc.data();
          const uid = data.uid;
          if (!uid || typeof uid !== 'string') {
            console.warn("Fetched user document missing or invalid UID:", doc.id, data);
            return null;
          }

           const convertTimestamp = (ts: any): Timestamp | undefined => {
               if (ts instanceof Timestamp) return ts;
               if (ts && typeof ts.toDate === 'function') {
                   try { return Timestamp.fromDate(ts.toDate()); } catch { /* ignore */ }
               }
               return undefined;
           };

          return {
            uid: uid,
            displayName: data.displayName ?? null,
            email: data.email ?? null,
            photoURL: data.photoURL ?? null,
            status: data.status ?? null,
            lastSeen: convertTimestamp(data.lastSeen),
            createdAt: convertTimestamp(data.createdAt),
            isAdmin: data.isAdmin ?? false,
            passwordChangeRequested: data.passwordChangeRequested ?? false,
            passwordChangeApproved: data.passwordChangeApproved ?? false,
          };
        })
        .filter((u): u is UserProfile => u !== null && u.uid !== user.uid); // Exclude self and invalid docs

      fetchedUsers.sort((a, b) => {
          const onlineA = isOnline(a.lastSeen);
          const onlineB = isOnline(b.lastSeen);
          if (onlineA && !onlineB) return -1;
          if (!onlineA && onlineB) return 1;
          const nameA = (a.displayName || a.email || '').toLowerCase();
          const nameB = (b.displayName || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
      });

      setUsers(fetchedUsers);
      setLoadingUsers(false);
       console.log(`Firestore: Updated user list, count: ${fetchedUsers.length}`);

      if (selectedChatPartner) {
          const updatedPartner = fetchedUsers.find(u => u.uid === selectedChatPartner.uid);
          setSelectedChatPartner(updatedPartner || null);
          if (!updatedPartner) {
              console.warn(`Selected chat partner ${selectedChatPartner.uid} not found in latest snapshot.`);
              setChatId(null);
              setReplyingToMessage(null);
          }
      }

    }, (error: FirestoreError) => {
      console.error("🔴 Error fetching users from Firestore:", error.code, error.message, error);
      setLoadingUsers(false);
      userListenerUnsubscribe.current = null;
      toast({
        title: "Error Fetching Users",
        description: `Could not load user list: ${error.message} (${error.code})`,
        variant: "destructive",
      });
    });

    // Return statement in useEffect is for cleanup, handled by the first useEffect now
  }, [user, dbInstance, toast, selectedChatPartner?.uid]); // Add dbInstance


  // Fetch messages and listen to chat document for typing status
   useEffect(() => {
     // Ensure cleanup runs if dependencies change or component unmounts
     const unsubscribeMessages = messageListenerUnsubscribe.current;
     const unsubscribeChatDoc = chatDocListenerUnsubscribe.current;
     const chatIdForCleanup = chatId; // Capture chatId for cleanup

     return () => {
        if (unsubscribeMessages) {
           console.log(`Cleaning up message listener for chat ${chatIdForCleanup}.`);
           unsubscribeMessages();
           messageListenerUnsubscribe.current = null;
        }
        if (unsubscribeChatDoc) {
             console.log(`Cleaning up chat document listener for chat ${chatIdForCleanup}.`);
             unsubscribeChatDoc();
             chatDocListenerUnsubscribe.current = null;
        }
         // Reset typing status when changing chats or unmounting
         if (user?.uid && chatIdForCleanup && dbInstance) {
              updateTypingStatus(chatIdForCleanup, user.uid, false).catch(err => console.error("Cleanup error for typing status:", err));
         }
      };
   }, [chatId, user?.uid, dbInstance]); // Add dependencies chatId, user?.uid, dbInstance

   useEffect(() => {
    // Re-setup listeners if dependencies change
     if (messageListenerUnsubscribe.current) {
        console.log("Cleaning up previous message listener before new setup.");
        messageListenerUnsubscribe.current();
        messageListenerUnsubscribe.current = null;
      }
      if (chatDocListenerUnsubscribe.current) {
          console.log("Cleaning up previous chat document listener before new setup.");
          chatDocListenerUnsubscribe.current();
          chatDocListenerUnsubscribe.current = null;
      }

    if (!user || !selectedChatPartner || !dbInstance || !chatId) { // Ensure chatId is also set
        setMessages([]);
        setLoadingMessages(false);
        // Do not set chatId to null here, let handleSelectUser manage it
        setIsPartnerTyping(false);
        setReplyingToMessage(null);
        setIsVideoButtonDisabled(true);
        isInitialMessagesLoadForScroll.current = true;
        return;
    }

    setLoadingMessages(true);
    isInitialMessagesLoadForScroll.current = true;
    // chatId is now set by handleSelectUser
    setIsVideoButtonDisabled(false);
    // Clear unread status handled in handleSelectUser

     console.log(`Setting up listeners for chat: ${chatId}`);

    const messagesQuery = query(
      collection(dbInstance, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100) // Consider pagination
    );

    messageListenerUnsubscribe.current = onSnapshot(messagesQuery, (querySnapshot) => {
       const newMessagesBatch: Message[] = [];
       let newMessagesAdded = false;
       let hasNonPendingChanges = false;

       querySnapshot.docChanges().forEach((change) => {
          if (!change.doc.metadata.hasPendingWrites) {
            hasNonPendingChanges = true;
          }

          if (change.type === "added") {
              const data = change.doc.data();
               let timestamp: Timestamp | null = null;
               if (data.timestamp instanceof Timestamp) {
                   timestamp = data.timestamp;
               } else if (data.timestamp && typeof data.timestamp.toDate === 'function') {
                   try { timestamp = Timestamp.fromMillis(data.timestamp.toMillis()); } catch { /* ignore */ }
               }

               if (!timestamp || !data.uid) {
                  console.warn("Skipping invalid message (missing timestamp or uid):", change.doc.id, data);
                  return;
               }
               // Ensure some content exists
               if (!data.text && !data.imageUrl && !data.audioUrl && !data.videoUrl && !data.fileUrl) { // Added fileUrl check
                    console.warn("Skipping empty message:", change.doc.id, data);
                    return;
               }

               const message: Message = {
                  id: change.doc.id,
                  text: data.text ?? '',
                  imageUrl: data.imageUrl ?? null,
                  audioUrl: data.audioUrl ?? null,
                  videoUrl: data.videoUrl ?? null,
                  fileUrl: data.fileUrl ?? null,
                  fileName: data.fileName ?? null,
                  fileType: data.fileType ?? null,
                  timestamp: timestamp,
                  uid: data.uid,
                  displayName: data.displayName ?? null,
                  photoURL: data.photoURL ?? null,
                  replyToMessageId: data.replyToMessageId ?? null,
                  replyToMessageText: data.replyToMessageText ?? null,
                  replyToMessageAuthor: data.replyToMessageAuthor ?? null,
               };
               newMessagesBatch.push(message);
               newMessagesAdded = true;

               // --- Unread Message & Notification Logic ---
               const isFromOtherUser = message.uid !== user?.uid;
               const isTabHidden = typeof document !== 'undefined' && document.hidden;
               const isCurrentChatSelected = selectedChatPartner?.uid === message.uid; // Check if the current chat partner sent the message

               // Set unread status if message is from another user and the chat isn't currently selected OR tab is hidden
                if (isFromOtherUser && (!isCurrentChatSelected || isTabHidden)) {
                     setHasUnreadMap(prevMap => {
                        const newMap = new Map(prevMap);
                        if (!newMap.get(message.uid)) { // Only update if not already marked as unread
                             newMap.set(message.uid, true);
                             console.log(`Marked chat with user ${message.uid} as unread.`);
                        }
                        return newMap;
                     });
                }

               // Notify if from other user, tab is hidden, and this specific chat is selected (or maybe just if tab is hidden?)
               if (isFromOtherUser && isTabHidden && hasNonPendingChanges) {
                     const notificationText = message.text ? (message.text.substring(0, 50) + (message.text.length > 50 ? '...' : ''))
                                            : message.imageUrl ? 'Sent an image'
                                            : message.audioUrl ? 'Sent a voice note'
                                            : message.videoUrl ? 'Sent a video'
                                            : message.fileUrl ? 'Sent a file'
                                            : 'Sent a message';
                     const titlePrefix = '(*) ';
                     if (typeof document !== 'undefined' && !document.title.startsWith(titlePrefix)) {
                           document.title = titlePrefix + document.title;
                      }
                     toast({
                         title: `New message from ${message.displayName || 'User'}`,
                         description: notificationText,
                         duration: 5000,
                     });
               }
               // --- End Unread/Notification Logic ---
          }
       });

       if (newMessagesAdded) {
           setMessages(prevMessages => {
               const existingIds = new Set(prevMessages.map(m => m.id));
               const trulyNewMessages = newMessagesBatch.filter(m => !existingIds.has(m.id));
               if (trulyNewMessages.length === 0) return prevMessages;
               const combined = [...prevMessages, ...trulyNewMessages];
               return combined.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
           });
       }

       setLoadingMessages(false);

        setTimeout(() => {
            if (viewportRef.current) {
                const { scrollTop, scrollHeight, clientHeight } = viewportRef.current;
                 const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
                if (isNearBottom || isInitialMessagesLoadForScroll.current) {
                     scrollToBottom();
                }
            }
            if (isInitialMessagesLoadForScroll.current && newMessagesAdded) {
                 isInitialMessagesLoadForScroll.current = false;
            }
        }, 100);

    }, (error: FirestoreError) => {
        console.error(`🔴 Error fetching messages for chat ${chatId}:`, error.code, error.message, error);
        setLoadingMessages(false);
        isInitialMessagesLoadForScroll.current = false;
        messageListenerUnsubscribe.current = null;
        toast({
            title: "Error Fetching Messages",
            description: `Could not load messages: ${error.message} (${error.code})`,
            variant: "destructive",
        });
    });

    // Listener for typing status
    const chatDocRef = doc(dbInstance, 'chats', chatId);
    chatDocListenerUnsubscribe.current = onSnapshot(chatDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const chatData = docSnap.data() as Chat;
            // Ensure selectedChatPartner is not null before accessing uid
            const partnerUid = selectedChatPartner?.uid;
            if (partnerUid) {
                 const partnerTyping = chatData.typing?.[partnerUid] ?? false;
                 setIsPartnerTyping(partnerTyping);
            } else {
                setIsPartnerTyping(false); // Partner not selected, can't be typing
            }
        } else {
            console.warn(`Chat document ${chatId} does not exist yet for typing listener.`);
            setIsPartnerTyping(false);
        }
    }, (error: FirestoreError) => {
        console.error(`🔴 Error listening to chat document ${chatId}:`, error.code, error.message);
        setIsPartnerTyping(false);
        chatDocListenerUnsubscribe.current = null;
    });

    // Return statement handled by the first useEffect for cleanup
   }, [user, selectedChatPartner, dbInstance, chatId, toast, scrollToBottom]); // Add chatId here


  // Focus handling for notification title and unread status update
  useEffect(() => {
    const handleFocus = () => {
        // Clear title notification
        const titlePrefix = '(*) ';
        if (typeof document !== 'undefined' && document.title.startsWith(titlePrefix)) {
            document.title = document.title.substring(titlePrefix.length);
        }
        // Clear unread status for the currently selected chat partner when window gains focus
        if (selectedChatPartner?.uid) {
             setHasUnreadMap(prevMap => {
                 const newMap = new Map(prevMap);
                 if (newMap.get(selectedChatPartner.uid)) { // Check if it was marked unread
                    newMap.set(selectedChatPartner.uid, false);
                    console.log(`Cleared unread status for user ${selectedChatPartner.uid} on window focus.`);
                    return newMap;
                 }
                 return prevMap; // No change needed
             });
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleFocus);
    }
    handleFocus(); // Check on initial load too

    return () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('focus', handleFocus);
        }
    };
  }, [selectedChatPartner?.uid]); // Re-run if selected partner changes


  const handleSelectUser = useCallback(async (partner: UserProfile) => {
     if (selectedChatPartner?.uid === partner.uid) return; // Do nothing if already selected

     if (!dbInstance || !user?.uid) {
        console.error("Cannot select user: DB instance or current user UID missing.");
        toast({
            title: "Error",
            description: "Could not initialize chat. Database connection might be unavailable.",
            variant: "destructive",
        });
        return;
     }

     // Reset typing status in the previous chat before switching
     if (chatId) {
        try {
            await updateTypingStatus(chatId, user.uid, false);
        } catch (error) {
            console.error("Error setting typing to false on chat switch:", error);
        }
     }

     // Update state for the new chat
     setSelectedChatPartner(partner);
     setMessages([]);
     setLoadingMessages(true);
     setIsPartnerTyping(false);
     setReplyingToMessage(null);
     setIsVideoButtonDisabled(true);
     isInitialMessagesLoadForScroll.current = true;
     const newChatId = getChatId(user.uid, partner.uid);
     setChatId(newChatId); // Set the new chat ID state
     setIsMobileSidebarOpen(false); // Close mobile sidebar on user selection
     console.log(`Selected user ${partner.uid}, switching to chat ${newChatId}`);

      // Clear unread status immediately on selection
       setHasUnreadMap(prevMap => {
           const newMap = new Map(prevMap);
           if (newMap.has(partner.uid)) {
               newMap.set(partner.uid, false);
               console.log(`Cleared unread status for user ${partner.uid} on selection.`);
           }
           return newMap;
       });

     // Ensure chat document exists
     const chatDocRef = doc(dbInstance, 'chats', newChatId);
     try {
        const chatDocSnap = await getDoc(chatDocRef);
        if (!chatDocSnap.exists()) {
            await setDoc(chatDocRef, {
                participants: [user.uid, partner.uid],
                createdAt: serverTimestamp(),
                typing: {} // Initialize typing map
            });
             console.log(`Firestore: Created chat document ${newChatId}`);
        } else {
             const chatData = chatDocSnap.data();
             // Ensure typing field exists, add if missing
             if (!chatData?.typing) {
                 console.log(`Chat document ${newChatId} missing 'typing' field. Adding...`);
                  try {
                     await updateDoc(chatDocRef, { typing: {} }); // Add the typing field
                 } catch (updateError) {
                     console.error(`Error adding 'typing' field to chat ${newChatId}:`, updateError);
                      // Handle error, maybe show toast
                 }
             }
        }
        setIsVideoButtonDisabled(false); // Enable video button after ensuring doc exists
     } catch (error) {
        console.error(`Error ensuring chat document ${newChatId} exists:`, error);
        toast({
            title: "Chat Error",
            description: "Could not initialize chat session.",
            variant: "destructive"
        });
        setIsVideoButtonDisabled(true);
     }
  }, [selectedChatPartner?.uid, user?.uid, chatId, toast, dbInstance]); // Include chatId in dependencies


   const filteredUsers = users.filter(u =>
    (u.displayName && u.displayName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

   if (dbInstance === null && !loadingUsers) {
       return (
            <div className="flex h-[calc(100vh-theme(spacing.14))] bg-secondary items-center justify-center p-4 text-center">
                <Card className="max-w-md p-6">
                    <CardHeader>
                        <CardTitle>Database Connection Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Could not connect to the database. Please check your internet connection and configuration. Chat features are unavailable.</p>
                    </CardContent>
                </Card>
            </div>
       );
   }


   // Sidebar Content Component
   const SidebarContent = () => (
     <>
         <header className="flex items-center justify-between p-4 border-b min-h-[65px]">
             <div className="flex items-center gap-2 overflow-hidden mr-2">
                <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || 'My Avatar'} data-ai-hint="current user profile avatar"/>
                    <AvatarFallback>{getInitials(user?.displayName || user?.email)}</AvatarFallback>
                </Avatar>
                <span className="font-semibold text-foreground truncate flex-1 min-w-0 text-sm">{user?.displayName || user?.email || 'User'}</span>
             </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="flex-shrink-0 text-muted-foreground hover:text-destructive h-8 w-8">
              <LogOut className="h-4 w-4" />
            </Button>
         </header>

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

         <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
                 {loadingUsers && (
                     <div className="space-y-1 p-2">
                        {[...Array(6)].map((_, i) => (
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
                 {!loadingUsers && filteredUsers.map((u) => {
                     const hasUnread = hasUnreadMap.get(u.uid) ?? false;
                     return (
                         <Button
                            key={u.uid}
                            variant="ghost"
                            className={cn(
                                "w-full justify-start h-auto py-2 px-3 text-left rounded-md",
                                "gap-3 items-center relative",
                                selectedChatPartner?.uid === u.uid ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:bg-muted/50",
                                hasUnread && "font-semibold" // Make text bold if unread
                            )}
                            onClick={() => handleSelectUser(u)}
                            aria-pressed={selectedChatPartner?.uid === u.uid}
                        >
                            {/* Online Status Indicator */}
                            {isOnline(u.lastSeen) && (
                                <span className="absolute left-1 top-1.5 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" aria-label="Online"/>
                            )}
                             {/* Unread Message Indicator */}
                             {hasUnread && (
                                 <span className="absolute right-2 top-1/2 -translate-y-1/2 block h-2.5 w-2.5 rounded-full bg-primary" aria-label="Unread messages"/>
                             )}
                            <Avatar className="h-8 w-8 flex-shrink-0 ml-1">
                                <AvatarImage src={u.photoURL || undefined} alt={u.displayName || 'User Avatar'} data-ai-hint="user chat list avatar"/>
                                <AvatarFallback>{getInitials(u.displayName || u.email)}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col flex-1 min-w-0">
                                <span className="font-medium truncate text-sm">{u.displayName || u.email || 'Unnamed User'}</span>
                                {!isOnline(u.lastSeen) && u.status && (
                                    <span className="text-xs text-muted-foreground truncate italic">
                                        {u.status}
                                    </span>
                                )}
                                 {!isOnline(u.lastSeen) && !u.status && u.lastSeen && (
                                     <span className="text-xs text-muted-foreground truncate">
                                         {formatLastSeen(u.lastSeen)}
                                     </span>
                                 )}
                            </div>
                        </Button>
                     );
                 })}
            </div>
         </ScrollArea>
     </>
   );


  return (
    <>
    <div className="flex h-[calc(100vh-theme(spacing.14))] bg-secondary">
        {/* Desktop Sidebar */}
       <aside className="w-64 flex-col border-r bg-background shadow-md hidden md:flex">
         <SidebarContent />
       </aside>

        {/* Mobile Sidebar Trigger - Now part of the header in main content */}


       <main className="flex-1 flex flex-col bg-background">
            {selectedChatPartner ? (
                 <>
                 <header className="flex items-center gap-3 p-4 border-b shadow-sm bg-card min-h-[65px]">
                    {/* Mobile Sidebar Trigger */}
                    <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                       <SheetTrigger asChild className="md:hidden mr-2">
                          <Button variant="ghost" size="icon">
                             <Menu className="h-5 w-5"/>
                             <span className="sr-only">Open User List</span>
                          </Button>
                       </SheetTrigger>
                       <SheetContent side="left" className="p-0 w-72"> {/* Adjust width as needed */}
                          <div className="flex flex-col h-full">
                              <SidebarContent />
                          </div>
                       </SheetContent>
                    </Sheet>

                    {/* Rest of the Header */}
                    <div className="relative">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={selectedChatPartner.photoURL || undefined} alt={selectedChatPartner.displayName || 'Chat partner avatar'} data-ai-hint="chat partner avatar"/>
                            <AvatarFallback>{getInitials(selectedChatPartner.displayName || selectedChatPartner.email)}</AvatarFallback>
                        </Avatar>
                        {isOnline(selectedChatPartner.lastSeen) && (
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card border border-background" aria-label="Online"/>
                        )}
                    </div>
                    <div className="flex flex-col flex-grow"> {/* Added flex-grow */}
                        <span className="font-semibold text-card-foreground">{selectedChatPartner.displayName || selectedChatPartner.email}</span>
                        <span className="text-xs text-muted-foreground">
                           {isOnline(selectedChatPartner.lastSeen)
                               ? (isPartnerTyping ? 'typing...' : (selectedChatPartner.status || 'Online'))
                               : (selectedChatPartner.status || formatLastSeen(selectedChatPartner.lastSeen))
                           }
                        </span>
                    </div>
                    {/* Video Call Button */}
                     <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => setIsVideoModalOpen(true)}
                         disabled={isVideoButtonDisabled || !dbInstance} // Also disable if DB is not ready
                         aria-label="Start video call"
                         className="text-muted-foreground hover:text-primary"
                     >
                         <VideoIcon className="h-5 w-5" />
                     </Button>
                 </header>

                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full" ref={scrollAreaRef}>
                        <div ref={viewportRef} className="h-full flex flex-col p-4 space-y-0.5"> {/* Reduce space-y for tighter messages */}
                            <div className="flex-grow" /> {/* Pushes messages to bottom */}
                            {loadingMessages && messages.length === 0 && (
                                <div className="space-y-4 p-4">
                                    {[...Array(4)].map((_, i) => (
                                        <React.Fragment key={i}>
                                         <Skeleton className={cn("h-12 rounded-lg", i % 2 === 0 ? "w-3/5 self-start" : "w-3/4 self-end")}/>
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                            {!loadingMessages && messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-6">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-3 text-primary/80" />
                                    <p className="font-medium">Start your conversation!</p>
                                    <p className="text-sm">Send a message to {selectedChatPartner.displayName || selectedChatPartner.email}.</p>
                                </div>
                            )}
                            <div className="pb-2"> {/* Reduce bottom padding */}
                                {messages.map((msg) => (
                                    <ChatMessage
                                        key={msg.id}
                                        message={msg}
                                        onReply={() => handleSetReplyTo(msg)} // Pass reply handler
                                     />
                                ))}
                            </div>
                            {isPartnerTyping && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse px-2 pb-1">
                                    <Avatar className="h-6 w-6 flex-shrink-0">
                                        <AvatarImage src={selectedChatPartner.photoURL || undefined} alt={selectedChatPartner.displayName || 'Typing avatar'} data-ai-hint="typing indicator avatar"/>
                                        <AvatarFallback className="text-xs">{getInitials(selectedChatPartner.displayName || selectedChatPartner.email)}</AvatarFallback>
                                    </Avatar>
                                    <span>typing...</span>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <ChatInput
                    chatId={chatId}
                    replyingTo={replyingToMessage} // Pass replyingTo state
                    onClearReply={clearReply} // Pass clear reply handler
                 />
                </>
            ) : (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8 bg-gradient-to-br from-background to-muted/30">
                     {/* Mobile Sidebar Trigger (Visible only when no chat is selected) */}
                     <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                       <SheetTrigger asChild className="md:hidden absolute top-4 left-4">
                          <Button variant="ghost" size="icon">
                             <Menu className="h-5 w-5"/>
                             <span className="sr-only">Open User List</span>
                          </Button>
                       </SheetTrigger>
                       <SheetContent side="left" className="p-0 w-72"> {/* Adjust width as needed */}
                           <div className="flex flex-col h-full">
                               <SidebarContent />
                           </div>
                       </SheetContent>
                     </Sheet>

                    <Users className="h-16 w-16 mb-4 text-primary opacity-80" />
                    <h2 className="text-xl font-semibold text-foreground mb-1">Select a Chat</h2>
                    <p className="text-base mb-4 max-w-xs">Choose someone from the list on the left to start messaging.</p>
                </div>
            )}
       </main>
    </div>
     {/* Video Call Modal */}
     {isVideoModalOpen && user && selectedChatPartner && chatId && (
        <VideoCallModal
            chatId={chatId}
            currentUser={user}
            partnerUser={selectedChatPartner}
            isOpen={isVideoModalOpen}
            onClose={() => setIsVideoModalOpen(false)}
        />
     )}
     </>
  );
}

