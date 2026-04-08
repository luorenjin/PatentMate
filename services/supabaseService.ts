import {
  createClient,
  type EmailOtpType,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { AuthNotice, AuthView } from "../types";
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
const AUTH_ACTION_QUERY_KEY = "auth_action";
const AUTH_ACTION_CONFIRM = "confirm";
const AUTH_ACTION_RECOVERY = "recovery";
const KNOWN_AUTH_SEARCH_PARAMS = new Set([
  "code",
  "token_hash",
  "type",
  AUTH_ACTION_QUERY_KEY,
]);
const KNOWN_AUTH_HASH_PARAMS = new Set([
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "provider_token",
  "provider_refresh_token",
  "token_type",
  "type",
  "error",
  "error_code",
  "error_description",
  "state",
  "sb",
]);
const authStateListeners = new Set<
  (event: string, session: Session | null) => void
>();

export interface AuthCallbackResult {
  session: Session | null;
  nextAuthView: AuthView | null;
  notice: AuthNotice | null;
}

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
        detectSessionInUrl: false,
      },
    })
  : null;

const createValidationError = (message: string): Error => {
  return new Error(message);
};

const decodeUrlValue = (value: string | null): string => {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
};

const createAuthNotice = (
  tone: AuthNotice["tone"],
  message: string,
): AuthNotice => {
  return { tone, message };
};

const buildAuthRedirectUrl = (
  action: typeof AUTH_ACTION_CONFIRM | typeof AUTH_ACTION_RECOVERY,
): string => {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set(AUTH_ACTION_QUERY_KEY, action);
  return url.toString();
};

const replaceBrowserUrlWithoutAuthParams = (): void => {
  const url = new URL(window.location.href);

  Array.from(url.searchParams.keys()).forEach((key) => {
    if (KNOWN_AUTH_SEARCH_PARAMS.has(key)) {
      url.searchParams.delete(key);
    }
  });

  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  Array.from(hashParams.keys()).forEach((key) => {
    if (KNOWN_AUTH_HASH_PARAMS.has(key)) {
      hashParams.delete(key);
    }
  });

  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : "";
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
};

const resolveAuthCallbackMode = (
  authType: string | null,
  authAction: string | null,
): "signup" | "recovery" | null => {
  if (authType === "recovery" || authAction === AUTH_ACTION_RECOVERY) {
    return "recovery";
  }

  if (authType === "signup" || authAction === AUTH_ACTION_CONFIRM) {
    return "signup";
  }

  return null;
};

const getCallbackSuccessNotice = (
  mode: "signup" | "recovery" | null,
): AuthNotice | null => {
  if (mode === "signup") {
    return createAuthNotice("success", "邮箱验证成功，账户已激活。");
  }

  if (mode === "recovery") {
    return createAuthNotice("info", "验证通过，请设置新密码。");
  }

  return null;
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

  const normalizedMessage = decodeUrlValue(message);

  if (normalizedMessage.includes("Invalid login credentials")) {
    return "邮箱或密码错误";
  }

  if (normalizedMessage.includes("Email not confirmed")) {
    return "请先验证邮箱后再登录";
  }

  if (
    normalizedMessage.includes("User already registered") ||
    normalizedMessage.includes("already registered")
  ) {
    return "该邮箱已被注册";
  }

  if (
    normalizedMessage.includes("Please provide a valid email") ||
    normalizedMessage.includes("valid email")
  ) {
    return "请输入有效的邮箱地址";
  }

  if (
    normalizedMessage.includes("User not found") ||
    normalizedMessage.includes("not found")
  ) {
    return "该邮箱未注册";
  }

  if (normalizedMessage.includes("Member already exists")) {
    return "该成员已在组织中";
  }

  if (normalizedMessage.includes("Member not found")) {
    return "未找到该成员，请刷新后重试";
  }

  if (normalizedMessage.includes("Plan member limit reached")) {
    return "当前 Plan 成员席位已满，请先升级计划后再添加成员";
  }

  if (normalizedMessage.includes("Plan admin limit reached")) {
    return "当前 Plan 管理员配额已满，请升级计划后再分配管理员角色";
  }

  if (normalizedMessage.includes("Role not allowed for current plan")) {
    return "当前 Plan 不支持该角色，请升级计划后再使用";
  }

  if (normalizedMessage.includes("Plan downgrade blocked by assigned roles")) {
    return "目标 Plan 不支持当前组织中的部分角色，请先调整成员角色";
  }

  if (normalizedMessage.includes("Plan downgrade blocked by member count")) {
    return "当前成员数量超过目标 Plan 上限，请先减少成员或保留当前计划";
  }

  if (normalizedMessage.includes("Plan downgrade blocked by admin count")) {
    return "当前管理员数量超过目标 Plan 上限，请先调整管理员数量";
  }

  if (normalizedMessage.includes("User profile not found")) {
    return "当前账户资料不存在，请重新登录后再试";
  }

  if (normalizedMessage.includes("Organization not found")) {
    return "未找到当前组织，请重新登录后再试";
  }

  if (normalizedMessage.includes("No active session")) {
    return "当前未登录，请重新登录后再试";
  }

  if (
    normalizedMessage.includes("Email link is invalid or has expired") ||
    normalizedMessage.includes("otp_expired")
  ) {
    return "邮件确认链接无效或已过期，请重新发送验证邮件。";
  }

  if (normalizedMessage.includes("access_denied")) {
    return "认证被拒绝，请重新尝试当前操作。";
  }

  if (normalizedMessage.includes("Token has expired")) {
    return "验证令牌已过期，请重新发起操作。";
  }

  if (
    normalizedMessage.includes("Failed to fetch") ||
    normalizedMessage.includes("NetworkError") ||
    normalizedMessage.includes("ERR_NAME_NOT_RESOLVED")
  ) {
    return "网络连接失败，请稍后重试";
  }

  return normalizedMessage;
};

