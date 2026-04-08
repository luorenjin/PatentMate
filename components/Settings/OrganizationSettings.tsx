import React, { useEffect, useState } from 'react';
import {
  addOrganizationMember,
  changeOrganizationPlan,
  getAvailableRolesForPlan,
  getOrganization,
  getOrganizationPlanChangeError,
  getOrganizationPlanLimits,
  getOrganizationPlanUsage,
  loadOrganization,
  removeOrganizationMember,
  syncOrganizationOwnerMember,
  type Organization,
  type OrganizationMemberStatus,
  type OrganizationMemberRole,
  type OrganizationPlan,
  updateOrganization,
  updateOrganizationMember,
} from '../../services/organizationService';
import {
  getUserProfile,
  type UserProfile,
  updateUserProfile,
} from '../../services/userProfileService';
import { translateAuthErrorMessage } from '../../services/supabaseService';

interface OrganizationSettingsProps {
  organizationId: string;
  userId: string;
  onBack: () => void;
  onOrganizationUpdated?: (organization: Organization) => void;
  onProfileUpdated?: (profile: UserProfile) => void;
}

type SettingsSection = 'profile' | 'organization' | 'plans' | 'members';

type PlanOption = {
  value: OrganizationPlan;
  label: string;
  price: string;
  subtitle: string;
  description: string;
  features: string[];
  badge: string;
};

const PLAN_OPTIONS: PlanOption[] = [
  {
    value: 'free',
    label: 'Free Plan',
    price: '¥0 / 月',
    subtitle: '适合个人试用与轻量协作',
    description: '覆盖交底、评估与基础撰写流程，适合先把组织工作流跑通。',
    features: [
      '个人或小团队起步使用',
      '基础专利交底与撰写流程',
      '组织成员协作与本地存储',
      '适合验证模板与方法论',
    ],
    badge: '入门',
  },
  {
    value: 'team',
    label: 'Team Plan',
    price: '¥299 / 月',
    subtitle: '适合稳定协作的专利团队',
    description: '为日常协作型团队提供更明确的主力 Plan 选择，适合持续使用。',
    features: [
      '适合 3 至 10 人协作场景',
      '更适合多人并行项目推进',
      '便于沉淀团队工作方式',
      '推荐作为团队主力 Plan',
    ],
    badge: '推荐',
  },
  {
    value: 'enterprise',
    label: 'Enterprise Plan',
    price: '定制报价',
    subtitle: '适合企业 IP 部门与代理机构',
    description: '面向多角色、多项目与长期治理需求，适配更正式的企业采购场景。',
    features: [
      '适合企业知识产权部门',
      '更适合跨角色和多项目并行',
      '面向规范化交付与治理',
      '适配长期采购与实施场景',
    ],
    badge: '旗舰',
  },
];

const ROLE_OPTIONS: Array<{ value: OrganizationMemberRole; label: string }> = [
  { value: 'owner', label: '所有者' },
  { value: 'admin', label: '管理员' },
  { value: 'member', label: '成员' },
  { value: 'viewer', label: '查看者' },
];

const FIELD_CLASS_NAME = 'w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const DISABLED_FIELD_CLASS_NAME = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-500';
const PANEL_COPY: Record<
  SettingsSection,
  { eyebrow: string; title: string; description: string }
> = {
  profile: {
    eyebrow: '账户档案',
    title: '账户资料',
    description: '维护个人档案与默认组织信息，保持账户资料统一。',
  },
  organization: {
    eyebrow: '组织管理',
    title: '组织信息',
    description: '管理组织名称、简介与当前协作信息，避免团队资料分散。',
  },
  plans: {
    eyebrow: 'Plan 升级',
    title: 'Plan 升级',
    description: '集中查看档位差异、席位限制与升级建议。',
  },
  members: {
    eyebrow: '成员权限',
    title: '成员权限',
    description: '用更直接的方式处理邀请、角色分配与成员状态流转。',
  },
};

const getPlanDetails = (plan: OrganizationPlan): PlanOption => {
  return PLAN_OPTIONS.find((option) => option.value === plan) ?? PLAN_OPTIONS[0];
};

const getRoleLabel = (role: OrganizationMemberRole): string => {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
};

const formatQuotaLimit = (limit: number | null): string => {
  return limit === null ? '不限' : `${limit}`;
};

const formatQuotaUsage = (used: number, limit: number | null): string => {
  return limit === null ? `${used} / 不限` : `${used} / ${limit}`;
};

