export interface DappPermission {
  origin: string;
  accounts: string[];
  permissions: string[];
  createdAt: number;
  lastUsedAt: number;
}

export interface ApprovalRequest {
  id: string;
  origin: string;
  kind:
    | "connect"
    | "signMessage"
    | "signBinary"
    | "signTransaction"
    | "sendTransaction"
    | "switchChain"
    | "transferNft";
  summary: Record<string, string>;
  payload: unknown;
}

export interface PendingApproval {
  request: ApprovalRequest;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}
