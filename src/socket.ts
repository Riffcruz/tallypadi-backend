import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // Allow all for now, or match process.env.CLIENT_URL
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log('🔌 Agent connected:', socket.id);

    socket.on('join_agent', (agentId: string) => {
      console.log(`🔌 Agent ${agentId} joined their room`);
      socket.join(`agent:${agentId}`);
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
