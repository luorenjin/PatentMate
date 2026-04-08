import { generateUuid } from "./idService";
import { getPatents, savePatentToStorage } from "./storageService";
import { supabase } from "./supabaseService";

const ORGANIZATIONS_KEY = "patent_pro_organizations";
const SUPABASE_ORGANIZATIONS_TABLE = "organizations";
const DEFAULT_ORGANIZATION_NAME = "我的团队";
const ORGANIZATION_PLANS = ["free", "team", "enterprise"] as const;
const ORGANIZATION_MEMBER_ROLES = [
  "owner",
  "admin",
  "member",
  "viewer",
] as const;
const ORGANIZATION_MEMBER_STATUSES = ["active", "invited"] as const;

export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];
export type OrganizationMemberRole = (typeof ORGANIZATION_MEMBER_ROLES)[number];
export type OrganizationMemberStatus =
  (typeof ORGANIZATION_MEMBER_STATUSES)[number];

export interface OrganizationMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  title: string;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  joinedAt: number;
}

export interface Organization {
  id: string;
  name: string;
  description: string;
  plan: OrganizationPlan;
  ownerId: string;
  ownerEmail: string;
  members: OrganizationMember[];
  createdAt: number;
  lastModified: number;
}

export interface CreateOrganizationInput {
  name: string;
  ownerId: string;
  ownerEmail: string;
  ownerName?: string;
  ownerTitle?: string;
  description?: string;
  plan?: OrganizationPlan;
}

export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
  plan?: OrganizationPlan;
}

export interface OrganizationMemberInput {
  userId?: string;
  email: string;
  name?: string;
  title?: string;
  role?: OrganizationMemberRole;
  status?: OrganizationMemberStatus;
}

export interface DefaultOrganizationOptions {
  ownerEmail?: string;
  ownerName?: string;
  ownerTitle?: string;
  preferredName?: string;
}

export interface OrganizationPlanLimits {
  maxMembers: number | null;
  maxAdmins: number | null;
  allowedRoles: OrganizationMemberRole[];
}

export interface OrganizationPlanUsage {
  totalMembers: number;
  activeMembers: number;
  invitedMembers: number;
  adminMembers: number;
  remainingMemberSlots: number | null;
  remainingAdminSlots: number | null;
}

export interface OrganizationMutationResult {
  organization: Organization | null;
  error: Error | null;
}

interface OrganizationRow {
  id: string;
  name: string;
  description: string;
  plan: OrganizationPlan;
  owner_id: string;
  owner_email: string;
  created_at: number;
  last_modified: number;
  payload: Organization;
}

const ORGANIZATION_PLAN_LIMITS: Record<OrganizationPlan, OrganizationPlanLimits> = {
  free: {
    maxMembers: 3,
    maxAdmins: 1,
    allowedRoles: ["owner", "member"],
  },
  team: {
    maxMembers: 10,
    maxAdmins: 3,
    allowedRoles: ["owner", "admin", "member", "viewer"],
  },
  enterprise: {
    maxMembers: null,
    maxAdmins: null,
    allowedRoles: ["owner", "admin", "member", "viewer"],
  },
};

const normalizeString = (value: unknown): string => {
  return typeof value === "string" ? value : "";
};

const isSupabaseRelationMissingError = (
  error: { code?: string; message?: string } | null | undefined,
): boolean => {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    /relation .* does not exist/i.test(error.message ?? "") ||
    /Could not find the table/i.test(error.message ?? "")
  );
};

const normalizePlan = (value: unknown): OrganizationPlan => {
  return ORGANIZATION_PLANS.includes(value as OrganizationPlan)
    ? (value as OrganizationPlan)
    : "free";
};

const normalizeRole = (value: unknown): OrganizationMemberRole => {
  return ORGANIZATION_MEMBER_ROLES.includes(value as OrganizationMemberRole)
    ? (value as OrganizationMemberRole)
    : "member";
};

