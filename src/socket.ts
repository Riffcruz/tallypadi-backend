import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import IORedis from 'ioredis';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from './config/jwt';

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? (process.env.CLIENT_URL || 'https://tallypadi.com')
        : true,
      methods: ['GET', 'POST']
    }
  });

  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || '');
      const decoded = jwt.verify(token, getJwtSecret()) as { agentId?: string; id?: string; role?: string };
      const role = String(decoded.role || '').toUpperCase();
      const isAgent = role === 'AGENT' && Boolean(decoded.agentId);
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role) && Boolean(decoded.id);
      if (!isAgent && !isAdmin) return next(new Error('Unauthorized'));
      socket.data.agentId = decoded.agentId;
      socket.data.isAdmin = isAdmin;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  // Redis Subscriber for Worker Events
  const redisSub = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  
  redisSub.subscribe('socket-events', (err) => {
      if (err) console.error('Failed to subscribe to socket-events', err);
  });

  redisSub.on('message', (channel, message) => {
      if (channel === 'socket-events' && io) {
          try {
              const { room, event, data } = JSON.parse(message);
              // console.log(`🔄 Re-emitting socket event from Redis: ${event} -> ${room}`);
              io.to(room).emit(event, data);
          } catch (e) {
              console.error('Failed to process socket-event from Redis', e);
          }
      }
  });

  io.on('connection', (socket: Socket) => {
    console.log('🔌 Agent connected:', socket.id);

    socket.on('join_agent', (agentId: string) => {
      if (!socket.data.isAdmin && String(agentId) !== String(socket.data.agentId)) return;
      if (socket.data.isAdmin && agentId !== 'ADMIN_VIEWER') return;
      console.log(`🔌 Agent ${agentId} joined their room`);
      socket.join(`agent:${agentId}`);
      socket.join('agents');
    });

    socket.on('join_ticket', (ticketId: string) => {
      console.log(`🔌 Socket ${socket.id} joined ticket room: ticket:${ticketId}`);
      socket.join(`ticket:${ticketId}`);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Agent disconnected:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};
