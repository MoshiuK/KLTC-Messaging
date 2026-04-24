import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { LimitExceededError } from "../lib/limits";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error("Unhandled error:", err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    });
    return;
  }

  if (err instanceof LimitExceededError) {
    res.status(err.status).json({
      error: err.message,
      limitType: err.limitType,
      current: err.current,
      limit: err.limit,
    });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