const normalizeStatus = (value: unknown): OrganizationMemberStatus => {
  return ORGANIZATION_MEMBER_STATUSES.includes(
    value as OrganizationMemberStatus,
  )
    ? (value as OrganizationMemberStatus)
    : "active";
};

const hasFiniteLimit = (limit: number | null): limit is number => {
  return typeof limit === "number";
};

const isManagerRole = (role: OrganizationMemberRole): boolean => {
  return role === "owner" || role === "admin";
};

const isRoleAllowedForPlan = (
  plan: OrganizationPlan,
  role: OrganizationMemberRole,
): boolean => {
  return ORGANIZATION_PLAN_LIMITS[plan].allowedRoles.includes(role);
};

const normalizeMember = (
  member: Partial<OrganizationMember>,
): OrganizationMember => {
  const now = Date.now();

  return {
    id: normalizeString(member.id) || generateUuid(),
    userId: normalizeString(member.userId),
    email: normalizeString(member.email).trim().toLowerCase(),
    name: normalizeString(member.name),
    title: normalizeString(member.title),
    role: normalizeRole(member.role),
    status: normalizeStatus(member.status),
    joinedAt: typeof member.joinedAt === "number" ? member.joinedAt : now,
  };
};

const isOwnerMemberIdentity = (
  organization: Pick<Organization, "ownerId" | "ownerEmail">,
  member: Pick<OrganizationMember, "userId" | "email">,
): boolean => {
  const ownerId = normalizeString(organization.ownerId);
  const ownerEmail = normalizeString(organization.ownerEmail).trim().toLowerCase();
  const memberUserId = normalizeString(member.userId);
  const memberEmail = normalizeString(member.email).trim().toLowerCase();

  if (ownerId && memberUserId) {
    return ownerId === memberUserId;
  }

  if (ownerEmail && memberEmail) {
    return ownerEmail === memberEmail;
  }

  return false;
};

const getFallbackRoleForFormerOwner = (
  plan: OrganizationPlan,
): OrganizationMemberRole => {
  return isRoleAllowedForPlan(plan, "admin") ? "admin" : "member";
};

const enforceSingleOwnerMember = (
  organization: Organization,
): Organization => {
  const fallbackRole = getFallbackRoleForFormerOwner(organization.plan);
  let hasOwnerMember = false;

  const nextMembers = organization.members.map((member) => {
    if (isOwnerMemberIdentity(organization, member)) {
      hasOwnerMember = true;

      return normalizeMember({
        ...member,
        userId: organization.ownerId || member.userId,
        email: organization.ownerEmail || member.email,
        role: "owner",
        status: "active",
      });
    }

    if (member.role === "owner") {
      return normalizeMember({
        ...member,
        role: fallbackRole,
      });
    }

    return member;
  });

  if (!hasOwnerMember && (organization.ownerId || organization.ownerEmail)) {
    nextMembers.unshift(
      normalizeMember({
        id: generateUuid(),
        userId: organization.ownerId,
        email: organization.ownerEmail,
        role: "owner",
        status: "active",
        joinedAt: Date.now(),
      }),
    );
  }

  return {
    ...organization,
    members: nextMembers,
  };
};

const normalizeOrganization = (org: Partial<Organization>): Organization => {
  const now = Date.now();
  const members = Array.isArray(org.members)
    ? org.members.map(normalizeMember)
    : [];

  const organization = {
    id: normalizeString(org.id) || generateUuid(),
    name: normalizeString(org.name) || DEFAULT_ORGANIZATION_NAME,
    description: normalizeString(org.description),
    plan: normalizePlan(org.plan),
    ownerId: normalizeString(org.ownerId),
    ownerEmail: normalizeString(org.ownerEmail).trim().toLowerCase(),
    members,
    createdAt: typeof org.createdAt === "number" ? org.createdAt : now,
    lastModified: typeof org.lastModified === "number" ? org.lastModified : now,
  };

  return enforceSingleOwnerMember(organization);
};

