import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth";
import contactRoutes from "./routes/contacts";
import groupRoutes from "./routes/groups";
import smsRoutes from "./routes/sms";
import voiceRoutes from "./routes/voice";
import orgRoutes from "./routes/org";
import userRoutes from "./routes/users";
import notificationRoutes from "./routes/notifications";
import threadRoutes from "./routes/threads";
import inviteRoutes from "./routes/invites";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// CORS — restrict to configured origins or allow all in dev
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : undefined;

app.use(
  cors(
    allowedOrigins
      ? { origin: allowedOrigins, credentials: true }
      : undefined
  )
);

// Request size limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Rate limiting for auth endpoints (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: { error: "Too many attempts. Please try again in a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check (no rate limit)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Apply rate limiters
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api", apiLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/threads", threadRoutes);
app.use("/api/groups", inviteRoutes);  // invite routes: POST /api/groups/:id/invite
app.use("/api/invites", inviteRoutes); // join route: POST /api/invites/:token/join

// Error handler
app.use(errorHandler);

export default app;
