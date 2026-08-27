export interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  date: Date;
  headers?: Record<string, string>;
}

export interface WaitForEmailOptions {
  subject?: string | RegExp;
  to?: string;
  from?: string;
  timeout?: number;
  pollInterval?: number;
}
