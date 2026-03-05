/** DingTalk incoming webhook message structure */
export interface DingTalkMessage {
  msgtype: string;
  msgId?: string;
  createAt?: number;
  conversationId?: string;
  conversationType?: string;
  senderId?: string;
  senderNick?: string;
  robotCode?: string;
  sessionWebhook?: string;
  text?: { content: string };
  content?: { richText?: Array<{ type: string; text?: string }> };
  richText?: Array<{ type: string; text?: string }>;
  picture?: { downloadCode?: string };
  audio?: { downloadCode?: string; duration?: string };
}

/** DingTalk reply message types */
export interface DingTalkTextReply {
  msgtype: 'text';
  text: { content: string };
}

export interface DingTalkMarkdownReply {
  msgtype: 'markdown';
  markdown: { title: string; text: string };
}

export interface DingTalkActionCardReply {
  msgtype: 'actionCard';
  actionCard: {
    title: string;
    text: string;
    singleTitle?: string;
    singleURL?: string;
    btnOrientation?: string;
    btns?: Array<{ title: string; actionURL: string }>;
  };
}
