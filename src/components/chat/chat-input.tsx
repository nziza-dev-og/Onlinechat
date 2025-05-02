"use client";

import React, { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export function ChatInput() {
  const [message, setMessage] = useState('');
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !message.trim() || isSending) return;

    setIsSending(true);
    const { uid, displayName, photoURL } = user;

    try {
      await addDoc(collection(db, 'messages'), {
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
        placeholder="Type a message..."
        className="flex-1"
        disabled={!user || isSending}
        aria-label="Chat message input"
      />
      <Button type="submit" size="icon" disabled={!user || !message.trim() || isSending} aria-label="Send message">
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
}
