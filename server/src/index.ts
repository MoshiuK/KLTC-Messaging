import path from "path";
import express from "express";
import app from "./app";
import { prisma } from "./lib/prisma";

// --- Process-level error handlers (prevent silent crashes → 502s) ---
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// --- Graceful shutdown ---
async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Server setup ---
const PORT = parseInt(process.env.PORT || "3001", 10);
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Invalid PORT: ${process.env.PORT}. Using 3001.`);
}
const resolvedPort = isNaN(PORT) || PORT < 1 || PORT > 65535 ? 3001 : PORT;

// Serve the built client (hashed assets can be cached, HTML cannot)
const clientDist = path.join(__dirname, "../../client/dist");
app.use("/assets", express.static(path.join(clientDist, "assets"), { maxAge: "1y" }));
app.use(express.static(clientDist, { etag: false, lastModified: false }));

// SPA fallback: serve index.html with no-cache headers
app.get("*", (_req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) {
      console.error("Failed to serve index.html:", err);
      res.status(500).send("Server error");
    }
  });
});

const server = app.listen(resolvedPort, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${resolvedPort}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${resolvedPort} is already in use`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
