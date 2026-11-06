export interface TicketInteraction {
  id: number;
  ticket_id: number;
  sender_type: 'admin' | 'user';
  sender_name?: string | null;
  content: string;
  image_url?: string | null;
  status_at_time?: string | null;
  created_at: string;
}

export interface Ticket {
  id: number;
  location: string;
  issue_type: '硬件故障' | '软件系统' | '网络问题' | '其他' | string;
  description: string;
  image_url: string | null;
  status: '待审核' | '待派单' | '已派单' | '待处理' | '处理中' | '已解决' | '已驳回' | string;
  admin_reply: string | null;
  created_at: string;
  resolved_at: string | null;
  teacher_name?: string | null;
  phone?: string | null;
  device_id?: string | null;
  school_id?: number;
  // Dispatch & Assignment fields (租户操作员审核与派单)
  assigned_to_id?: number | null;
  assigned_to_name?: string | null;
  assigned_to_phone?: string | null;
  assigned_at?: string | null;
  dispatch_note?: string | null;
  reviewed_by_id?: number | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  interactions?: TicketInteraction[];
}

export interface Stats {
  total: number;
  pending: number;
  dispatched?: number;
  processing: number;
  resolved: number;
  device_count?: number;
  by_type?: { name: string; count: number }[];
  by_location?: { name: string; count: number }[];
}

export interface LocationZone {
  key: string;
  name: string;
  buildings: string[];
  floors: string[];
  rooms: string[];
}

export interface LocationConfig {
  zones: LocationZone[];
}

export interface IssueTypeItem {
  id?: string;
  name: string;
  desc?: string;
  enabled?: boolean;
}

export interface SystemConfig {
  system_title?: string;
  system_subtitle?: string;
  locations: LocationConfig;
  issue_types: IssueTypeItem[];
  is_issue_types_inherited?: boolean;
}

export type UserRole = 'teacher' | 'technician' | 'operator' | 'admin' | 'superadmin';

export interface AppUser {
  id: number;
  username: string; // 手机号作为用户名
  name: string;     // 会员姓名
  phone: string;    // 联系电话
  role: UserRole | string;
  device_id: string | null;
  school_id?: number | null;
  school_name?: string | null;
  school_code?: string | null;
  enabled: boolean;
  ticket_count?: number;
  created_at: string;
  updated_at?: string;
  last_ticket_at?: string | null;
}

