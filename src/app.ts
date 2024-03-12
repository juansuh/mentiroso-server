import express from "express";
import Redis from "ioredis";
import { createServer } from "node:http";
import { Server } from "socket.io";

//Initialize express app
const app = express();
const port = process.env.PORT || 3000;

//Initialize socket.io server
const server = createServer(app);
const io = new Server(server);

//Initialize Redis client
const redis = new Redis();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello Redis with Express.js and TypeScript!");
});

// Middleware to check if data is in the cache
const checkCache = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const cachedData = await redis.get("cachedData");

  if (cachedData) {
    res.send(JSON.parse(cachedData));
  } else {
    next(); // Continue to the route handler if data is not in the cache
  }
};

// Use the checkCache middleware before the route handler
app.get("/cache", checkCache, async (req, res) => {
  const dataToCache = { message: "Data to be cached" };
  await redis.set("cachedData", JSON.stringify(dataToCache), "EX", 3600); // Cache for 1 hour
  res.send(dataToCache);
});

io.on("connection", (socket) => {
  console.log("a user connected");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
