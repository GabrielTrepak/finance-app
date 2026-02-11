import { create } from "zustand";
import { db } from "../db/db";
import { createSaltBundle, deriveKeyFromPassword } from "../crypto/crypto";

type AuthState = {
  isReady: boolean;
  isLogged: boolean;
  key: CryptoKey | null;
  hasAccount: boolean;

  init(): Promise<void>;
  setupAccount(password: string): Promise<void>;
  login(password: string): Promise<boolean>;
  logout(): void;
};

export const useAuthStore = create<AuthState>((set) => ({
  isReady: false,
  isLogged: false,
  key: null,
  hasAccount: false,

  async init() {
    const has = await db.meta.get("has_account");
    set({ hasAccount: has?.value === "1", isReady: true });
  },

  async setupAccount(password: string) {
    const bundle = await createSaltBundle();
    await db.meta.put({ key: "crypto_salt", value: bundle.saltB64 });
    await db.meta.put({ key: "has_account", value: "1" });

    const key = await deriveKeyFromPassword(password, bundle.saltB64);
    set({ hasAccount: true, isLogged: true, key });
  },

  async login(password: string) {
    const salt = await db.meta.get("crypto_salt");
    if (!salt?.value) return false;

    try {
      const key = await deriveKeyFromPassword(password, salt.value);

      // “prova” simples: tentar descriptografar algo no futuro.
      // No MVP, só aceita e segue (senha errada vai falhar ao tentar decrypt).
      set({ isLogged: true, key });
      return true;
    } catch {
      return false;
    }
  },

  logout() {
    set({ isLogged: false, key: null });
  },
}));
