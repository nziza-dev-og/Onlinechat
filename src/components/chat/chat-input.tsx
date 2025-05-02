
"use client";

import React, { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface ChatInputProps {
  chatId: string | null; // ID of the chat document
}

export function ChatInput({ chatId }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !chatId || !message.trim() || isSending) return;

    setIsSending(true);
    const { uid, displayName, photoURL } = user;

    try {
       // Reference the 'messages' subcollection within the specific chat document
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      await addDoc(messagesRef, {
        text: message,
        timestamp: serverTimestamp(),
        uid,
        displayName,
        photoURL,
      });
      setMessage('');
    } catch (error) {
        console.error("Error sending message:", error);
        // Optionally show a toast notification for the error
    } finally {
        setIsSending(false);
    }
  };

  return (
    <form onSubmit={sendMessage} className="flex items-center gap-2 p-4 border-t bg-background">
      <Input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={chatId ? "Type a message..." : "Select a chat to start"}
        className="flex-1"
        disabled={!user || !chatId || isSending} // Disable if no chat is selected
        aria-label="Chat message input"
      />
      <Button type="submit" size="icon" disabled={!user || !chatId || !message.trim() || isSending} aria-label="Send message">
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
}