const getNextPlan = (plan: OrganizationPlan): OrganizationPlan | null => {
  const currentIndex = PLAN_OPTIONS.findIndex((option) => option.value === plan);
  if (currentIndex < 0 || currentIndex >= PLAN_OPTIONS.length - 1) {
    return null;
  }

  return PLAN_OPTIONS[currentIndex + 1]?.value ?? null;
};

const getPlanLabel = (plan: OrganizationPlan): string => {
  return getPlanDetails(plan).label;
};

const getPlanActionLabel = (currentPlan: OrganizationPlan, nextPlan: OrganizationPlan): string => {
  const currentIndex = PLAN_OPTIONS.findIndex((option) => option.value === currentPlan);
  const nextIndex = PLAN_OPTIONS.findIndex((option) => option.value === nextPlan);

  if (currentIndex === nextIndex) {
    return '当前计划';
  }

  if (nextIndex > currentIndex) {
    return `升级到 ${getPlanLabel(nextPlan)}`;
  }

  return `调整为 ${getPlanLabel(nextPlan)}`;
};

const getRecommendedPlan = (activeMembersCount: number, managersCount: number): OrganizationPlan => {
  if (activeMembersCount >= 12 || managersCount >= 3) {
    return 'enterprise';
  }

  if (activeMembersCount >= 4 || managersCount >= 2) {
    return 'team';
  }

  return 'free';
};

const MEMBER_ROLE_PRIORITY: Record<OrganizationMemberRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  viewer: 3,
};

const MEMBER_STATUS_PRIORITY: Record<OrganizationMemberStatus, number> = {
  active: 0,
  invited: 1,
};

const getMemberStatusLabel = (status: OrganizationMemberStatus): string => {
  return status === 'active' ? '已加入' : '待接受';
};

const getMemberStatusClassName = (status: OrganizationMemberStatus): string => {
  return status === 'active'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-amber-100 text-amber-700';
};

const formatMemberJoinedAt = (joinedAt: number): string => {
  return new Date(joinedAt).toLocaleDateString('zh-CN');
};

const isCurrentLoggedInOwnerMember = (
  member: Organization['members'][number],
  currentUserId: string,
  currentUserEmail: string,
): boolean => {
  const normalizedCurrentEmail = currentUserEmail.trim().toLowerCase();
  const normalizedMemberEmail = member.email.trim().toLowerCase();

  if (currentUserId && member.userId) {
    return currentUserId === member.userId;
  }

  return Boolean(normalizedCurrentEmail) && normalizedCurrentEmail === normalizedMemberEmail;
};