const saveOrganizations = (organizations: Organization[]): void => {
  localStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(organizations));
};

const upsertOrganization = (organization: Organization): Organization[] => {
  const organizations = getOrganizations();
  const nextOrganizations = organizations.some((item) => item.id === organization.id)
    ? organizations.map((item) =>
        item.id === organization.id ? organization : item,
      )
    : [...organizations, organization];

  saveOrganizations(nextOrganizations);
  return nextOrganizations;
};

const filterOrganizations = (
  organizations: Organization[],
  filters: {
    orgId?: string;
    ownerId?: string;
  } = {},
): Organization[] => {
  return organizations.filter((organization) => {
    if (filters.orgId && organization.id !== filters.orgId) {
      return false;
    }

    if (filters.ownerId && organization.ownerId !== filters.ownerId) {
      return false;
    }

    return true;
  });
};

const mapOrganizationToRow = (organization: Organization): OrganizationRow => {
  const normalizedOrganization = normalizeOrganization(organization);

  return {
    id: normalizedOrganization.id,
    name: normalizedOrganization.name,
    description: normalizedOrganization.description,
    plan: normalizedOrganization.plan,
    owner_id: normalizedOrganization.ownerId,
    owner_email: normalizedOrganization.ownerEmail,
    created_at: normalizedOrganization.createdAt,
    last_modified: normalizedOrganization.lastModified,
    payload: normalizedOrganization,
  };
};

const mapRowToOrganization = (row: Partial<OrganizationRow>): Organization => {
  const payload = row.payload && typeof row.payload === "object"
    ? (row.payload as Partial<Organization>)
    : {};

  return normalizeOrganization({
    ...payload,
    id: normalizeString(row.id) || payload.id,
    name: normalizeString(row.name) || payload.name,
    description: normalizeString(row.description) || payload.description,
    plan: (row.plan as OrganizationPlan) || payload.plan,
    ownerId: normalizeString(row.owner_id) || payload.ownerId,
    ownerEmail: normalizeString(row.owner_email) || payload.ownerEmail,
    createdAt:
      typeof row.created_at === "number" ? row.created_at : payload.createdAt,
    lastModified:
      typeof row.last_modified === "number"
        ? row.last_modified
        : payload.lastModified,
  });
};

const mergeRemoteOrganizationsIntoCache = (
  remoteOrganizations: Organization[],
): Organization[] => {
  const organizationsById = new Map<string, Organization>();

  getOrganizations().forEach((organization) => {
    organizationsById.set(organization.id, organization);
  });

  remoteOrganizations.forEach((organization) => {
    organizationsById.set(organization.id, organization);
  });

  const mergedOrganizations = Array.from(organizationsById.values());
  saveOrganizations(mergedOrganizations);
  return mergedOrganizations;
};

const persistOrganizationToSupabase = async (
  organization: Organization,
): Promise<Error | null> => {
  if (!supabase) {
    return null;
  }

  const { error } = await supabase
    .from(SUPABASE_ORGANIZATIONS_TABLE)
    .upsert(mapOrganizationToRow(organization), { onConflict: "id" });

  if (!error) {
    return null;
  }

  if (isSupabaseRelationMissingError(error)) {
    console.error(
      "Supabase table organizations is missing. Run the SQL migration before enabling organization persistence.",
      error,
    );
  } else {
    console.error("persistOrganizationToSupabase failed:", error);
  }

  return error;
};

