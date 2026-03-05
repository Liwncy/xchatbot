/** Feishu event message body structure */
export interface FeishuEventBody {
  schema?: string;
  header?: {
    event_id: string;
    token: string;
    create_time: string;
    event_type: string;
    tenant_key: string;
    app_id: string;
  };
  event?: {
    sender?: {
      sender_id?: { open_id?: string; union_id?: string; user_id?: string };
      sender_type?: string;
    };
    message?: {
      message_id: string;
      root_id?: string;
      parent_id?: string;
      create_time: string;
      chat_id: string;
      chat_type: string;
      message_type: string;
      content: string;
    };
  };
  // URL verification challenge
  challenge?: string;
  token?: string;
  type?: string;
}

/** Feishu message content types */
export interface FeishuTextContent {
  text: string;
}

export interface FeishuImageContent {
  image_key: string;
}

export interface FeishuAudioContent {
  file_key: string;
  duration?: number;
}

export interface FeishuVideoContent {
  file_key: string;
  image_key?: string;
}

export interface FeishuFileContent {
  file_key: string;
  file_name?: string;
}

export interface FeishuLocationContent {
  name?: string;
  longitude?: string;
  latitude?: string;
}
