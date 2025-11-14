export interface UserPreferences {
  email: boolean;
  push: boolean;
}

export interface UserData {
  id: string;
  email: string;
  push_token?: string;
  preferences: UserPreferences;
}

export interface PushJobData {
  user_id: string;
  template_id?: string;
  template_code?: string;
  notification_type: 'email' | 'push';
  variables?: Record<string, string | number | boolean>;
  user_data: UserData;
  template_content: string;
  correlation_id: string;
  request_id?: string;
  priority?: number;
  metadata?: Record<string, any>;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  image?: string;
  link?: string;
  data?: Record<string, string>;
}

