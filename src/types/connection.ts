export type ConnectionColor =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "gray";

export type SshAuthMethod = "password" | "key" | "key_passphrase";

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  sslMode: boolean;
  color: ConnectionColor;
  lastConnectedAt?: string;
  createdAt: string;
  // SSH Tunnel
  useSshTunnel: boolean;
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  sshAuthMethod: SshAuthMethod;
  sshPassword: string;
  sshKeyPath: string;
  sshPassphrase: string;
}

export function parseConnectionString(connStr: string): Partial<ConnectionConfig> {
  try {
    // postgresql://user:pass@host:port/dbname?sslmode=require
    const url = new URL(connStr);
    return {
      host: url.hostname || "localhost",
      port: url.port ? parseInt(url.port) : 5432,
      username: decodeURIComponent(url.username || ""),
      password: decodeURIComponent(url.password || ""),
      database: url.pathname.replace(/^\//, "") || "",
      sslMode: url.searchParams.get("sslmode") === "require",
    };
  } catch {
    return {};
  }
}

export function buildConnectionString(config: ConnectionConfig): string {
  const { username, password, host, port, database, sslMode } = config;
  const userPart = password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}`
    : encodeURIComponent(username);
  const ssl = sslMode ? "?sslmode=require" : "";
  return `postgresql://${userPart}@${host}:${port}/${database}${ssl}`;
}