/**
 * 处理 Supabase 邮件确认与密码恢复回跳，统一消费 URL 中的认证参数并清理地址栏。
 * @returns 包含会话、建议显示的认证视图以及界面提示。
 */
export const handleAuthCallback = async (): Promise<AuthCallbackResult> => {
  try {
    if (!supabase) {
      return {
        session: null,
        nextAuthView: null,
        notice: null,
      };
    }

    const url = new URL(window.location.href);
    const searchParams = url.searchParams;
    const hashParams = new URLSearchParams(
      url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
    );

    const authAction = searchParams.get(AUTH_ACTION_QUERY_KEY);
    const authType = searchParams.get("type") ?? hashParams.get("type");
    const authMode = resolveAuthCallbackMode(authType, authAction);
    const errorDescription =
      hashParams.get("error_description") ?? searchParams.get("error_description");
    const errorCode = hashParams.get("error_code") ?? searchParams.get("error");

    if (errorDescription || errorCode) {
      replaceBrowserUrlWithoutAuthParams();
      return {
        session: null,
        nextAuthView: "LOGIN",
        notice: createAuthNotice(
          "error",
          translateAuthErrorMessage(errorDescription || errorCode || ""),
        ),
      };
    }

    const tokenHash = searchParams.get("token_hash");
    if (tokenHash && authType) {
      const { data, error } = await supabase.auth.verifyOtp({
        type: authType as EmailOtpType,
        token_hash: tokenHash,
      });

      replaceBrowserUrlWithoutAuthParams();

      if (error) {
        return {
          session: null,
          nextAuthView: "LOGIN",
          notice: createAuthNotice(
            "error",
            translateAuthErrorMessage(error.message),
          ),
        };
      }

      return {
        session: data.session ?? null,
        nextAuthView: authMode === "recovery" ? "PASSWORD_UPDATE" : null,
        notice: getCallbackSuccessNotice(authMode),
      };
    }

    const authCode = searchParams.get("code");
    if (authCode) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);

      replaceBrowserUrlWithoutAuthParams();

      if (error) {
        return {
          session: null,
          nextAuthView: "LOGIN",
          notice: createAuthNotice(
            "error",
            translateAuthErrorMessage(error.message),
          ),
        };
      }

      return {
        session: data.session,
        nextAuthView: authMode === "recovery" ? "PASSWORD_UPDATE" : null,
        notice: getCallbackSuccessNotice(authMode),
      };
    }

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      replaceBrowserUrlWithoutAuthParams();

      if (error) {
        return {
          session: null,
          nextAuthView: "LOGIN",
          notice: createAuthNotice(
            "error",
            translateAuthErrorMessage(error.message),
          ),
        };
      }

      return {
        session: data.session,
        nextAuthView: authMode === "recovery" ? "PASSWORD_UPDATE" : null,
        notice: getCallbackSuccessNotice(authMode),
      };
    }

    if (authAction) {
      replaceBrowserUrlWithoutAuthParams();
      const session = await getSession();
      return {
        session,
        nextAuthView:
          authMode === "recovery" && session ? "PASSWORD_UPDATE" : null,
        notice: session ? getCallbackSuccessNotice(authMode) : null,
      };
    }

    return {
      session: null,
      nextAuthView: null,
      notice: null,
    };
  } catch (error) {
    console.error("handleAuthCallback failed:", error);
    replaceBrowserUrlWithoutAuthParams();
    return {
      session: null,
      nextAuthView: "LOGIN",
      notice: createAuthNotice(
        "error",
        translateAuthErrorMessage((error as Error).message),
      ),
    };
  }
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
        emailRedirectTo: buildAuthRedirectUrl(AUTH_ACTION_CONFIRM),
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
        redirectTo: buildAuthRedirectUrl(AUTH_ACTION_RECOVERY),
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
 * 重新发送注册确认邮件，便于处理邮件链接过期或未收到邮件的情况。
 * @param email 用户邮箱。
 * @returns 成功返回空错误；失败时返回错误对象。
 */
export const resendConfirmationEmail = async (
  email: string,
): Promise<{ error: Error | null }> => {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return {
        error: createValidationError('Please provide a valid email'),
      };
    }

    if (!supabase) {
      return { error: null };
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: {
        emailRedirectTo: buildAuthRedirectUrl(AUTH_ACTION_CONFIRM),
      },
    });

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    console.error('resendConfirmationEmail failed:', error);
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
