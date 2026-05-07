export interface User {
  id: number;
  chatId: string;
  username: string;
  name: string;
  avatar: string;
  bio: string;
  role: string;
  officeId: string | null;
  lastActive: number;
  banned?: boolean;
}

export interface Message {
  id: number;
  text: string;
  sender: 'me' | 'them';
  time: string;
  timestamp: number;
  type?: 'text' | 'image' | 'file' | 'system' | 'voice';
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  url?: string;
  filename?: string;
  size?: number;
  mimeType?: string;
}

export interface Chat {
  id: string;
  name: string;
  username: string;
  avatar: string;
  time: string;
  timestamp: number;
  lastMessage: string;
  unread: number;
  status: string;
  messages: Message[];
}

export interface Conference {
  id: string;
  name: string;
  creator: string;
  participants: string[];
  pending: string[];
  messages: ConferenceMessage[];
  avatar: string | null;
  createdAt: string;
}

export interface ConferenceMessage {
  id: number;
  text: string;
  senderUsername: string | null;
  time: string;
  timestamp: number;
  type: string;
}
