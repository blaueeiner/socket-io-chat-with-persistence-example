const { PrismaClient } = require("@prisma/client");
const { createAdapter } = require("@socket.io/redis-adapter");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { Redis } = require("ioredis");

const PORT = process.env.PORT || 3000;

const prisma = new PrismaClient();

const pubClient = new Redis();

const subClient = pubClient.duplicate();

const redisAdapter = createAdapter(pubClient, subClient);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  adapter: redisAdapter,
});

async function main() {
  io.on("connection", (socket) => {
    console.log("Socket client connected with ID:", socket.id);

    socket.on("message", async (data) => {
      console.log("Message received:", data);

      const message = await prisma.message.create({
        data: {
          chatId: data.chatId,
          content: data.message,
        },
      });

      socket.to(data.chatId).emit("message", message);
    });

    socket.on("join-chat", async (data) => {
      socket.join(data.chatId);
    });

    socket.on("disconnect", () => {
      console.log("Socket client disconnected with ID:", socket.id);
    });
  });

  app.get("/chats/:chatId/messages", async (req, res) => {
    const chatId = req.params.chatId;

    if (!chatId) {
      return res.status(400).json({
        error: "Chat ID is required",
      });
    }

    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const messages = await prisma.message.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: offset,
    });

    res.json({ limit, offset, messages });
  });

  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
