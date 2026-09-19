export interface Ticket {
  id: number;
  location: string;
  issue_type: '硬件故障' | '软件系统' | '网络问题' | '其他' | string;
  description: string;
  image_url: string | null;
  status: '待处理' | '处理中' | '已解决' | string;
  admin_reply: string | null;
  created_at: string;
  resolved_at: string | null;
  teacher_name?: string | null;
  device_id?: string | null;
}

export interface Stats {
  total: number;
  pending: number;
  processing: number;
  resolved: number;
}

export interface LocationConfig {
  dongBuildings: string[];
  dongFloors: string[];
  dongRooms: string[];
  xiFloors: string[];
  xiRooms: string[];
}

export interface IssueTypeItem {
  id?: string;
  name: string;
  desc?: string;
}

export interface SystemConfig {
  system_title?: string;
  system_subtitle?: string;
  locations: LocationConfig;
  issue_types: IssueTypeItem[];
}