const loadOrganizationsFromSupabase = async (
  filters: {
    orgId?: string;
    ownerId?: string;
  } = {},
): Promise<Organization[] | null> => {
  if (!supabase) {
    return null;
  }

  let query = supabase.from(SUPABASE_ORGANIZATIONS_TABLE).select("*");

  if (filters.orgId) {
    query = query.eq("id", filters.orgId);
  }

  if (filters.ownerId) {
    query = query.eq("owner_id", filters.ownerId);
  }

  const { data, error } = await query.order("last_modified", { ascending: false });

  if (error) {
    if (isSupabaseRelationMissingError(error)) {
      console.error(
        "Supabase table organizations is missing. Falling back to local organization cache.",
        error,
      );
    } else {
      console.error("loadOrganizationsFromSupabase failed:", error);
    }

    return null;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => mapRowToOrganization(row as Partial<OrganizationRow>));
};

/**
 * 从 Supabase 按条件拉取组织并刷新本地缓存。
 * @param filters 组织 ID 或 owner ID 过滤条件。
 * @returns 远端可用时返回远端结果，否则回退到本地缓存。
 */
export const loadOrganizations = async (
  filters: {
    orgId?: string;
    ownerId?: string;
  } = {},
): Promise<Organization[]> => {
  const remoteOrganizations = await loadOrganizationsFromSupabase(filters);
  if (!remoteOrganizations) {
    return filterOrganizations(getOrganizations(), filters);
  }

  mergeRemoteOrganizationsIntoCache(remoteOrganizations);
  return filterOrganizations(remoteOrganizations, filters);
};

/**
 * 从 Supabase 或本地缓存中读取单个组织。
 * @param orgId 组织唯一标识。
 * @returns 命中的组织对象；未找到时返回 undefined。
 */
export const loadOrganization = async (
  orgId: string,
): Promise<Organization | undefined> => {
  const organizations = await loadOrganizations({ orgId });
  return organizations[0];
};

/**
 * 从 Supabase 或本地缓存中读取指定 owner 的组织列表。
 * @param ownerId 所有者用户 ID。
 * @returns owner 名下的组织列表。
 */
export const loadOrganizationsByOwner = async (
  ownerId: string,
): Promise<Organization[]> => {
  return loadOrganizations({ ownerId });
};

const findMemberIndex = (
  organization: Organization,
  member: Pick<OrganizationMember, "email" | "userId">,
): number => {
  return organization.members.findIndex((item) => {
    if (member.userId && item.userId) {
      return item.userId === member.userId;
    }

    return (
      item.email.trim().toLowerCase() === member.email.trim().toLowerCase()
    );
  });
};

const validateMemberSeatAvailability = (
  organization: Organization,
): Error | null => {
  const limits = getOrganizationPlanLimits(organization.plan);
  if (
    hasFiniteLimit(limits.maxMembers) &&
    organization.members.length >= limits.maxMembers
  ) {
    return new Error("Plan member limit reached");
  }

  return null;
};

const validateMemberRoleForPlan = (
  organization: Organization,
  role: OrganizationMemberRole,
  memberId?: string,
): Error | null => {
  if (!isRoleAllowedForPlan(organization.plan, role)) {
    return new Error("Role not allowed for current plan");
  }

  if (role !== "admin") {
    return null;
  }

  const limits = getOrganizationPlanLimits(organization.plan);
  if (!hasFiniteLimit(limits.maxAdmins)) {
    return null;
  }

  const currentMember = memberId
    ? organization.members.find((member) => member.id === memberId)
    : undefined;
  const alreadyCountsAsAdmin = currentMember
    ? isManagerRole(currentMember.role)
    : false;
  const usage = getOrganizationPlanUsage(organization);

  if (!alreadyCountsAsAdmin && usage.adminMembers >= limits.maxAdmins) {
    return new Error("Plan admin limit reached");
  }

  return null;
};

/**
 * 获取指定 Plan 的成员与角色配额。
 * @param plan 组织当前或目标 Plan。
 * @returns Plan 对应的配额与允许角色集合。
 */
export const getOrganizationPlanLimits = (
  plan: OrganizationPlan,
): OrganizationPlanLimits => {
  return ORGANIZATION_PLAN_LIMITS[plan];
};

/**
 * 获取指定 Plan 可分配的成员角色列表。
 * @param plan 组织当前或目标 Plan。
 * @returns 当前 Plan 允许的角色数组。
 */
