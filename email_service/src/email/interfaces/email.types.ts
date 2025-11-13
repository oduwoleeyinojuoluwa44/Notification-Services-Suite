export interface UserPreferences {
  email: boolean;
  push: boolean;
}

export interface UserData {
  id: string; // Changed from number to string to support UUIDs
  email: string;
  push_token?: string;
  preferences: UserPreferences;
}

export interface EmailJobData {
  user_id: string; // Changed from number to string to support UUIDs
  template_id: string;
  notification_type: 'email' | 'push';
  variables?: Record<string, string | number | boolean>;
  user_data: UserData;
  template_content: string;
  correlation_id: string;
}


