import type { Pool, PoolClient } from "pg";
import type { AccessStore, AuditEntry, Member, NewInvitation } from "../application/ports.ts";
import { type InvitationRecord, isRole, type Role } from "../domain/access.ts";

/**
 * PostgreSQL persistence for invitations, members (Better Auth's `auth_user` table plus its
 * `role` column) and the access audit trail. Schema: migrations/*.sql.
 */
type InvitationRow = {
  id: string;
  email: string;
  role: string;
  created_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
};

function invitation(row: InvitationRow): InvitationRecord {
  if (!isRole(row.role)) throw new Error("invalid role in storage");
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  };
}

type MemberRow = {
  id: string;
  email: string;
  role: string;
  created_at: Date;
  providers: string[] | null;
  active_sessions: string | number;
};

function member(row: MemberRow): Member {
  if (!isRole(row.role)) throw new Error("invalid role in storage");
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    providers: (row.providers ?? []).filter(Boolean).sort(),
    activeSessions: Number(row.active_sessions),
  };
}

const MEMBER_SELECT = `
  SELECT u.id, lower(u.email) AS email, u.role, u."createdAt" AS created_at,
         array_remove(array_agg(DISTINCT a."providerId"), NULL) AS providers,
         (SELECT count(*) FROM auth_session s WHERE s."userId" = u.id AND s."expiresAt" > now())
           AS active_sessions
    FROM auth_user u
    LEFT JOIN auth_account a ON a."userId" = u.id`;

const INVITATION_COLUMNS = "id, email, role, created_at, expires_at, accepted_at, revoked_at";

export class PostgresAccessStore implements AccessStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createInvitation(input: NewInvitation): Promise<void> {
    await this.transaction(async (client) => {
      // At most one open invitation per e-mail: a new one supersedes earlier pending ones.
      await client.query(
        "UPDATE backoffice_invitation SET revoked_at = $2 WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL",
        [input.email, input.createdAt],
      );
      await client.query(
        `INSERT INTO backoffice_invitation (id, email, role, token_digest, created_by, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.id,
          input.email,
          input.role,
          input.tokenDigest,
          input.createdBy,
          input.createdAt,
          input.expiresAt,
        ],
      );
    });
  }

  async invitationByDigest(digest: string): Promise<InvitationRecord | null> {
    const { rows } = await this.pool.query<InvitationRow>(
      `SELECT ${INVITATION_COLUMNS} FROM backoffice_invitation WHERE token_digest = $1`,
      [digest],
    );
    return rows[0] ? invitation(rows[0]) : null;
  }

  async consumeInvitation(digest: string, email: string, now: Date): Promise<Role | null> {
    const { rows } = await this.pool.query<{ role: string }>(
      `UPDATE backoffice_invitation SET accepted_at = $3
        WHERE token_digest = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL
          AND expires_at > $3
        RETURNING role`,
      [digest, email, now],
    );
    const role = rows[0]?.role;
    return isRole(role) ? role : null;
  }

  async revokeInvitation(id: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE backoffice_invitation SET revoked_at = $2 WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL",
      [id, now],
    );
    return result.rowCount === 1;
  }

  async listInvitations(): Promise<InvitationRecord[]> {
    const { rows } = await this.pool.query<InvitationRow>(
      `SELECT ${INVITATION_COLUMNS} FROM backoffice_invitation ORDER BY created_at DESC LIMIT 100`,
    );
    return rows.map(invitation);
  }

  async listMembers(): Promise<Member[]> {
    const { rows } = await this.pool.query<MemberRow>(
      `${MEMBER_SELECT} GROUP BY u.id ORDER BY u."createdAt"`,
    );
    return rows.map(member);
  }

  async memberByEmail(email: string): Promise<Member | null> {
    const { rows } = await this.pool.query<MemberRow>(
      `${MEMBER_SELECT} WHERE lower(u.email) = $1 GROUP BY u.id`,
      [email],
    );
    return rows[0] ? member(rows[0]) : null;
  }

  async memberRole(userId: string): Promise<Role | null> {
    const { rows } = await this.pool.query<{ role: string }>(
      "SELECT role FROM auth_user WHERE id = $1",
      [userId],
    );
    const role = rows[0]?.role;
    return isRole(role) ? role : null;
  }

  async removeMember(userId: string): Promise<Member | null> {
    return this.transaction(async (client) => {
      const { rows } = await client.query<MemberRow>(
        `${MEMBER_SELECT} WHERE u.id = $1 GROUP BY u.id`,
        [userId],
      );
      if (!rows[0]) return null;
      // Sessions and linked accounts reference the user with ON DELETE CASCADE.
      await client.query('DELETE FROM auth_session WHERE "userId" = $1', [userId]);
      await client.query("DELETE FROM auth_user WHERE id = $1", [userId]);
      return member(rows[0]);
    });
  }

  async audit(entry: AuditEntry): Promise<void> {
    await this.pool.query(
      "INSERT INTO backoffice_access_audit (action, actor_id, target_email, at) VALUES ($1, $2, $3, $4)",
      [entry.action, entry.actorId, entry.targetEmail, entry.at],
    );
  }
}
