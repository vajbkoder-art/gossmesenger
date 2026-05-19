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

export interface ReplyTo {
  id: number;
  text: string;
  sender: 'me' | 'them';
  senderUsername?: string;
  senderName?: string;
  type?: string;
  filename?: string;
}

export interface Message {
  id: number;
  text: string;
  sender: 'me' | 'them';
  time: string;
  timestamp: number;
  type?: 'text' | 'image' | 'file' | 'system' | 'voice' | 'video' | 'video_circle';
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  url?: string;
  filename?: string;
  size?: number;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
  replyTo?: ReplyTo;
  editedAt?: number;
  forwarded?: boolean;
  forwardedFrom?: string;
  pinned?: boolean;
  senderUsername?: string;
  senderName?: string;
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
  isGroup?: boolean;
  pinnedMessages?: number[];
}

export interface GroupChat {
  id: string;
  name: string;
  avatar: string | null;
  creator: string;
  admins: string[];
  members: string[];
  pending: string[];
  messages: GroupMessage[];
  createdAt: string;
  pinnedMessages?: number[];
}

export interface GroupMessage {
  id: number;
  text: string;
  senderUsername: string | null;
  senderName?: string;
  time: string;
  timestamp: number;
  type: string;
  url?: string;
  filename?: string;
  size?: number;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
  replyTo?: ReplyTo;
  editedAt?: number;
  forwarded?: boolean;
  forwardedFrom?: string;
  pinned?: boolean;
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
