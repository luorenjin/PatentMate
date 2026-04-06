import { PatentData, getPatents, savePatentToStorage } from "./storageService";

const ORGANIZATIONS_KEY = "patent_pro_organizations";

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  members: OrganizationMember[];
  createdAt: number;
  lastModified: number;
}

export interface OrganizationMember {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  joinedAt: number;
}

export interface CreateOrganizationInput {
  name: string;
  ownerId: string;
}

const normalizeOrganization = (org: Partial<Organization>): Organization => {
  const now = Date.now();
  const normalizedMembers: OrganizationMember[] = Array.isArray(org.members)
    ? org.members.map((m) => ({
        id: m.id || crypto.randomUUID(),
        email: m.email || "",
        role: m.role || "member",
        joinedAt: typeof m.joinedAt === "number" ? m.joinedAt : now,
      }))
    : [];

  return {
    id: org.id || crypto.randomUUID(),
    name: org.name || "未命名组织",
    ownerId: org.ownerId || "",
    members: normalizedMembers,
    createdAt: typeof org.createdAt === "number" ? org.createdAt : now,
    lastModified: typeof org.lastModified === "number" ? org.lastModified : now,
  };
};

// Get all organizations
export const getOrganizations = (): Organization[] => {
  try {
    const data = localStorage.getItem(ORGANIZATIONS_KEY);
    if (!data) return [];

    const parsed = JSON.parse(data) as Array<Partial<Organization>>;
    return Array.isArray(parsed) ? parsed.map(normalizeOrganization) : [];
  } catch (e) {
    console.error("Failed to load organizations", e);
    return [];
  }
};

// Get organization by ID
export const getOrganization = (orgId: string): Organization | undefined => {
  const orgs = getOrganizations();
  return orgs.find((o) => o.id === orgId);
};

// Get organizations by owner
export const getOrganizationsByOwner = (ownerId: string): Organization[] => {
  const orgs = getOrganizations();
  return orgs.filter((o) => o.ownerId === ownerId);
};

// Create a new organization
export const createOrganization = (input: CreateOrganizationInput): Organization => {
  const orgs = getOrganizations();
  const now = Date.now();

  const newOrg: Organization = {
    id: crypto.randomUUID(),
    name: input.name,
    ownerId: input.ownerId,
    members: [
      {
        id: input.ownerId,
        email: "",
        role: "owner",
        joinedAt: now,
      },
    ],
    createdAt: now,
    lastModified: now,
  };

  orgs.push(newOrg);
  localStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(orgs));

  return newOrg;
};

// Update organization
export const updateOrganization = (
  orgId: string,
  data: Partial<Pick<Organization, "name">>
): Organization | null => {
  const orgs = getOrganizations();
  const index = orgs.findIndex((o) => o.id === orgId);

  if (index < 0) return null;

  const updatedOrg: Organization = {
    ...orgs[index],
    ...data,
    lastModified: Date.now(),
  };

  orgs[index] = updatedOrg;
  localStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(orgs));

  return updatedOrg;
};

// Delete organization
export const deleteOrganization = (orgId: string): boolean => {
  const orgs = getOrganizations();
  const newOrgs = orgs.filter((o) => o.id !== orgId);

  if (newOrgs.length === orgs.length) return false;

  localStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(newOrgs));
  return true;
};

// Get or create default organization for user
export const getOrCreateDefaultOrganization = (userId: string): Organization => {
  const existingOrgs = getOrganizationsByOwner(userId);
  if (existingOrgs.length > 0) {
    return existingOrgs[0];
  }
  return createOrganization({
    name: "我的团队",
    ownerId: userId,
  });
};

// Associate patents with user and organization
export const associatePatentsWithUser = (
  userId: string,
  organizationId: string
): number => {
  const patents = getPatents();
  let count = 0;

  const updatedPatents = patents.map((patent) => {
    // Only associate patents that don't have a userId (legacy patents)
    if (!patent.userId) {
      count++;
      return {
        ...patent,
        userId,
        organizationId,
      };
    }
    return patent;
  });

  // Save each updated patent
  updatedPatents.forEach((patent) => {
    savePatentToStorage(patent);
  });

  return count;
};