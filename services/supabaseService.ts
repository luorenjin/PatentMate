import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { generateUuid } from "./idService";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const MOCK_USERS_KEY = "patentmate_mock_auth_users";
const MOCK_SESSION_KEY = "patentmate_mock_auth_session";
const EMAIL_PROVIDER = "email";
const MOCK_PROVIDER = "mock-local";
const AUTH_AUDIENCE = "authenticated";
const AUTH_ROLE = "authenticated";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
const SUPABASE_PLACEHOLDER_HOST = "your-project.supabase.co";
const SUPABASE_PLACEHOLDER_KEY = "your-anon-key";
const authStateListeners = new Set<
  (event: string, session: Session | null) => void
>();

interface MockAuthUserRecord {
  id: string;
  email: string;
  password: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const isPlaceholderSupabaseUrl = (value: string): boolean => {
  return (
    !value ||
    value.includes(SUPABASE_PLACEHOLDER_HOST) ||
    value.includes("your-project")
  );
};

const isPlaceholderSupabaseKey = (value: string): boolean => {
  return (
    !value ||
    value === SUPABASE_PLACEHOLDER_KEY ||
    value.includes("your-anon-key")
  );
};

const hasUsableSupabaseCredentials = (): boolean => {
  return (
    Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) &&
    !isPlaceholderSupabaseUrl(SUPABASE_URL) &&
    !isPlaceholderSupabaseKey(SUPABASE_ANON_KEY)
  );
};

const supabaseConfigured = hasUsableSupabaseCredentials();

if (!supabaseConfigured) {
  console.warn(
    "Supabase credentials not configured. Falling back to local mock auth.",
  );
}

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const createValidationError = (message: string): Error => {
  return new Error(message);
};

/**
 * 将认证相关错误文案统一翻译为中文，兼容 Supabase 与本地 mock 模式。
 * @param message 原始错误文案。
 * @returns 面向界面的中文错误提示。
 */
export const translateAuthErrorMessage = (message: string): string => {
  if (!message) {
    return "操作失败，请稍后重试";
  }

  if (message.includes("Invalid login credentials")) {
    return "邮箱或密码错误";
  }

  if (message.includes("Email not confirmed")) {
    return "请先验证邮箱后再登录";
  }

  if (
    message.includes("User already registered") ||
    message.includes("already registered")
  ) {
    return "该邮箱已被注册";
  }

  if (
    message.includes("Please provide a valid email") ||
    message.includes("valid email")
  ) {
    return "请输入有效的邮箱地址";
  }

  if (message.includes("User not found") || message.includes("not found")) {
    return "该邮箱未注册";
  }

  if (message.includes("No active session")) {
    return "当前未登录，请重新登录后再试";
  }

  if (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("ERR_NAME_NOT_RESOLVED")
  ) {
    return "网络连接失败，请稍后重试";
  }

  return message;
};

const shouldFallbackToMock = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  return (
    error.message.includes("Failed to fetch") ||
    error.message.includes("ERR_NAME_NOT_RESOLVED") ||
    error.message.includes("NetworkError") ||
    error.message.includes("fetch")
  );
};

const isValidEmail = (email: string): boolean => {
  return /\S+@\S+\.\S+/.test(email);
};

