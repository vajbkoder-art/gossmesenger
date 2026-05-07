import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

export function useSocket(username: string | undefined) {
  const socketRef = useRef<Socket>(getSocket());

  useEffect(() => {
    const s = socketRef.current;
    if (!username) return;

    if (!s.connected) s.connect();
    s.emit('register_user', username);

    const heartbeat = setInterval(() => {
      s.emit('heartbeat');
    }, 30000);

    return () => {
      clearInterval(heartbeat);
    };
  }, [username]);

  return socketRef.current;
}
