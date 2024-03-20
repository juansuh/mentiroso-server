import express from "express";
import Redis from "ioredis";
import { createServer } from "node:http";

//Initialize express app
const app = express();
const port = process.env.PORT || 3000;

//Initialize server
export const server = createServer(app);

//Initialize Redis client
export const redis = new Redis();

import "./socketEvents";

app.use(express.json());

app.get("/health", (req, res) => {
  res.send("Healthy");
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