const getMockUsers = (): MockAuthUserRecord[] => {
  try {
    const raw = localStorage.getItem(MOCK_USERS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as MockAuthUserRecord[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (user): user is MockAuthUserRecord =>
        typeof user?.id === "string" &&
        typeof user?.email === "string" &&
        typeof user?.password === "string" &&
        typeof user?.createdAt === "string" &&
        typeof user?.updatedAt === "string",
    );
  } catch (error) {
    console.error("Failed to load mock auth users:", error);
    return [];
  }
};

const saveMockUsers = (users: MockAuthUserRecord[]): void => {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
};

const toMockUser = (record: MockAuthUserRecord): User => {
  return {
    id: record.id,
    app_metadata: {
      provider: EMAIL_PROVIDER,
      providers: [EMAIL_PROVIDER],
    },
    user_metadata: {
      authMode: MOCK_PROVIDER,
    },
    aud: AUTH_AUDIENCE,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    email: record.email,
    role: AUTH_ROLE,
    confirmed_at: record.createdAt,
    email_confirmed_at: record.createdAt,
    last_sign_in_at: record.updatedAt,
    phone: "",
    identities: [],
    factors: [],
    is_anonymous: false,
  } as User;
};

const createMockSession = (user: User): Session => {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;

  return {
    access_token: `mock-access-token-${user.id}`,
    refresh_token: `mock-refresh-token-${user.id}`,
    token_type: "bearer",
    expires_in: SESSION_DURATION_SECONDS,
    expires_at: expiresAt,
    user,
  } as Session;
};

const getMockSessionSync = (): Session | null => {
  try {
    const raw = localStorage.getItem(MOCK_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Session;
    if (
      typeof parsed?.access_token !== "string" ||
      typeof parsed?.refresh_token !== "string" ||
      typeof parsed?.token_type !== "string" ||
      typeof parsed?.user?.id !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to load mock auth session:", error);
    return null;
  }
};

const saveMockSession = (session: Session | null): void => {
  if (!session) {
    localStorage.removeItem(MOCK_SESSION_KEY);
    return;
  }

  localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
};

const notifyAuthStateChange = (
  event: string,
  session: Session | null,
): void => {
  authStateListeners.forEach((listener) => listener(event, session));
};

const findMockUserByEmail = (email: string): MockAuthUserRecord | undefined => {
  const normalizedEmail = email.trim().toLowerCase();
  return getMockUsers().find(
    (user) => user.email.toLowerCase() === normalizedEmail,
  );
};

const createMockUserRecord = (
  email: string,
  password: string,
): MockAuthUserRecord => {
  const now = new Date().toISOString();

  return {
    id: generateUuid(),
    email,
    password,
    createdAt: now,
    updatedAt: now,
  };
};

const registerMockUser = (
  email: string,
  password: string,
): { user: User | null; error: Error | null } => {
  const existingUser = findMockUserByEmail(email);
  if (existingUser) {
    return {
      user: null,
      error: createValidationError("User already registered"),
    };
  }

  const newUser = createMockUserRecord(email, password);
  const users = getMockUsers();
  users.push(newUser);
  saveMockUsers(users);

  return { user: toMockUser(newUser), error: null };
};

const signInWithMock = (
  email: string,
  password: string,
): { user: User | null; error: Error | null } => {
  const existingUser = findMockUserByEmail(email);
  if (!existingUser || existingUser.password !== password) {
    return {
      user: null,
      error: createValidationError("Invalid login credentials"),
    };
  }

  const updatedRecord: MockAuthUserRecord = {
    ...existingUser,
    updatedAt: new Date().toISOString(),
  };
  const users = getMockUsers().map((user) =>
    user.id === updatedRecord.id ? updatedRecord : user,
  );
  saveMockUsers(users);

  const user = toMockUser(updatedRecord);
  const session = createMockSession(user);
  saveMockSession(session);
  notifyAuthStateChange("SIGNED_IN", session);

  return { user, error: null };
};

/**
 * 注册新用户；未配置 Supabase 时使用 localStorage 模拟账户体系。
 * @param email 用户邮箱。
 * @param password 用户密码。
 * @returns 注册成功返回用户对象；失败时返回错误信息。
 */
export const signUp = async (
  email: string,
  password: string,
): Promise<{ user: User | null; error: Error | null }> => {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return {
        user: null,
        error: createValidationError("Please provide a valid email"),
      };
    }

    if (!supabase) {
      return registerMockUser(normalizedEmail, password);
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      return { user: null, error };
    }

    return { user: data.user, error: null };
  } catch (error) {
    console.error("signUp failed:", error);

    if (shouldFallbackToMock(error)) {
      console.warn("Supabase signUp unreachable. Falling back to mock auth.");
      return registerMockUser(email.trim().toLowerCase(), password);
    }

    return { user: null, error: error as Error };
  }
};

/**
 * 登录用户；未配置 Supabase 时使用 localStorage 模拟登录态。
 * @param email 用户邮箱。
 * @param password 用户密码。
 * @returns 登录成功返回用户对象；失败时返回错误信息。
 */
export const signIn = async (
  email: string,
  password: string,
): Promise<{ user: User | null; error: Error | null }> => {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    if (!supabase) {
      return signInWithMock(normalizedEmail, password);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      return { user: null, error };
    }

    return { user: data.user, error: null };
  } catch (error) {
    console.error("signIn failed:", error);

    if (shouldFallbackToMock(error)) {
      console.warn("Supabase signIn unreachable. Falling back to mock auth.");
      return signInWithMock(email.trim().toLowerCase(), password);
    }

    return { user: null, error: error as Error };
  }
};