export const getAvailableRolesForPlan = (
  plan: OrganizationPlan,
): OrganizationMemberRole[] => {
  return [...ORGANIZATION_PLAN_LIMITS[plan].allowedRoles];
};

/**
 * 统计组织当前 Plan 使用量，包括成员席位与管理员配额占用。
 * @param organization 当前组织对象。
 * @returns 可用于界面展示和配额判断的使用情况。
 */
export const getOrganizationPlanUsage = (
  organization: Organization,
): OrganizationPlanUsage => {
  const limits = getOrganizationPlanLimits(organization.plan);
  const activeMembers = organization.members.filter(
    (member) => member.status === "active",
  ).length;
  const totalMembers = organization.members.length;
  const adminMembers = organization.members.filter((member) =>
    isManagerRole(member.role),
  ).length;

  return {
    totalMembers,
    activeMembers,
    invitedMembers: totalMembers - activeMembers,
    adminMembers,
    remainingMemberSlots: hasFiniteLimit(limits.maxMembers)
      ? Math.max(limits.maxMembers - totalMembers, 0)
      : null,
    remainingAdminSlots: hasFiniteLimit(limits.maxAdmins)
      ? Math.max(limits.maxAdmins - adminMembers, 0)
      : null,
  };
};

/**
 * 校验组织是否可以切换到目标 Plan，常用于降级前检查当前使用量。
 * @param organization 当前组织对象。
 * @param nextPlan 目标 Plan。
 * @returns 不可切换时返回错误文案键；可切换时返回 null。
 */
export const getOrganizationPlanChangeError = (
  organization: Organization,
  nextPlan: OrganizationPlan,
): string | null => {
  if (organization.plan === nextPlan) {
    return null;
  }

  const nextLimits = getOrganizationPlanLimits(nextPlan);
  const usage = getOrganizationPlanUsage(organization);

  if (
    organization.members.some(
      (member) => !isRoleAllowedForPlan(nextPlan, member.role),
    )
  ) {
    return "Plan downgrade blocked by assigned roles";
  }

  if (
    hasFiniteLimit(nextLimits.maxMembers) &&
    usage.totalMembers > nextLimits.maxMembers
  ) {
    return "Plan downgrade blocked by member count";
  }

  if (
    hasFiniteLimit(nextLimits.maxAdmins) &&
    usage.adminMembers > nextLimits.maxAdmins
  ) {
    return "Plan downgrade blocked by admin count";
  }

  return null;
};

/**
 * 读取全部组织数据。
 * @returns 规范化后的组织列表；读取失败时返回空数组。
 */
