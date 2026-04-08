import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseService";

const USER_PROFILES_KEY = "patentmate_user_profiles";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  jobTitle: string;
  phone: string;
  avatarUrl: string;
  defaultOrganizationName: string;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
}

export interface UpdateUserProfileInput {
  name: string;
  jobTitle: string;
  phone: string;
  avatarUrl: string;
  defaultOrganizationName: string;
}

const normalizeString = (value: unknown): string => {
  return typeof value === "string" ? value : "";
};

const normalizeUserProfile = (profile: Partial<UserProfile>): UserProfile => {
  const now = Date.now();

  return {
    id: normalizeString(profile.id),
    email: normalizeString(profile.email),
    name: normalizeString(profile.name),
    jobTitle: normalizeString(profile.jobTitle),
    phone: normalizeString(profile.phone),
    avatarUrl: normalizeString(profile.avatarUrl),
    defaultOrganizationName: normalizeString(profile.defaultOrganizationName),
    createdAt: typeof profile.createdAt === "number" ? profile.createdAt : now,
    updatedAt: typeof profile.updatedAt === "number" ? profile.updatedAt : now,
    lastLoginAt:
      typeof profile.lastLoginAt === "number" ? profile.lastLoginAt : now,
  };
};

const saveUserProfiles = (profiles: UserProfile[]): void => {
  localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles));
};

const readMetadataValue = (user: User, keys: string[]): string => {
  const metadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : {};

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

/**
 * 读取当前浏览器保存的全部用户资料。
 * @returns 规范化后的用户资料列表；读取失败时返回空数组。
 */
export const getUserProfiles = (): UserProfile[] => {
  try {
    const raw = localStorage.getItem(USER_PROFILES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Array<Partial<UserProfile>>;
    return Array.isArray(parsed) ? parsed.map(normalizeUserProfile) : [];
  } catch (error) {
    console.error("getUserProfiles failed:", error);
    return [];
  }
};

/**
 * 根据用户 ID 获取资料。
 * @param userId 用户唯一标识。
 * @returns 命中的资料对象；未找到时返回 undefined。
 */
export const getUserProfile = (userId: string): UserProfile | undefined => {
  return getUserProfiles().find((profile) => profile.id === userId);
};

/**
 * 确保当前认证用户具备一份可编辑资料，并从 Supabase user_metadata 同步常用字段。
 * @param user 当前认证用户。
 * @returns 已保存的用户资料对象；失败时返回最小化兜底资料。
 */
export const ensureUserProfile = async (user: User): Promise<UserProfile> => {
  try {
    const profiles = getUserProfiles();
    const existingProfile = profiles.find((profile) => profile.id === user.id);
    const now = Date.now();
    const fallbackName = user.email ? user.email.split("@")[0] : "";

    const nextProfile = normalizeUserProfile({
      ...existingProfile,
      id: user.id,
      email: user.email ?? existingProfile?.email ?? "",
      name:
        readMetadataValue(user, ["name", "full_name", "display_name"]) ||
        existingProfile?.name ||
        fallbackName,
      jobTitle:
        readMetadataValue(user, ["jobTitle", "job_title", "title"]) ||
        existingProfile?.jobTitle ||
        "",
      phone:
        normalizeString(user.phone) ||
        readMetadataValue(user, ["phone"]) ||
        existingProfile?.phone ||
        "",
      avatarUrl:
        readMetadataValue(user, ["avatar_url", "avatarUrl"]) ||
        existingProfile?.avatarUrl ||
        "",
      defaultOrganizationName:
        readMetadataValue(user, [
          "defaultOrganizationName",
          "organizationName",
        ]) ||
        existingProfile?.defaultOrganizationName ||
        "",
      createdAt:
        existingProfile?.createdAt ??
        (user.created_at ? Date.parse(user.created_at) : now),
      updatedAt: now,
      lastLoginAt: now,
    });

    const nextProfiles = existingProfile
      ? profiles.map((profile) =>
          profile.id === nextProfile.id ? nextProfile : profile,
        )
      : [...profiles, nextProfile];

    saveUserProfiles(nextProfiles);
    return nextProfile;
  } catch (error) {
    console.error("ensureUserProfile failed:", error);
    return normalizeUserProfile({
      id: user.id,
      email: user.email ?? "",
      name: user.email ? user.email.split("@")[0] : "",
    });
  }
};

/**
 * 更新当前用户资料，并在可用时同步写回 Supabase user_metadata。
 * @param userId 用户唯一标识。
 * @param updates 可编辑资料字段。
 * @returns 更新后的资料或错误信息。
 */
export const updateUserProfile = async (
  userId: string,
  updates: UpdateUserProfileInput,
): Promise<{ profile: UserProfile | null; error: Error | null }> => {
  try {
    const profiles = getUserProfiles();
    const currentProfile = profiles.find((profile) => profile.id === userId);

    if (!currentProfile) {
      return {
        profile: null,
        error: new Error("User profile not found"),
      };
    }

    const nextProfile = normalizeUserProfile({
      ...currentProfile,
      ...updates,
      updatedAt: Date.now(),
    });

    if (supabase) {
      const { error } = await supabase.auth.updateUser({
        data: {
          name: nextProfile.name,
          jobTitle: nextProfile.jobTitle,
          phone: nextProfile.phone,
          avatar_url: nextProfile.avatarUrl,
          defaultOrganizationName: nextProfile.defaultOrganizationName,
        },
      });

      if (error) {
        return {
          profile: null,
          error,
        };
      }
    }

    saveUserProfiles(
      profiles.map((profile) =>
        profile.id === nextProfile.id ? nextProfile : profile,
      ),
    );

    return {
      profile: nextProfile,
      error: null,
    };
  } catch (error) {
    console.error("updateUserProfile failed:", error);
    return {
      profile: null,
      error: error as Error,
    };
  }
};