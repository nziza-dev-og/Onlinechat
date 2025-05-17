
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
import { LogOut, Users, MessageSquare, Search, CircleDot, Video as VideoIcon, Circle, Menu, Edit3, Camera } from 'lucide-react'; // Added Circle, Menu, Edit3, Camera
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";
import { updateUserProfileDocument } from '@/lib/user-profile.service';
import { isFirebaseError } from '@/lib/firebase-errors';
import { formatDistanceToNowStrict } from 'date-fns';
import { updateTypingStatus } from '@/lib/chat.service';
import { VideoCallModal } from '@/components/chat/video-call-modal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';


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
    if (!lastSeen) return 'Offline'; // No data
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
  const [activeFilter, setActiveFilter] = useState<'messages' | 'channels' | 'requests'>('messages');


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
            duration: 10000,
        });
    }
  }, [toast]);


   const scrollToBottom = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, []);

   const handleSetReplyTo = useCallback((message: Message | null) => {
     setReplyingToMessage(message);
   }, []);

   const clearReply = useCallback(() => {
     setReplyingToMessage(null);
   }, []);


    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;
        let isFocused = typeof document !== 'undefined' ? document.hasFocus() : true;
        let currentChatIdForCleanup: string | null = null;

        const updateUserPresence = async (reason: string) => {
             if (!user?.uid) {
                 return;
             }
             if (!dbInstance) {
                 console.warn(`Presence update skipped for ${user.uid} (${reason}): DB instance not ready.`);
                 return;
             }

             try {
                 await updateUserProfileDocument(user.uid, {
                     lastSeen: 'SERVER_TIMESTAMP'
                 });
             } catch (error: any) {
                 console.error(`🔴 Error updating user presence for ${user.uid} (${reason}):`, error.message, error);
                 if (!error.message?.includes("Network Error") && !error.message?.includes("temporarily unavailable")) {
                    toast({
                        title: "Presence Error",
                        description: `Could not update online status.`,
                        variant: "destructive",
                        duration: 5000,
                    });
                 }
             }
        };

        const initialTimeoutId = setTimeout(() => updateUserPresence('initial'), 1500);
        intervalId = setInterval(() => updateUserPresence('interval'), 4 * 60 * 1000);

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
        handleFocus();


        return () => {
             console.log("Cleaning up presence and typing effect...");
             clearTimeout(initialTimeoutId);
             if (intervalId) clearInterval(intervalId);
             if (typeof window !== 'undefined') {
                 window.removeEventListener('focus', handleFocus);
                 window.removeEventListener('blur', handleBlur);
             }
              if (user?.uid && currentChatIdForCleanup && dbInstance) {
                  updateTypingStatus(currentChatIdForCleanup, user.uid, false)
                     .catch(err => console.error("Cleanup error for typing status:", err));
              }
         };
    }, [user?.uid, chatId, toast, dbInstance]);


  useEffect(() => {
    const unsubscribe = userListenerUnsubscribe.current;
    return () => {
      if (unsubscribe) {
         console.log("Cleaning up Firestore 'users' listener.");
         unsubscribe();
         userListenerUnsubscribe.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (userListenerUnsubscribe.current) {
        userListenerUnsubscribe.current();
        userListenerUnsubscribe.current = null;
    }

    if (!user || !dbInstance) {
      setUsers([]);
      setLoadingUsers(!user || !dbInstance);
      return;
    }

    setLoadingUsers(true);
    const usersQuery = query(collection(dbInstance, 'users'));

    userListenerUnsubscribe.current = onSnapshot(usersQuery, (snapshot) => {
      const fetchedUsers: UserProfile[] = snapshot.docs
        .map(doc => {
          const data = doc.data();
          const uid = data.uid;
          if (!uid || typeof uid !== 'string') {
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
        .filter((u): u is UserProfile => u !== null && u.uid !== user.uid);

      fetchedUsers.sort((a, b) => {
          const onlineA = isOnline(a.lastSeen);
          const onlineB = isOnline(b.lastSeen);
          if (onlineA && !onlineB) return -1;
          if (!onlineA && onlineB) return 1;
          // Fallback to lastSeen if both online or both offline
          const timeA = a.lastSeen instanceof Timestamp ? a.lastSeen.toMillis() : (a.lastSeen ? new Date(a.lastSeen).getTime() : 0);
          const timeB = b.lastSeen instanceof Timestamp ? b.lastSeen.toMillis() : (b.lastSeen ? new Date(b.lastSeen).getTime() : 0);
          if (timeA !== timeB) return timeB - timeA; // Newest first

          const nameA = (a.displayName || a.email || '').toLowerCase();
          const nameB = (b.displayName || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
      });

      setUsers(fetchedUsers);
      setLoadingUsers(false);

      if (selectedChatPartner) {
          const updatedPartner = fetchedUsers.find(u => u.uid === selectedChatPartner.uid);
          setSelectedChatPartner(updatedPartner || null);
          if (!updatedPartner) {
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
  }, [user, dbInstance, toast, selectedChatPartner?.uid]);


   useEffect(() => {
     const unsubscribeMessages = messageListenerUnsubscribe.current;
     const unsubscribeChatDoc = chatDocListenerUnsubscribe.current;
     const chatIdForCleanup = chatId;

     return () => {
        if (unsubscribeMessages) {
           unsubscribeMessages();
           messageListenerUnsubscribe.current = null;
        }
        if (unsubscribeChatDoc) {
             unsubscribeChatDoc();
             chatDocListenerUnsubscribe.current = null;
        }
         if (user?.uid && chatIdForCleanup && dbInstance) {
              updateTypingStatus(chatIdForCleanup, user.uid, false).catch(err => console.error("Cleanup error for typing status:", err));
         }
      };
   }, [chatId, user?.uid, dbInstance]);

   useEffect(() => {
     if (messageListenerUnsubscribe.current) {
        messageListenerUnsubscribe.current();
        messageListenerUnsubscribe.current = null;
      }
      if (chatDocListenerUnsubscribe.current) {
          chatDocListenerUnsubscribe.current();
          chatDocListenerUnsubscribe.current = null;
      }

    if (!user || !selectedChatPartner || !dbInstance || !chatId) {
        setMessages([]);
        setLoadingMessages(false);
        setIsPartnerTyping(false);
        setReplyingToMessage(null);
        setIsVideoButtonDisabled(true);
        isInitialMessagesLoadForScroll.current = true;
        return;
    }

    setLoadingMessages(true);
    isInitialMessagesLoadForScroll.current = true;
    setIsVideoButtonDisabled(false);

    const messagesQuery = query(
      collection(dbInstance, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
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
               if (!data.text && !data.imageUrl && !data.audioUrl && !data.videoUrl && !data.fileUrl) {
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
                  fileSize: data.fileSize ?? null,
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

               const isFromOtherUser = message.uid !== user?.uid;
               const isTabHidden = typeof document !== 'undefined' && document.hidden;
               const isCurrentChatSelected = selectedChatPartner?.uid === message.uid;

                if (isFromOtherUser && (!isCurrentChatSelected || isTabHidden)) {
                     setHasUnreadMap(prevMap => {
                        const newMap = new Map(prevMap);
                        if (!newMap.get(message.uid)) {
                             newMap.set(message.uid, true);
                             console.log(`Marked chat with user ${message.uid} as unread.`);
                        }
                        return newMap;
                     });
                }

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

    const chatDocRef = doc(dbInstance, 'chats', chatId);
    chatDocListenerUnsubscribe.current = onSnapshot(chatDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const chatData = docSnap.data() as Chat;
            const partnerUid = selectedChatPartner?.uid;
            if (partnerUid) {
                 const partnerTyping = chatData.typing?.[partnerUid] ?? false;
                 setIsPartnerTyping(partnerTyping);
            } else {
                setIsPartnerTyping(false);
            }
        } else {
            setIsPartnerTyping(false);
        }
    }, (error: FirestoreError) => {
        console.error(`🔴 Error listening to chat document ${chatId}:`, error.code, error.message);
        setIsPartnerTyping(false);
        chatDocListenerUnsubscribe.current = null;
    });
   }, [user, selectedChatPartner, dbInstance, chatId, toast, scrollToBottom]);


  useEffect(() => {
    const handleFocus = () => {
        const titlePrefix = '(*) ';
        if (typeof document !== 'undefined' && document.title.startsWith(titlePrefix)) {
            document.title = document.title.substring(titlePrefix.length);
        }
        if (selectedChatPartner?.uid) {
             setHasUnreadMap(prevMap => {
                 const newMap = new Map(prevMap);
                 if (newMap.get(selectedChatPartner.uid)) {
                    newMap.set(selectedChatPartner.uid, false);
                 }
                 return newMap;
             });
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleFocus);
    }
    handleFocus();

    return () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('focus', handleFocus);
        }
    };
  }, [selectedChatPartner?.uid]);


  const handleSelectUser = useCallback(async (partner: UserProfile) => {
     if (selectedChatPartner?.uid === partner.uid) return;

     if (!dbInstance || !user?.uid) {
        toast({
            title: "Error",
            description: "Could not initialize chat. Database connection might be unavailable.",
            variant: "destructive",
        });
        return;
     }

     if (chatId) {
        try {
            await updateTypingStatus(chatId, user.uid, false);
        } catch (error) {
            console.error("Error setting typing to false on chat switch:", error);
        }
     }

     setSelectedChatPartner(partner);
     setMessages([]);
     setLoadingMessages(true);
     setIsPartnerTyping(false);
     setReplyingToMessage(null);
     setIsVideoButtonDisabled(true);
     isInitialMessagesLoadForScroll.current = true;
     const newChatId = getChatId(user.uid, partner.uid);
     setChatId(newChatId);
     setIsMobileSidebarOpen(false);

       setHasUnreadMap(prevMap => {
           const newMap = new Map(prevMap);
           if (newMap.has(partner.uid)) {
               newMap.set(partner.uid, false);
           }
           return newMap;
       });

     const chatDocRef = doc(dbInstance, 'chats', newChatId);
     try {
        const chatDocSnap = await getDoc(chatDocRef);
        if (!chatDocSnap.exists()) {
            await setDoc(chatDocRef, {
                participants: [user.uid, partner.uid],
                createdAt: serverTimestamp(),
                typing: {}
            });
        } else {
             const chatData = chatDocSnap.data();
             if (!chatData?.typing) {
                 await updateDoc(chatDocRef, { typing: {} });
             }
        }
        setIsVideoButtonDisabled(false);
     } catch (error) {
        console.error(`Error ensuring chat document ${newChatId} exists:`, error);
        toast({
            title: "Chat Error",
            description: "Could not initialize chat session.",
            variant: "destructive"
        });
        setIsVideoButtonDisabled(true);
     }
  }, [selectedChatPartner?.uid, user?.uid, chatId, toast, dbInstance]);


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
                        <p className="text-muted-foreground">Could not connect to the database. Chat features are unavailable.</p>
                    </CardContent>
                </Card>
            </div>
       );
   }


   const SidebarContent = () => (
     <>
         <header className="flex items-center justify-between p-4 border-b min-h-[65px] bg-background">
             <h1 className="text-lg font-semibold text-foreground truncate">
                {user?.displayName || "Messages"}
             </h1>
             <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => toast({ title: "New message action placeholder" })} aria-label="New message" className="text-muted-foreground hover:text-primary h-8 w-8">
                    <Edit3 className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="text-muted-foreground hover:text-destructive h-8 w-8">
                    <LogOut className="h-5 w-5" />
                </Button>
            </div>
         </header>

        <div className="p-3 border-b bg-background">
            <div className="flex items-center gap-2">
                <Button
                    variant={activeFilter === 'messages' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveFilter('messages')}
                    className={cn("flex-1 rounded-full text-xs", activeFilter === 'messages' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                    Messages
                </Button>
                <Button
                     variant={activeFilter === 'channels' ? 'default' : 'ghost'}
                     size="sm"
                     onClick={() => { setActiveFilter('channels'); toast({ title: "Channels coming soon!" }); }}
                     className={cn("flex-1 rounded-full text-xs", activeFilter === 'channels' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                    Channels
                </Button>
                <Button
                    variant={activeFilter === 'requests' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => { setActiveFilter('requests'); toast({ title: "Requests coming soon!" }); }}
                    className={cn("flex-1 rounded-full text-xs", activeFilter === 'requests' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                    Requests
                </Button>
            </div>
        </div>


         <div className="p-3 border-b">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search messages..."
                    className="pl-8 h-9 bg-muted/50 focus:bg-background text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search for users or messages"
                />
            </div>
         </div>

         <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
                 {loadingUsers && (
                     <div className="space-y-1 p-2">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="flex items-center space-x-3 p-2.5 h-[60px]">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                                <Skeleton className="h-6 w-6 rounded-md" />
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
                     const lastActivityText = isPartnerTyping && selectedChatPartner?.uid === u.uid
                                            ? "typing..."
                                            : (u.status || formatLastSeen(u.lastSeen)); // Show status or last seen
                     // Placeholder for last message - this would require fetching last message for each chat
                     const lastMessagePreview = "Last message placeholder...";
                     const lastMessageTime = formatLastSeen(u.lastSeen); // Use lastSeen for now

                     return (
                         <Button
                            key={u.uid}
                            variant="ghost"
                            className={cn(
                                "w-full justify-start h-auto py-2.5 px-3 text-left rounded-md",
                                "gap-3 items-center relative",
                                selectedChatPartner?.uid === u.uid ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:bg-muted/50",
                            )}
                            onClick={() => handleSelectUser(u)}
                            aria-pressed={selectedChatPartner?.uid === u.uid}
                        >
                            <div className="relative shrink-0">
                                <Avatar className="h-10 w-10">
                                    <AvatarImage src={u.photoURL || undefined} alt={u.displayName || 'User Avatar'} data-ai-hint="user chat list avatar"/>
                                    <AvatarFallback>{getInitials(u.displayName || u.email)}</AvatarFallback>
                                </Avatar>
                                {isOnline(u.lastSeen) && (
                                    <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" aria-label="Online"/>
                                )}
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                                <div className="flex justify-between items-center">
                                    <span className={cn("font-medium truncate text-sm", hasUnread && "font-bold text-foreground")}>
                                        {u.displayName || u.email || 'Unnamed User'}
                                    </span>
                                    <span className={cn("text-xs text-muted-foreground ml-2 shrink-0", hasUnread && "text-primary font-semibold")}>
                                        {lastMessageTime}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className={cn("text-xs text-muted-foreground truncate", hasUnread && "text-foreground")}>
                                        {/* Replace with actual last message logic if available */}
                                        {isPartnerTyping && selectedChatPartner?.uid === u.uid ? <span className="text-primary italic">typing...</span> : lastMessagePreview}
                                    </span>
                                    {hasUnread && (
                                         <CircleDot className="h-2.5 w-2.5 text-primary shrink-0" />
                                    )}
                                </div>
                            </div>
                             <Camera className="h-5 w-5 text-muted-foreground shrink-0 ml-1 opacity-70 group-hover:opacity-100" />
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
       <aside className="w-80 flex-col border-r bg-background shadow-md hidden md:flex"> {/* Wider sidebar */}
         <SidebarContent />
       </aside>

       <main className="flex-1 flex flex-col bg-background">
            {selectedChatPartner ? (
                 <>
                 <header className="flex items-center gap-3 p-4 border-b shadow-sm bg-card min-h-[65px]">
                    <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                       <SheetTrigger asChild className="md:hidden mr-2">
                          <Button variant="ghost" size="icon">
                             <Menu className="h-5 w-5"/>
                             <span className="sr-only">Open User List</span>
                          </Button>
                       </SheetTrigger>
                       <SheetContent side="left" className="p-0 w-80">
                          <div className="flex flex-col h-full">
                              <SidebarContent />
                          </div>
                       </SheetContent>
                    </Sheet>

                    <div className="relative">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={selectedChatPartner.photoURL || undefined} alt={selectedChatPartner.displayName || 'Chat partner avatar'} data-ai-hint="chat partner avatar"/>
                            <AvatarFallback>{getInitials(selectedChatPartner.displayName || selectedChatPartner.email)}</AvatarFallback>
                        </Avatar>
                        {isOnline(selectedChatPartner.lastSeen) && (
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card border border-background" aria-label="Online"/>
                        )}
                    </div>
                    <div className="flex flex-col flex-grow">
                        <span className="font-semibold text-card-foreground">{selectedChatPartner.displayName || selectedChatPartner.email}</span>
                        <span className="text-xs text-muted-foreground">
                           {isPartnerTyping ? <span className="italic text-primary">typing...</span> : (selectedChatPartner.status || formatLastSeen(selectedChatPartner.lastSeen))}
                        </span>
                    </div>
                     <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => setIsVideoModalOpen(true)}
                         disabled={isVideoButtonDisabled || !dbInstance}
                         aria-label="Start video call"
                         className="text-muted-foreground hover:text-primary"
                     >
                         <VideoIcon className="h-5 w-5" />
                     </Button>
                 </header>

                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full" ref={scrollAreaRef}>
                        <div ref={viewportRef} className="h-full flex flex-col p-4 space-y-0.5">
                            <div className="flex-grow" />
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
                            <div className="pb-2">
                                {messages.map((msg) => (
                                    <ChatMessage
                                        key={msg.id}
                                        message={msg}
                                        onReply={() => handleSetReplyTo(msg)}
                                     />
                                ))}
                            </div>
                            {isPartnerTyping && !loadingMessages && (
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
                    replyingTo={replyingToMessage}
                    onClearReply={clearReply}
                 />
                </>
            ) : (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8 bg-gradient-to-br from-background to-muted/30">
                     <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                       <SheetTrigger asChild className="md:hidden absolute top-4 left-4">
                          <Button variant="ghost" size="icon">
                             <Menu className="h-5 w-5"/>
                             <span className="sr-only">Open User List</span>
                          </Button>
                       </SheetTrigger>
                       <SheetContent side="left" className="p-0 w-80">
                           <div className="flex flex-col h-full">
                               <SidebarContent />
                           </div>
                       </SheetContent>
                     </Sheet>

                    <MessageSquare className="h-16 w-16 mb-4 text-primary opacity-70" />
                    <h2 className="text-xl font-semibold text-foreground mb-1">Your Messages</h2>
                    <p className="text-base mb-4 max-w-xs">Select a conversation or start a new one.</p>
                </div>
            )}
       </main>
    </div>
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

