export type EmailMessage={to:string[];subject:string;text:string;html?:string};

export interface EmailProvider{
  send(message:EmailMessage):Promise<{messageId:string;threadId?:string}>;
  reply?(messageId:string,text:string):Promise<{messageId:string;threadId?:string}>;
  listThreads?():Promise<unknown[]>;
}

export const EMAIL_PROVIDER="agentmail";