const OrganizationSettings: React.FC<OrganizationSettingsProps> = ({
  organizationId,
  userId,
  onBack,
  onOrganizationUpdated,
  onProfileUpdated,
}) => {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [profileForm, setProfileForm] = useState({
    name: '',
    jobTitle: '',
    phone: '',
    avatarUrl: '',
    defaultOrganizationName: '',
  });
  const [organizationForm, setOrganizationForm] = useState({
    name: '',
    description: '',
  });
  const [memberForm, setMemberForm] = useState({
    email: '',
    name: '',
    title: '',
    role: 'member' as OrganizationMemberRole,
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingOrganization, setIsSavingOrganization] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState<OrganizationPlan | null>(null);
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeSettings = async () => {
      const nextOrganization = (await loadOrganization(organizationId)) ?? getOrganization(organizationId) ?? null;
      const nextProfile = getUserProfile(userId) ?? null;

      if (!isMounted) {
        return;
      }

      setOrganization(nextOrganization);
      setProfile(nextProfile);

      if (nextOrganization) {
        setOrganizationForm({
          name: nextOrganization.name,
          description: nextOrganization.description,
        });
      }

      if (nextProfile) {
        setProfileForm({
          name: nextProfile.name,
          jobTitle: nextProfile.jobTitle,
          phone: nextProfile.phone,
          avatarUrl: nextProfile.avatarUrl,
          defaultOrganizationName: nextProfile.defaultOrganizationName,
        });
      }
    };

    void initializeSettings();

    return () => {
      isMounted = false;
    };
  }, [organizationId, userId]);

  useEffect(() => {
    if (!organization) {
      return;
    }

    const availableRoles = getAvailableRolesForPlan(organization.plan);
    const fallbackRole = availableRoles.find((role) => role !== 'owner') ?? 'member';

    if (!availableRoles.includes(memberForm.role)) {
      setMemberForm((previous) => ({ ...previous, role: fallbackRole }));
    }
  }, [organization, memberForm.role]);

  const showSuccess = (message: string) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(null), 3000);
  };

  const handleProfileSave = async () => {
    if (!profile) {
      setError('当前用户资料尚未准备完成，请稍后重试');
      return;
    }

    setIsSavingProfile(true);
    setError(null);

    try {
      const { profile: updatedProfile, error: updateError } = await updateUserProfile(userId, {
        ...profileForm,
        name: profileForm.name.trim(),
        jobTitle: profileForm.jobTitle.trim(),
        phone: profileForm.phone.trim(),
        avatarUrl: profileForm.avatarUrl.trim(),
        defaultOrganizationName: profileForm.defaultOrganizationName.trim(),
      });

      if (updateError || !updatedProfile) {
        setError(translateAuthErrorMessage(updateError?.message || '保存失败，请重试'));
        return;
      }

      setProfile(updatedProfile);
      onProfileUpdated?.(updatedProfile);

      const syncedOrganization = await syncOrganizationOwnerMember(organizationId, {
        userId,
        email: updatedProfile.email,
        name: updatedProfile.name,
        title: updatedProfile.jobTitle,
      });

      if (syncedOrganization) {
        setOrganization(syncedOrganization);
        onOrganizationUpdated?.(syncedOrganization);
      }

      showSuccess('账户资料已更新');
    } catch (err) {
      setError('账户资料保存失败，请稍后重试');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleOrganizationSave = async () => {
    if (!organizationForm.name.trim()) {
      setError('组织名称不能为空');
      return;
    }

    setIsSavingOrganization(true);
    setError(null);

    try {
      const updated = await updateOrganization(organizationId, {
        name: organizationForm.name.trim(),
        description: organizationForm.description.trim(),
      });

      if (!updated) {
        setError('组织信息保存失败，请重试');
        return;
      }

      setOrganization(updated);
      onOrganizationUpdated?.(updated);
      showSuccess('组织信息已更新');
    } catch (err) {
      setError('组织信息保存失败，请稍后重试');
    } finally {
      setIsSavingOrganization(false);
    }
  };

  const handlePlanChange = async (nextPlan: OrganizationPlan) => {
    if (!organization || organization.plan === nextPlan) {
      return;
    }

    setIsChangingPlan(nextPlan);
    setError(null);

    try {
      const { organization: updated, error: planError } = await changeOrganizationPlan(organizationId, nextPlan);

      if (planError || !updated) {
        setError(translateAuthErrorMessage(planError?.message || 'Plan 计划更新失败'));
        return;
      }

      setOrganization(updated);
      onOrganizationUpdated?.(updated);
      showSuccess(`已切换至 ${getPlanLabel(nextPlan)}`);
    } catch (err) {
      setError('Plan 计划更新失败，请稍后重试');
    } finally {
      setIsChangingPlan(null);
    }
  };

  const handleInviteMember = async () => {
    if (!memberForm.email.trim()) {
      setError('请输入成员邮箱');
      return;
    }

    setIsInvitingMember(true);
    setError(null);

    try {
      const { organization: updatedOrganization, error: addError } = await addOrganizationMember(organizationId, {
        email: memberForm.email.trim(),
        name: memberForm.name.trim(),
        title: memberForm.title.trim(),
        role: memberForm.role,
        status: 'invited',
      });

      if (addError || !updatedOrganization) {
        setError(translateAuthErrorMessage(addError?.message || '成员添加失败'));
        return;
      }

      const availableRoles = getAvailableRolesForPlan(updatedOrganization.plan);
      const defaultRole = availableRoles.find((role) => role !== 'owner') ?? 'member';

      setOrganization(updatedOrganization);
      onOrganizationUpdated?.(updatedOrganization);
      setMemberForm({ email: '', name: '', title: '', role: defaultRole });
      showSuccess('成员邀请已创建');
    } catch (err) {
      setError('成员邀请失败，请稍后重试');
    } finally {
      setIsInvitingMember(false);
    }
  };

  const handleMemberRoleChange = async (memberId: string, role: OrganizationMemberRole) => {
    setError(null);

    const { organization: updated, error: updateError } = await updateOrganizationMember(organizationId, memberId, { role });
    if (updateError || !updated) {
      setError(translateAuthErrorMessage(updateError?.message || '成员角色更新失败'));
      return;
    }

    setOrganization(updated);
    onOrganizationUpdated?.(updated);
    showSuccess('成员角色已更新');
  };

  const handleActivateMember = async (memberId: string) => {
    setError(null);

    const { organization: updated, error: updateError } = await updateOrganizationMember(organizationId, memberId, {
      status: 'active',
    });

    if (updateError || !updated) {
      setError(translateAuthErrorMessage(updateError?.message || '成员添加失败'));
      return;
    }

    setOrganization(updated);
    onOrganizationUpdated?.(updated);
    showSuccess('成员已添加到团队');
  };

  const handleRemoveMember = async (memberId: string) => {
    const { organization: updatedOrganization, error: removeError } = await removeOrganizationMember(organizationId, memberId);
    if (removeError || !updatedOrganization) {
      setError(translateAuthErrorMessage(removeError?.message || '无法移除该成员'));
      return;
    }

    setOrganization(updatedOrganization);
    onOrganizationUpdated?.(updatedOrganization);
    showSuccess('成员已移除');
  };

  if (!organization || !profile) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
          正在加载账户与组织设置...
        </div>
      </div>
    );
  }

  const displayedOrganizationName = organizationForm.name.trim() || organization.name;
  const activeMembersCount = organization.members.filter((member) => member.status === 'active').length;
  const pendingMembersCount = organization.members.filter((member) => member.status !== 'active').length;
  const managersCount = organization.members.filter((member) => member.role === 'owner' || member.role === 'admin').length;
  const currentPlan = organization.plan;
  const currentPlanDetails = getPlanDetails(currentPlan);
  const currentPlanLimits = getOrganizationPlanLimits(currentPlan);
  const currentPlanUsage = getOrganizationPlanUsage(organization);
  const planLabel = currentPlanDetails.label;
  const recommendedPlan = getRecommendedPlan(activeMembersCount, managersCount);
  const recommendedPlanLabel = getPlanLabel(recommendedPlan);
  const nextPlan = getNextPlan(currentPlan);
  const nextPlanLabel = nextPlan ? getPlanLabel(nextPlan) : null;
  const assignableRoles: OrganizationMemberRole[] = getAvailableRolesForPlan(currentPlan).filter((role) => role !== 'owner');
  const assignableRoleSummary = assignableRoles.map((role) => getRoleLabel(role)).join(' / ');
  const memberQuotaLabel = formatQuotaUsage(currentPlanUsage.totalMembers, currentPlanLimits.maxMembers);
  const adminQuotaLabel = formatQuotaUsage(currentPlanUsage.adminMembers, currentPlanLimits.maxAdmins);
  const isMemberQuotaFull = currentPlanUsage.remainingMemberSlots === 0;
  const isAdminQuotaFull = currentPlanUsage.remainingAdminSlots === 0;
  const isProtectedOwnerMember = (member: Organization['members'][number]): boolean => {
    return isCurrentLoggedInOwnerMember(member, userId, profile.email);
  };
  const sortedMembers = [...organization.members].sort((left, right) => {
    const roleDifference = MEMBER_ROLE_PRIORITY[left.role] - MEMBER_ROLE_PRIORITY[right.role];

    if (roleDifference !== 0) {
      return roleDifference;
    }

    const statusDifference = MEMBER_STATUS_PRIORITY[left.status] - MEMBER_STATUS_PRIORITY[right.status];

    if (statusDifference !== 0) {
      return statusDifference;
    }

    return right.joinedAt - left.joinedAt;
  });
  const profileInitial = (profileForm.name || profile.email || '?').trim().charAt(0).toUpperCase();
  const currentSection = PANEL_COPY[activeSection];
  const sectionItems: Array<{
    id: SettingsSection;
    label: string;
    badge: string;
  }> = [
    {
      id: 'profile',
      label: '账户资料',
      badge: profileForm.name.trim() ? '已完善' : '待完善',
    },
    {
      id: 'organization',
      label: '组织信息',
      badge: planLabel,
    },
    {
      id: 'plans',
      label: 'Plan 升级',
      badge: recommendedPlan !== currentPlan ? '建议升级' : planLabel,
    },
    {
      id: 'members',
      label: '成员权限',
      badge: `${organization.members.length} 人`,
    },
  ];

  const isRoleOptionDisabled = (role: OrganizationMemberRole, currentRole?: OrganizationMemberRole): boolean => {
    if (role === 'owner') {
      return currentRole !== 'owner';
    }

    if (!assignableRoles.includes(role) && currentRole !== role) {
      return true;
    }

    if (role === 'admin' && currentRole !== 'admin' && isAdminQuotaFull) {
      return true;
    }

    return false;
  };

  const getRoleOptionCopy = (role: OrganizationMemberRole, currentRole?: OrganizationMemberRole): string => {
    const label = getRoleLabel(role);

    if (!assignableRoles.includes(role) && currentRole !== role) {
      return `${label}（需升级 Plan）`;
    }

    if (role === 'admin' && currentRole !== 'admin' && isAdminQuotaFull) {
      return `${label}（管理员配额已满）`;
    }

    return label;
  };

  const renderProfileSection = () => {
    return (
      <div className="grid gap-4 xl:grid-cols-[248px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900 text-xl font-semibold text-white">
              {profileForm.avatarUrl ? (
                <img src={profileForm.avatarUrl} alt="头像预览" className="h-full w-full object-cover" />
              ) : (
                profileInitial || '?'
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">
                {profileForm.name.trim() || '未设置姓名'}
              </div>
              <div className="truncate text-sm text-slate-500">{profile.email}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">资料摘要</div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <span>职位</span>
                <span className="text-right font-medium text-slate-900">
                  {profileForm.jobTitle.trim() || '未填写'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span>联系电话</span>
                <span className="text-right font-medium text-slate-900">
                  {profileForm.phone.trim() || '未填写'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span>默认组织</span>
                <span className="text-right font-medium text-slate-900">
                  {profileForm.defaultOrganizationName.trim() || displayedOrganizationName}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">邮箱地址</label>
              <input type="email" value={profile.email} disabled className={DISABLED_FIELD_CLASS_NAME} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">姓名</label>
              <input
                type="text"
                value={profileForm.name}
                onChange={(event) => setProfileForm((previous) => ({ ...previous, name: event.target.value }))}
                className={FIELD_CLASS_NAME}
                placeholder="例如：张工"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">职位 / 角色</label>
              <input
                type="text"
                value={profileForm.jobTitle}
                onChange={(event) => setProfileForm((previous) => ({ ...previous, jobTitle: event.target.value }))}
                className={FIELD_CLASS_NAME}
                placeholder="例如：专利工程师"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">联系电话</label>
              <input
                type="text"
                value={profileForm.phone}
                onChange={(event) => setProfileForm((previous) => ({ ...previous, phone: event.target.value }))}
                className={FIELD_CLASS_NAME}
                placeholder="用于团队联系人档案"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">默认组织名称</label>
              <input
                type="text"
                value={profileForm.defaultOrganizationName}
                onChange={(event) => setProfileForm((previous) => ({ ...previous, defaultOrganizationName: event.target.value }))}
                className={FIELD_CLASS_NAME}
                placeholder="新建默认组织时优先使用"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">头像链接</label>
              <input
                type="url"
                value={profileForm.avatarUrl}
                onChange={(event) => setProfileForm((previous) => ({ ...previous, avatarUrl: event.target.value }))}
                className={FIELD_CLASS_NAME}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleProfileSave}
              disabled={isSavingProfile}
              className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:bg-blue-400"
            >
              {isSavingProfile ? '保存中...' : '保存账户资料'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderOrganizationSection = () => {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">组织名称</label>
              <input
                type="text"
                value={organizationForm.name}
                onChange={(event) => setOrganizationForm((previous) => ({ ...previous, name: event.target.value }))}
                className={FIELD_CLASS_NAME}
                placeholder="请输入组织名称"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Current Plan</div>
              <div className="mt-3 text-lg font-semibold text-slate-900">{currentPlanDetails.label}</div>
              <div className="mt-1 text-sm text-slate-500">{currentPlanDetails.subtitle}</div>
              <div className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                {currentPlanDetails.price}
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-start justify-between gap-4">
                  <span>成员席位</span>
                  <span className="font-medium text-slate-900">{memberQuotaLabel}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span>管理员配额</span>
                  <span className="font-medium text-slate-900">{adminQuotaLabel}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span>可分配角色</span>
                  <span className="text-right font-medium text-slate-900">{assignableRoleSummary}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveSection('plans')}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                升级计划
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">组织简介</label>
            <textarea
              value={organizationForm.description}
              onChange={(event) => setOrganizationForm((previous) => ({ ...previous, description: event.target.value }))}
              rows={6}
              className={`${FIELD_CLASS_NAME} resize-none`}
              placeholder="介绍团队的业务方向、行业领域或协作说明"
            />
          </div>

          {recommendedPlan !== currentPlan && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              根据当前团队规模，建议升级到
              <span className="mx-1 font-semibold">{recommendedPlanLabel}</span>
              ，可点击右侧按钮进入独立的 Plan 升级页面。
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                当前 owner：
                <span className="ml-1 font-medium text-slate-900">{organization.ownerEmail || profile.email}</span>
              </div>
              <div className="text-slate-500">Plan 计划已迁移到独立页面，可通过右侧按钮或左侧导航进入。</div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleOrganizationSave}
              disabled={isSavingOrganization}
              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-500"
            >
              {isSavingOrganization ? '保存中...' : '保存组织信息'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPlansSection = () => {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.45),_transparent_55%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Plan 计划</div>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">固定档位选择与升级</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  这里是独立的 Plan 升级页面。当前计划、配额限制和各档位差异都集中在这里，组织信息页只保留当前摘要与升级入口。
                </p>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/80 px-3.5 py-2.5 shadow-sm backdrop-blur">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Current Plan</div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-lg font-semibold text-slate-900">{currentPlanDetails.label}</span>
                  <span className="text-sm text-slate-500">{currentPlanDetails.price}</span>
                </div>
                <div className="mt-1 text-sm text-slate-500">{currentPlanDetails.description}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">成员席位</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{memberQuotaLabel}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">管理员配额</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{adminQuotaLabel}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">可分配角色</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{assignableRoleSummary}</div>
              </div>
            </div>

            {recommendedPlan !== currentPlan && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                根据当前团队规模，建议升级到
                <span className="mx-1 font-semibold">{recommendedPlanLabel}</span>
                ，更适合现阶段的协作强度。
              </div>
            )}
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-3">
            {PLAN_OPTIONS.map((option) => {
              const optionLimits = getOrganizationPlanLimits(option.value);
              const optionRoles = getAvailableRolesForPlan(option.value)
                .filter((role) => role !== 'owner')
                .map((role) => getRoleLabel(role))
                .join(' / ');
              const isCurrent = option.value === currentPlan;
              const isRecommended = option.value === recommendedPlan && !isCurrent;
              const isProcessing = isChangingPlan === option.value;
              const planChangeError = !isCurrent ? getOrganizationPlanChangeError(organization, option.value) : null;

              return (
                <article
                  key={option.value}
                  className={`rounded-[24px] border p-4 transition ${
                    isCurrent
                      ? 'border-slate-900 bg-slate-900 text-white shadow-xl'
                      : isRecommended
                        ? 'border-sky-300 bg-sky-50 shadow-md'
                        : 'border-slate-200 bg-white shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        isCurrent
                          ? 'bg-white/10 text-white'
                          : isRecommended
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-slate-100 text-slate-700'
                      }`}>
                        {option.badge}
                      </div>
                      <h4 className={`mt-4 text-xl font-semibold ${isCurrent ? 'text-white' : 'text-slate-900'}`}>
                        {option.label}
                      </h4>
                      <div className={`mt-2 text-sm ${isCurrent ? 'text-slate-300' : 'text-slate-500'}`}>
                        {option.subtitle}
                      </div>
                    </div>

                    {isCurrent ? (
                      <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200">
                        当前
                      </span>
                    ) : isRecommended ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                        建议升级
                      </span>
                    ) : null}
                  </div>

                  <div className={`mt-5 text-3xl font-semibold ${isCurrent ? 'text-white' : 'text-slate-900'}`}>
                    {option.price}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className={`rounded-xl border px-3 py-2.5 text-center ${isCurrent ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">成员</div>
                      <div className={`mt-2 text-sm font-semibold ${isCurrent ? 'text-white' : 'text-slate-900'}`}>
                        {formatQuotaLimit(optionLimits.maxMembers)}
                      </div>
                    </div>
                    <div className={`rounded-xl border px-3 py-2.5 text-center ${isCurrent ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">管理员</div>
                      <div className={`mt-2 text-sm font-semibold ${isCurrent ? 'text-white' : 'text-slate-900'}`}>
                        {formatQuotaLimit(optionLimits.maxAdmins)}
                      </div>
                    </div>
                    <div className={`rounded-xl border px-3 py-2.5 text-center ${isCurrent ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">角色</div>
                      <div className={`mt-2 text-xs font-medium leading-5 ${isCurrent ? 'text-slate-200' : 'text-slate-700'}`}>
                        {optionRoles}
                      </div>
                    </div>
                  </div>

                  <p className={`mt-3 text-sm leading-6 ${isCurrent ? 'text-slate-300' : 'text-slate-600'}`}>
                    {option.description}
                  </p>

                  <div className="mt-5 space-y-3">
                    {option.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${
                          isCurrent
                            ? 'bg-cyan-300'
                            : isRecommended
                              ? 'bg-sky-500'
                              : 'bg-slate-300'
                        }`} />
                        <span className={`text-sm ${isCurrent ? 'text-slate-200' : 'text-slate-600'}`}>
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlanChange(option.value)}
                    disabled={isCurrent || isChangingPlan !== null || Boolean(planChangeError)}
                    className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                      isCurrent
                        ? 'cursor-default bg-white/10 text-slate-300'
                        : option.value === 'enterprise'
                          ? 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300'
                          : isRecommended || option.value === 'team'
                            ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400'
                    }`}
                  >
                    {isProcessing ? '处理中...' : getPlanActionLabel(currentPlan, option.value)}
                  </button>

                  {planChangeError && !isCurrent && (
                    <div className={`mt-3 rounded-xl border px-3 py-2.5 text-sm ${
                      isRecommended ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}>
                      {translateAuthErrorMessage(planChangeError)}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMembersSection = () => {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_320px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">成员邀请</h3>
                <p className="mt-1 text-sm text-slate-500">
                  先发送邀请，再在下方列表里完成确认加入、角色调整或移除，整个流程保持单页闭环。
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">当前 Plan：{planLabel}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">可分配角色：{assignableRoleSummary}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">已加入</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{activeMembersCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">待接受</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{pendingMembersCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">管理员</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{managersCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">成员席位</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{memberQuotaLabel}</div>
              </div>
            </div>

            <div className={`mt-4 rounded-xl border px-3.5 py-2.5 text-sm ${
              isMemberQuotaFull
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-sky-200 bg-sky-50 text-sky-700'
            }`}>
              {isMemberQuotaFull ? (
                <>
                  当前 {planLabel} 的成员席位已满。
                  {nextPlanLabel ? ` 升级到 ${nextPlanLabel} 后可继续邀请成员。` : ' 当前计划已是最高档。'}
                </>
              ) : (
                <>
                  邀请成员后会先进入待接受列表；确认加入时，可在下方直接点击“添加”转为已加入。
                </>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">成员邮箱</label>
                <input
                  type="email"
                  value={memberForm.email}
                  onChange={(event) => setMemberForm((previous) => ({ ...previous, email: event.target.value }))}
                  className={FIELD_CLASS_NAME}
                  placeholder="member@company.com"
                  disabled={isMemberQuotaFull || isInvitingMember}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">姓名</label>
                <input
                  type="text"
                  value={memberForm.name}
                  onChange={(event) => setMemberForm((previous) => ({ ...previous, name: event.target.value }))}
                  className={FIELD_CLASS_NAME}
                  placeholder="成员姓名"
                  disabled={isMemberQuotaFull || isInvitingMember}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">职位</label>
                <input
                  type="text"
                  value={memberForm.title}
                  onChange={(event) => setMemberForm((previous) => ({ ...previous, title: event.target.value }))}
                  className={FIELD_CLASS_NAME}
                  placeholder="例如：代理师 / 法务 / 研发负责人"
                  disabled={isMemberQuotaFull || isInvitingMember}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">角色</label>
                <select
                  value={memberForm.role}
                  onChange={(event) => setMemberForm((previous) => ({ ...previous, role: event.target.value as OrganizationMemberRole }))}
                  className={`${FIELD_CLASS_NAME} bg-white`}
                  disabled={isMemberQuotaFull || isInvitingMember}
                >
                  {ROLE_OPTIONS.filter((option) => option.value !== 'owner').map((option) => (
                    <option key={option.value} value={option.value} disabled={isRoleOptionDisabled(option.value)}>
                      {getRoleOptionCopy(option.value)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleInviteMember}
                disabled={isInvitingMember || isMemberQuotaFull}
                className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:bg-blue-400"
              >
                {isInvitingMember ? '邀请中...' : '邀请成员'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">当前协作限制</div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                <span>成员席位</span>
                <span className="font-semibold text-slate-900">{memberQuotaLabel}</span>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                <span>管理员配额</span>
                <span className="font-semibold text-slate-900">{adminQuotaLabel}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                <div className="text-slate-500">可分配角色</div>
                <div className="mt-1 font-semibold text-slate-900">{assignableRoleSummary}</div>
              </div>
            </div>

            {(recommendedPlan !== currentPlan || isMemberQuotaFull) && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                {isMemberQuotaFull
                  ? nextPlanLabel
                    ? `当前席位已满，建议切换到 ${nextPlanLabel} 后继续扩充成员。`
                    : '当前席位已满，且当前已是最高档 Plan。'
                  : `按当前团队规模，更适合使用 ${recommendedPlanLabel}。`}
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveSection('plans')}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              查看 Plan 方案
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">成员列表</h3>
              <p className="mt-1 text-sm text-slate-500">表格内可直接调整角色，并对待接受成员执行添加或移除。</p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              共 {sortedMembers.length} 位成员
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="w-[188px] px-4 py-3 font-medium">成员</th>
                  <th className="w-[188px] px-4 py-3 font-medium">邮箱</th>
                  <th className="w-[188px] px-4 py-3 font-medium">职位</th>
                  <th className="w-[108px] px-4 py-3 font-medium whitespace-nowrap">状态</th>
                  <th className="w-[168px] px-4 py-3 font-medium whitespace-nowrap">角色</th>
                  <th className="w-[132px] px-4 py-3 font-medium whitespace-nowrap">加入时间</th>
                  <th className="w-[156px] px-4 py-3 text-right font-medium whitespace-nowrap">操作</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {sortedMembers.map((member) => {
                  const memberInitial = (member.name || member.email || '?').trim().charAt(0).toUpperCase();
                  const isProtectedOwner = isProtectedOwnerMember(member);

                  return (
                    <tr key={member.id} className="align-middle transition hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 font-semibold text-white">
                            {memberInitial || '?'}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {member.name || '未填写姓名'}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {isProtectedOwner ? '组织所有者' : member.status === 'invited' ? '等待确认加入' : '已在团队中生效'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-600">{member.email || '未设置邮箱'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{member.title || '未设置职位'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${getMemberStatusClassName(member.status)}`}>
                          {getMemberStatusLabel(member.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <select
                          value={member.role}
                          disabled={isProtectedOwner}
                          onChange={(event) => handleMemberRoleChange(member.id, event.target.value as OrganizationMemberRole)}
                          className="w-full min-w-[148px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value} disabled={isRoleOptionDisabled(option.value, member.role)}>
                              {getRoleOptionCopy(option.value, member.role)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatMemberJoinedAt(member.joinedAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-nowrap items-center justify-end gap-2">
                          {member.status === 'invited' && !isProtectedOwner && (
                            <button
                              type="button"
                              onClick={() => handleActivateMember(member.id)}
                              className="inline-flex min-w-[72px] items-center justify-center whitespace-nowrap rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                            >
                              添加
                            </button>
                          )}

                          {!isProtectedOwner && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(member.id)}
                              className="inline-flex min-w-[72px] items-center justify-center whitespace-nowrap rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
                            >
                              移除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'profile':
        return renderProfileSection();
      case 'organization':
        return renderOrganizationSection();
      case 'plans':
        return renderPlansSection();
      case 'members':
        return renderMembersSection();
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <div className="grid gap-5 xl:grid-cols-[248px_minmax(0,1fr)] xl:items-start">
        <aside className="space-y-3 xl:sticky xl:top-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回工作台
          </button>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">设置中心</div>
            <h1 className="mt-3 text-[28px] font-semibold leading-tight text-slate-900">账户与组织管理</h1>

            <div className="mt-4 rounded-2xl bg-slate-900 p-3.5 text-white">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white">
                  {displayedOrganizationName.trim().charAt(0) || 'P'}
                </div>
                <div className="min-w-0">
                  <div className="break-words text-base font-semibold">{displayedOrganizationName}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-cyan-500/15 px-2.5 py-1 text-cyan-100">{planLabel}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200">{organization.members.length} 位成员</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/10 px-2 py-2.5">
                  <div className="text-[11px] text-slate-400">已激活</div>
                  <div className="mt-1 text-lg font-semibold">{activeMembersCount}</div>
                </div>
                <div className="rounded-xl bg-white/10 px-2 py-2.5">
                  <div className="text-[11px] text-slate-400">管理员</div>
                  <div className="mt-1 text-lg font-semibold">{managersCount}</div>
                </div>
                <div className="rounded-xl bg-white/10 px-2 py-2.5">
                  <div className="text-[11px] text-slate-400">待接受</div>
                  <div className="mt-1 text-lg font-semibold">{pendingMembersCount}</div>
                </div>
              </div>
            </div>
          </div>

          <nav className="rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm">
            <div className="space-y-2">
              {sectionItems.map((item) => {
                const isActive = item.id === activeSection;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full rounded-2xl px-3.5 py-3 text-left transition ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-lg'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm font-semibold">{item.label}</div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        isActive
                          ? 'bg-white/10 text-slate-100'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200'
                      }`}>
                        {item.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </nav>
        </aside>

        <div className="min-w-0 space-y-3">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-medium tracking-[0.18em] text-sky-700">
                  {currentSection.eyebrow}
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900 md:text-[30px]">{currentSection.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{currentSection.description}</p>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-slate-600">
                  {displayedOrganizationName}
                </span>
                <span className="rounded-full bg-sky-50 px-3.5 py-1.5 font-medium text-sky-700">
                  {planLabel}
                </span>
              </div>
            </div>

            <div className="pt-4">{renderSectionContent()}</div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default OrganizationSettings;
