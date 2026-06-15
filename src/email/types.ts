export interface EmailTransport {
  sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ messageId: string }>;
}

export interface ImapClient {
  connect(): Promise<void>;
  fetchUnseen(): Promise<ImapMessage[]>;
  markSeen(uid: number): Promise<void>;
  disconnect(): Promise<void>;
}

export interface ImapMessage {
  uid: number;
  messageId: string;
  inReplyTo: string;
  subject: string;
  text: string;
}
