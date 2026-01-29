import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import IORedis from 'ioredis';

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // Allow all for now, or match process.env.CLIENT_URL
      methods: ['GET', 'POST']
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
