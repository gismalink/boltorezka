import { useState } from "react";
import type { AdminServerListItem, AdminServerOverview, User } from "../../../domain";

export function useServerAdminState() {
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminServers, setAdminServers] = useState<AdminServerListItem[]>([]);
  const [adminServersLoading, setAdminServersLoading] = useState(false);
  const [selectedAdminServerId, setSelectedAdminServerId] = useState("");
  const [adminServerOverview, setAdminServerOverview] = useState<AdminServerOverview | null>(null);
  const [adminServerOverviewLoading, setAdminServerOverviewLoading] = useState(false);

  return {
    adminUsers, setAdminUsers,
    adminServers, setAdminServers,
    adminServersLoading, setAdminServersLoading,
    selectedAdminServerId, setSelectedAdminServerId,
    adminServerOverview, setAdminServerOverview,
    adminServerOverviewLoading, setAdminServerOverviewLoading
  };
}
