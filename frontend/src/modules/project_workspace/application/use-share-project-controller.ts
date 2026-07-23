import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { ProjectLinkClipboard } from "@/modules/project_workspace/application/ports";
import type { ProjectWorkspaceQueryHooks } from "@/modules/project_workspace/application/query-hooks";
import type {
  ProjectGrant,
  ProjectRole,
  ProjectSummary,
  UserSearchResult,
} from "@/modules/project_workspace/domain/project";

type GrantRole = Exclude<ProjectRole, "owner">;

export function createUseShareProjectController(
  queries: ProjectWorkspaceQueryHooks,
  clipboard: ProjectLinkClipboard,
) {
  return function useShareProjectController(
    project: ProjectSummary | null,
    open: boolean,
  ) {
    const [query, setQuery] = useState("");
    const [selectedUser, setSelectedUser] =
      useState<UserSearchResult | null>(null);
    const [role, setRole] = useState<GrantRole>("editor");
    const projectId = project?.id ?? "";
    const grants = queries.useProjectGrants(
      projectId,
      open && Boolean(projectId),
    );
    const users = queries.useUserSearch(query);
    const addGrant = queries.useAddProjectGrant(projectId);
    const updateGrant = queries.useUpdateProjectGrant(projectId);
    const deleteGrant = queries.useDeleteProjectGrant(projectId);

    const searchResults = users.data ?? [];
    const grantRows = grants.data ?? [];
    const existingPrincipalIds = useMemo(
      () => new Set(grantRows.map((grant) => grant.principalId)),
      [grantRows],
    );

    const add = async () => {
      const username = selectedUser?.username || query.trim();
      if (!username || username.length < 3) return;
      try {
        await addGrant.mutateAsync({ principalUsername: username, role });
        toast.success("已更新共享成员");
        setQuery("");
        setSelectedUser(null);
        setRole("editor");
      } catch {
        toast.error("共享失败，请确认用户存在且你有权限");
      }
    };

    const copyLink = async () => {
      if (!project) return;
      try {
        await clipboard.copy(project);
        toast.success("项目链接已复制");
      } catch {
        toast.error("复制失败");
      }
    };

    const changeRole = async (grant: ProjectGrant, nextRole: GrantRole) => {
      if (grant.role === nextRole) return;
      try {
        await updateGrant.mutateAsync({ grantId: grant.id, role: nextRole });
        toast.success("权限已更新");
      } catch {
        toast.error("更新权限失败");
      }
    };

    const revoke = async (grant: ProjectGrant) => {
      try {
        await deleteGrant.mutateAsync(grant.id);
        toast.success("已移除共享成员");
      } catch {
        toast.error("移除失败");
      }
    };

    return {
      add,
      addPending: addGrant.isPending,
      changeRole,
      copyLink,
      deletePending: deleteGrant.isPending,
      existingPrincipalIds,
      grantRows,
      grantsLoading: grants.isLoading,
      query,
      revoke,
      role,
      searchResults,
      selectedUser,
      setQuery,
      setRole,
      setSelectedUser,
      updatePending: updateGrant.isPending,
    };
  };
}

export type ShareProjectController = ReturnType<
  ReturnType<typeof createUseShareProjectController>
>;