export const getOrganizations = (): Organization[] => {
  try {
    const raw = localStorage.getItem(ORGANIZATIONS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Array<Partial<Organization>>;
    return Array.isArray(parsed) ? parsed.map(normalizeOrganization) : [];
  } catch (error) {
    console.error("getOrganizations failed:", error);
    return [];
  }
};

/**
 * 根据组织 ID 获取单个组织。
 * @param orgId 组织唯一标识。
 * @returns 命中的组织对象；未找到时返回 undefined。
 */
export const getOrganization = (orgId: string): Organization | undefined => {
  return getOrganizations().find((organization) => organization.id === orgId);
};

/**
 * 根据所有者 ID 获取其创建的组织列表。
 * @param ownerId 所有者用户 ID。
 * @returns 该用户拥有的组织列表。
 */
export const getOrganizationsByOwner = (ownerId: string): Organization[] => {
  return getOrganizations().filter((organization) => organization.ownerId === ownerId);
};

/**
 * 创建一个新组织，并自动写入 owner 成员。
 * @param input 组织基础信息。
 * @returns 新创建并已持久化的组织对象。
 */
export const createOrganization = async (
  input: CreateOrganizationInput,
): Promise<Organization> => {
  const now = Date.now();

  const organization = normalizeOrganization({
    id: generateUuid(),
    name: input.name.trim() || DEFAULT_ORGANIZATION_NAME,
    description: input.description?.trim() || "",
    plan: input.plan || "free",
    ownerId: input.ownerId,
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    members: [
      {
        id: generateUuid(),
        userId: input.ownerId,
        email: input.ownerEmail,
        name: input.ownerName || "",
        title: input.ownerTitle || "",
        role: "owner",
        status: "active",
        joinedAt: now,
      },
    ],
    createdAt: now,
    lastModified: now,
  });

  upsertOrganization(organization);
  await persistOrganizationToSupabase(organization);
  return organization;
};

/**
 * 更新组织基础信息。
 * @param orgId 组织唯一标识。
 * @param data 可编辑的组织字段。
 * @returns 更新后的组织；未找到时返回 null。
 */
export const updateOrganization = async (
  orgId: string,
  data: UpdateOrganizationInput,
): Promise<Organization | null> => {
  const organization = getOrganization(orgId);
  if (!organization) {
    return null;
  }

  const nextOrganization = normalizeOrganization({
    ...organization,
    ...data,
    name: data.name?.trim() || organization.name,
    description: data.description?.trim() ?? organization.description,
    lastModified: Date.now(),
  });

  upsertOrganization(nextOrganization);
  const persistenceError = await persistOrganizationToSupabase(nextOrganization);
  if (persistenceError) {
    throw persistenceError;
  }

  return nextOrganization;
};

/**
 * 在满足当前使用量约束的前提下切换组织 Plan。
 * @param orgId 组织唯一标识。
 * @param nextPlan 目标 Plan。
 * @returns 更新后的组织或错误信息。
 */
export const changeOrganizationPlan = async (
  orgId: string,
  nextPlan: OrganizationPlan,
): Promise<OrganizationMutationResult> => {
  try {
    const organization = getOrganization(orgId);
    if (!organization) {
      return {
        organization: null,
        error: new Error("Organization not found"),
      };
    }

    const planError = getOrganizationPlanChangeError(organization, nextPlan);
    if (planError) {
      return {
        organization: null,
        error: new Error(planError),
      };
    }

    const updatedOrganization = await updateOrganization(orgId, { plan: nextPlan });
    if (!updatedOrganization) {
      return {
        organization: null,
        error: new Error("Organization update failed"),
      };
    }

    return {
      organization: updatedOrganization,
      error: null,
    };
  } catch (error) {
    console.error("changeOrganizationPlan failed:", error);
    return {
      organization: null,
      error: error as Error,
    };
  }
};

/**
 * 向组织中新增成员或邀请记录。
 * @param orgId 组织唯一标识。
 * @param input 成员信息。
 * @returns 更新后的组织或错误。
 */
export const addOrganizationMember = async (
  orgId: string,
  input: OrganizationMemberInput,
): Promise<OrganizationMutationResult> => {
  try {
    const organization = getOrganization(orgId);
    if (!organization) {
      return {
        organization: null,
        error: new Error("Organization not found"),
      };
    }

    const email = input.email.trim().toLowerCase();
    if (!email) {
      return {
        organization: null,
        error: new Error("Member email is required"),
      };
    }

    if (
      organization.members.some(
        (member) => member.email.trim().toLowerCase() === email,
      )
    ) {
      return {
        organization: null,
        error: new Error("Member already exists"),
      };
    }

    const seatError = validateMemberSeatAvailability(organization);
    if (seatError) {
      return {
        organization: null,
        error: seatError,
      };
    }

    const nextRole = input.role || "member";
    const roleError = validateMemberRoleForPlan(organization, nextRole);
    if (roleError) {
      return {
        organization: null,
        error: roleError,
      };
    }

    const nextOrganization = normalizeOrganization({
      ...organization,
      members: [
        ...organization.members,
        {
          id: generateUuid(),
          userId: input.userId || "",
          email,
          name: input.name || "",
          title: input.title || "",
          role: nextRole,
          status: input.status || (input.userId ? "active" : "invited"),
          joinedAt: Date.now(),
        },
      ],
      lastModified: Date.now(),
    });

    upsertOrganization(nextOrganization);
    const persistenceError = await persistOrganizationToSupabase(nextOrganization);
    if (persistenceError) {
      return {
        organization: null,
        error: persistenceError,
      };
    }

    return {
      organization: nextOrganization,
      error: null,
    };
  } catch (error) {
    console.error("addOrganizationMember failed:", error);
    return {
      organization: null,
      error: error as Error,
    };
  }
};

/**
 * 更新组织成员信息与角色。
 * @param orgId 组织唯一标识。
 * @param memberId 成员唯一标识。
 * @param data 允许更新的成员字段。
 * @returns 更新后的组织；未找到时返回 null。
 */
export const updateOrganizationMember = async (
  orgId: string,
  memberId: string,
  data: Partial<
    Pick<OrganizationMember, "email" | "name" | "title" | "role" | "status">
  >,
): Promise<OrganizationMutationResult> => {
  try {
    const organization = getOrganization(orgId);
    if (!organization) {
      return {
        organization: null,
        error: new Error("Organization not found"),
      };
    }

    const currentMember = organization.members.find((member) => member.id === memberId);
    if (!currentMember) {
      return {
        organization: null,
        error: new Error("Member not found"),
      };
    }

    const isCurrentOwner = isOwnerMemberIdentity(organization, currentMember);
    const fallbackRole = getFallbackRoleForFormerOwner(organization.plan);
    const nextRole = isCurrentOwner
      ? "owner"
      : data.role || (currentMember.role === "owner" ? fallbackRole : currentMember.role);
    const roleError = validateMemberRoleForPlan(organization, nextRole, memberId);
    if (roleError) {
      return {
        organization: null,
        error: roleError,
      };
    }

    const nextMembers = organization.members.map((member) => {
      if (member.id !== memberId) {
        return member;
      }

      return normalizeMember({
        ...member,
        ...data,
        email: data.email?.trim().toLowerCase() || member.email,
        role: nextRole,
        status: data.status || member.status,
      });
    });

    const nextOrganization = normalizeOrganization({
      ...organization,
      members: nextMembers,
      lastModified: Date.now(),
    });

    upsertOrganization(nextOrganization);
    const persistenceError = await persistOrganizationToSupabase(nextOrganization);
    if (persistenceError) {
      return {
        organization: null,
        error: persistenceError,
      };
    }

    return {
      organization: nextOrganization,
      error: null,
    };
  } catch (error) {
    console.error("updateOrganizationMember failed:", error);
    return {
      organization: null,
      error: error as Error,
    };
  }
};

/**
 * 移除组织中的指定成员；owner 不允许被删除。
 * @param orgId 组织唯一标识。
 * @param memberId 成员唯一标识。
 * @returns 删除成功返回 true，否则返回 false。
 */
export const removeOrganizationMember = async (
  orgId: string,
  memberId: string,
): Promise<OrganizationMutationResult> => {
  const organization = getOrganization(orgId);
  if (!organization) {
    return {
      organization: null,
      error: new Error("Organization not found"),
    };
  }

  const targetMember = organization.members.find((member) => member.id === memberId);
  if (!targetMember || isOwnerMemberIdentity(organization, targetMember)) {
    return {
      organization: null,
      error: new Error("Member cannot be removed"),
    };
  }

  const nextOrganization = normalizeOrganization({
    ...organization,
    members: organization.members.filter((member) => member.id !== memberId),
    lastModified: Date.now(),
  });

  upsertOrganization(nextOrganization);
  const persistenceError = await persistOrganizationToSupabase(nextOrganization);
  if (persistenceError) {
    return {
      organization: null,
      error: persistenceError,
    };
  }

  return {
    organization: nextOrganization,
    error: null,
  };
};

/**
 * 将当前登录用户信息同步到组织 owner 成员条目中，保证邮箱、姓名和职位一致。
 * @param orgId 组织唯一标识。
 * @param owner 当前 owner 的关键信息。
 * @returns 更新后的组织；未找到时返回 null。
 */
export const syncOrganizationOwnerMember = async (
  orgId: string,
  owner: {
    userId: string;
    email: string;
    name?: string;
    title?: string;
  },
): Promise<Organization | null> => {
  const organization = getOrganization(orgId);
  if (!organization) {
    return null;
  }

  const ownerEmail = owner.email.trim().toLowerCase();
  const ownerIndex = findMemberIndex(organization, {
    userId: owner.userId,
    email: ownerEmail,
  });
  const nextMembers = [...organization.members];

  if (ownerIndex >= 0) {
    nextMembers[ownerIndex] = normalizeMember({
      ...nextMembers[ownerIndex],
      userId: owner.userId,
      email: ownerEmail,
      name: owner.name ?? nextMembers[ownerIndex].name,
      title: owner.title ?? nextMembers[ownerIndex].title,
      role: "owner",
      status: "active",
    });
  } else {
    nextMembers.unshift(
      normalizeMember({
        id: generateUuid(),
        userId: owner.userId,
        email: ownerEmail,
        name: owner.name || "",
        title: owner.title || "",
        role: "owner",
        status: "active",
        joinedAt: Date.now(),
      }),
    );
  }

  const nextOrganization = normalizeOrganization({
    ...organization,
    ownerId: owner.userId,
    ownerEmail,
    members: nextMembers,
    lastModified: Date.now(),
  });

  upsertOrganization(nextOrganization);
  await persistOrganizationToSupabase(nextOrganization);
  return nextOrganization;
};

/**
 * 获取或创建用户的默认组织，并在已有组织上同步 owner 资料。
 * @param userId 当前用户 ID。
 * @param options owner 的补充信息以及默认组织名。
 * @returns 当前用户对应的默认组织。
 */
export const getOrCreateDefaultOrganization = async (
  userId: string,
  options: DefaultOrganizationOptions = {},
): Promise<Organization> => {
  const existingOrganization = (await loadOrganizationsByOwner(userId))[0];
  const preferredName = options.preferredName?.trim();

  if (existingOrganization) {
    let nextOrganization = existingOrganization;

    if (
      preferredName &&
      (nextOrganization.name === DEFAULT_ORGANIZATION_NAME ||
        !nextOrganization.name.trim())
    ) {
      const updated = await updateOrganization(nextOrganization.id, {
        name: preferredName,
      });
      if (updated) {
        nextOrganization = updated;
      }
    }

    const syncedOrganization = await syncOrganizationOwnerMember(nextOrganization.id, {
      userId,
      email: options.ownerEmail || nextOrganization.ownerEmail,
      name: options.ownerName,
      title: options.ownerTitle,
    });

    return syncedOrganization || nextOrganization;
  }

  return createOrganization({
    name: preferredName || DEFAULT_ORGANIZATION_NAME,
    ownerId: userId,
    ownerEmail: options.ownerEmail || "",
    ownerName: options.ownerName,
    ownerTitle: options.ownerTitle,
    plan: "free",
  });
};

/**
 * 将历史草稿绑定到当前用户和组织，避免旧数据在升级后丢失归属。
 * @param userId 当前用户 ID。
 * @param organizationId 当前组织 ID。
 * @returns 被补齐归属的专利数量。
 */
export const associatePatentsWithUser = async (
  userId: string,
  organizationId: string,
): Promise<number> => {
  const patents = getPatents();
  let count = 0;

  for (const patent of patents) {
    if (!patent.userId) {
      count += 1;
      await savePatentToStorage({
        ...patent,
        userId,
        organizationId,
      });
    }
  }

  return count;
};