/**
 * 退出当前登录用户。
 * @returns 退出成功返回空错误；失败时返回错误对象。
 */
export const signOut = async (): Promise<{ error: Error | null }> => {
  try {
    if (!supabase) {
      saveMockSession(null);
      notifyAuthStateChange("SIGNED_OUT", null);
      return { error: null };
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    console.error("signOut failed:", error);
    return { error: error as Error };
  }
};

/**
 * 发送密码重置请求；mock 模式下仅校验邮箱是否存在。
 * @param email 用户邮箱。
 * @returns 成功返回空错误；失败时返回错误对象。
 */
export const resetPassword = async (
  email: string,
): Promise<{ error: Error | null }> => {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    if (!supabase) {
      const existingUser = findMockUserByEmail(normalizedEmail);
      if (!existingUser) {
        return { error: createValidationError("User not found") };
      }

      return { error: null };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      },
    );

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    console.error("resetPassword failed:", error);
    return { error: error as Error };
  }
};

/**
 * 更新当前登录用户密码；mock 模式下直接修改本地账户记录。
 * @param newPassword 新密码。
 * @returns 成功返回空错误；失败时返回错误对象。
 */
export const updatePassword = async (
  newPassword: string,
): Promise<{ error: Error | null }> => {
  try {
    if (!supabase) {
      const session = getMockSessionSync();
      const currentUserId = session?.user?.id;
      if (!currentUserId) {
        return { error: createValidationError("No active session") };
      }

      const users = getMockUsers();
      const userIndex = users.findIndex((user) => user.id === currentUserId);
      if (userIndex < 0) {
        return { error: createValidationError("User not found") };
      }

      users[userIndex] = {
        ...users[userIndex],
        password: newPassword,
        updatedAt: new Date().toISOString(),
      };
      saveMockUsers(users);

      const updatedSession = createMockSession(toMockUser(users[userIndex]));
      saveMockSession(updatedSession);
      notifyAuthStateChange("USER_UPDATED", updatedSession);

      return { error: null };
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    console.error("updatePassword failed:", error);
    return { error: error as Error };
  }
};

/**
 * 获取当前登录会话。
 * @returns 当前 Session；读取失败或未登录时返回 null。
 */
export const getSession = async (): Promise<Session | null> => {
  try {
    if (!supabase) {
      return getMockSessionSync();
    }

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      console.error("Error getting session:", error);
      return null;
    }

    return session;
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
};

/**
 * 获取当前登录用户。
 * @returns 当前用户；读取失败或未登录时返回 null。
 */
export const getUser = async (): Promise<User | null> => {
  try {
    if (!supabase) {
      const session = getMockSessionSync();
      return session?.user ?? null;
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      console.error("Error getting user:", error);
      return null;
    }

    return user;
  } catch (error) {
    console.error("Error getting user:", error);
    return null;
  }
};

/**
 * 订阅认证状态变化；mock 模式下在本地维护监听器集合。
 * @param callback 认证状态变化回调。
 * @returns 用于取消订阅的函数。
 */
export const onAuthStateChange = (
  callback: (event: string, session: Session | null) => void,
): (() => void) => {
  if (!supabase) {
    authStateListeners.add(callback);
    queueMicrotask(() => {
      callback("INITIAL_SESSION", getMockSessionSync());
    });

    return () => {
      authStateListeners.delete(callback);
    };
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return () => subscription.unsubscribe();
};

/**
 * 判断当前是否已配置真实 Supabase 凭证。
 * @returns 配置完成返回 true，否则返回 false。
 */
export const isSupabaseConfigured = (): boolean => {
  return supabaseConfigured;
};
