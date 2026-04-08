# 数据持久化增强功能说明

## 功能概览

PatentMate 现已实现可靠的数据持久化机制，包括自动保存、冲突解决和数据恢复功能。

## 核心特性

### 1. 自动保存 ⏱️

系统会在用户停止编辑 **30 秒后**自动保存草稿到本地和云端（如果已配置 Supabase）。

**特点：**
- 防抖处理，避免频繁保存影响性能
- 后台静默保存，不干扰用户操作
- 失败时仅在控制台输出警告，不中断工作流

**工作原理：**
```typescript
// App.tsx:54-74
useEffect(() => {
  if (!patentData) return;

  const autoSaveTimer = window.setTimeout(() => {
    void savePatentToStorage(patentData);
  }, 30000); // 30 seconds

  return () => clearTimeout(autoSaveTimer);
}, [patentData]);
```

### 2. 版本控制与冲突解决 🔄

每次保存时，系统自动递增 `version` 字段，防止并发写入导致的数据覆盖。

**特点：**
- 最新写入优先策略（Last Write Wins）
- 版本号自动递增，无需手动管理
- 支持多设备同步时的冲突检测

**版本号示例：**
```
用户 A 保存 → version: 1 → version: 2 → version: 3
用户 B 保存 → version: 1 → version: 2
合并后：     → version: 3（用户 A 的最新版本生效）
```

### 3. 软删除与数据恢复 🗑️

删除专利草稿时，系统使用**软删除**机制，标记 `deletedAt` 时间戳而非直接删除数据。

**特点：**
- 误删除保护：数据保留 30 天
- 可恢复：调用 `restorePatentFromStorage(id)` 恢复
- 自动清理：30 天后可通过 `purgeOldDeletedPatents()` 永久删除

**数据状态流程：**
```
正常状态       软删除           永久删除
deletedAt: null → deletedAt: 1733654400000 → 数据清除
                  ↓ 30天内可恢复
                  restorePatentFromStorage()
                  ↓
                  deletedAt: null
```

## API 接口

### 恢复已删除的草稿

```typescript
import { restorePatentFromStorage } from '@/services/storageService';

// 恢复指定 ID 的专利草稿
const error = await restorePatentFromStorage(patentId);
if (error) {
  console.error('恢复失败:', error.message);
} else {
  console.log('恢复成功');
}
```

### 查询包含已删除的草稿

```typescript
import { getPatents } from '@/services/storageService';

// 默认：仅返回未删除的草稿
const activePatents = getPatents();

// 包含已删除的草稿
const allPatents = getPatents(true);
```

### 清理过期的软删除数据

```typescript
import { purgeOldDeletedPatents } from '@/services/storageService';

// 清理 30 天前软删除的数据
const count = await purgeOldDeletedPatents(30);
console.log(`已清理 ${count} 个过期草稿`);

// 清理 7 天前的数据（自定义天数）
const count7d = await purgeOldDeletedPatents(7);
```

## 数据库迁移

如果使用 Supabase，请执行以下 SQL 迁移以添加 `version` 和 `deleted_at` 字段：

```sql
-- 文件路径：supabase/migrations/20260408_add_version_and_soft_delete.sql
-- 在 Supabase SQL Editor 中执行该文件内容

ALTER TABLE patent_projects
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

ALTER TABLE patent_projects
ADD COLUMN IF NOT EXISTS deleted_at BIGINT DEFAULT NULL;
```

完整迁移脚本见：`supabase/migrations/20260408_add_version_and_soft_delete.sql`

## 向后兼容性

所有新增字段均为可选字段，旧数据会自动规范化：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `version` | 1 | 旧草稿默认版本号为 1 |
| `deletedAt` | `null` | 旧草稿默认为未删除状态 |

现有功能**不受影响**：

- ✅ Dashboard 列表仅显示未删除的草稿（`deletedAt: null`）
- ✅ 保存逻辑自动递增版本号
- ✅ 删除操作自动使用软删除

## 常见问题

### Q1: 自动保存会影响性能吗？

**A:** 不会。自动保存使用 30 秒防抖，仅在用户停止编辑后触发，且为后台异步操作，不阻塞 UI。

### Q2: 误删除后如何恢复？

**A:** 调用 `restorePatentFromStorage(patentId)` 函数即可恢复。30 天内数据不会被清理。

### Q3: 如何永久删除草稿？

**A:** 方法一：调用 `purgeOldDeletedPatents(0)` 立即清理所有软删除数据。
方法二：等待 30 天后，系统管理员手动执行清理函数。

### Q4: 多设备同时编辑会发生什么？

**A:** 采用最新写入优先策略（Last Write Wins）。后保存的版本会覆盖先保存的版本。建议用户避免同时在多设备编辑同一草稿。

### Q5: localStorage 和 Supabase 哪个优先？

**A:** 双写策略：
1. 数据先写入 localStorage（立即生效，离线可用）
2. 如果配置了 Supabase，同步写入云端（在线备份）
3. 读取时优先从 Supabase 拉取（多设备同步），失败时回退到 localStorage

## 技术细节

### 数据模型

```typescript
interface PatentData {
  id: string;
  title: string;
  status: PatentStatus;
  lastModified: number;
  createdAt: number;

  // 新增字段（P0-1）
  version?: number;          // 版本号，用于冲突检测
  deletedAt?: number | null; // 软删除时间戳，null 表示未删除

  // ... 其他字段
}
```

### 冲突解决算法

```typescript
// storageService.ts:498-518
export const savePatentToStorage = async (patent: PatentData) => {
  const existingPatent = getPatentById(patent.id);
  const currentVersion = existingPatent?.version ?? 0;

  // 版本号递增
  const updatedPatent = normalizePatentData({
    ...patent,
    lastModified: Date.now(),
    version: currentVersion + 1,
  });

  upsertPatentInCache(updatedPatent);
  await persistPatentToSupabase(updatedPatent);

  return { patent: updatedPatent, error: null };
};
```

### 软删除实现

```typescript
// storageService.ts:525-568
export const deletePatentFromStorage = async (id: string) => {
  const patent = getPatentById(id);
  if (!patent) return new Error("Patent not found");

  // 标记为已删除，不清除数据
  const softDeletedPatent = normalizePatentData({
    ...patent,
    deletedAt: Date.now(),
    lastModified: Date.now(),
    version: (patent.version ?? 1) + 1,
  });

  upsertPatentInCache(softDeletedPatent);

  // 同步到 Supabase
  if (supabase) {
    await supabase
      .from('patent_projects')
      .update({
        deleted_at: softDeletedPatent.deletedAt,
        last_modified: softDeletedPatent.lastModified,
        payload: softDeletedPatent,
      })
      .eq('id', id);
  }

  return null;
};
```

## 相关文件

- `types.ts:120-133` - PatentData 接口定义
- `App.tsx:54-74` - 自动保存心跳机制
- `services/storageService.ts:498-669` - 数据持久化核心逻辑
- `supabase/migrations/20260408_add_version_and_soft_delete.sql` - 数据库迁移脚本

## 更新日志

**2026-04-08 - v1.0 (P0-1)**
- ✅ 新增自动保存心跳机制（30秒防抖）
- ✅ 新增版本号字段和冲突解决策略
- ✅ 新增软删除机制（保留30天可恢复）
- ✅ 新增数据恢复函数（`restorePatentFromStorage`）
- ✅ 新增自动清理函数（`purgeOldDeletedPatents`）
- ✅ 完整向后兼容，旧数据自动规范化
