"use client";

import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
});

export const { 
  signIn, 
  signOut, 
  signUp, 
  useSession
} = authClient;