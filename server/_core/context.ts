import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export async function createContext({ req, res }: { req: Request; res: Response }) {
  const auth = req.headers.authorization;
  let user = null;

  if (auth?.startsWith("Bearer ")) {
    try {
      const token = auth.slice(7);
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      const [found] = await db.select().from(users).where(eq(users.id, payload.userId));
      user = found ?? null;
    } catch {
      user = null;
    }
  }

  return { req, res, db, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
