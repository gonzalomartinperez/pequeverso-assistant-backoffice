-- Invitations (only a SHA-256 digest of the one-time token is stored) and the access audit trail.
create table backoffice_invitation (
  id text primary key,
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner', 'viewer')),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  created_by text references auth_user (id) on delete set null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);
-- One open invitation per e-mail (a new invitation revokes the earlier one in the same transaction).
create unique index backoffice_invitation_one_open
  on backoffice_invitation (email) where accepted_at is null and revoked_at is null;

create table backoffice_access_audit (
  id bigint generated always as identity primary key,
  action text not null check (action in
    ('invitation_created', 'invitation_revoked', 'invitation_accepted', 'member_removed')),
  actor_id text,
  target_email text not null,
  at timestamptz not null
);
create index backoffice_access_audit_at on backoffice_access_audit (at);
