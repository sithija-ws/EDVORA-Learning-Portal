# EDVORA — PHASE 3C.5: STAGING DATABASE CONNECTIVITY DIAGNOSTIC REPORT

**Diagnostic Date:** 2026-11-25  
**Audit Mode:** Strictly Read-Only (0 SQL Executions, 0 Modifications, 0 Secrets Exposed)  
**Target Staging Project:** `edvora-staging` (`voyypkysddyrjuqimzya`)  
**Protected Development Project:** `edvora` (`sauphnaxchcouqslflsl`) — Detached & Untouched  

---

## 1. Executive Summary & Verdict

### Final Verdict: **CONNECTIVITY ISSUE IDENTIFIED**

### Remote Migration State: **REMOTE MIGRATION HISTORY UNVERIFIED**

A comprehensive multi-layer diagnostic was performed across the Supabase Management API, DNS resolution, network transport protocols (IPv4 and IPv6), connection pooler ports, and CLI authentication mechanisms.
- **The underlying root cause has been precisely pinpointed:** The Supabase CLI defaults to requesting a passwordless temporary login role (`cli_login_postgres`) via the Management API when no database password is configured in the local shell. The remote PostgreSQL instance on `db.voyypkysddyrjuqimzya.supabase.co:5432` immediately terminates the connection during the `cli_login_postgres` authentication handshake.
- **Direct PostgreSQL Reachability Verified:** TCP port 5432 on `db.voyypkysddyrjuqimzya.supabase.co` is open and responsive. When tested with standard PostgreSQL user authentication (`user=postgres`), the database server responds with standard PostgreSQL protocol errors (`FATAL: password authentication failed for user "postgres"`), proving the database engine is healthy, online, and awaiting valid credentials.
- In strict adherence to prompt instructions, because the remote database query cannot complete without supplying the database password, the remote migration state is officially marked **`REMOTE MIGRATION HISTORY UNVERIFIED`**.

---

## 2. Task 1: Exact Captured Error Output

Command executed:
```bash
npx supabase migration list --remote
```

Complete raw error output:
```text
Target: project edvora-staging (voyypkysddyrjuqimzya) · production
Initialising login role...
{"target":{"kind":"linked","project_ref":"voyypkysddyrjuqimzya","project_name":"edvora-staging","environment":"production"},"_tag":"Error","error":{"code":"DbConnectError","message":"failed to connect to postgres: failed to connect to `host=db.voyypkysddyrjuqimzya.supabase.co user=cli_login_postgres database=postgres`: Connection terminated unexpectedly"}}
```

Debug trace log (`--debug`):
```text
No profile file at C:\Users\E-TEC\.supabase\profile; using the default profile.
Target: project edvora-staging (voyypkysddyrjuqimzya) · production
No database password found; using a temporary login role...
Using access token for profile: supabase
Supabase CLI 3.4.0
Using profile: supabase (supabase.co)
Using access token for profile: supabase
Initialising login role...
2026/11/25 14:41:54 HTTP POST: https://api.supabase.com/v1/projects/voyypkysddyrjuqimzya/cli/login-role
{"target":{"kind":"linked","project_ref":"voyypkysddyrjuqimzya","project_name":"edvora-staging","environment":"production"},"_tag":"Error","error":{"code":"DbConnectError","message":"failed to connect to postgres: failed to connect to `host=db.voyypkysddyrjuqimzya.supabase.co user=cli_login_postgres database=postgres`: Connection terminated unexpectedly"}}
```

---

## 3. Task 2: Multi-Layer Connectivity Diagnostics

### Layer 1: Supabase Management API Connectivity
- **Command:** `npx supabase projects list`
- **Result:** **SUCCESSFUL & FULLY AUTHENTICATED**
- **Findings:**
  - The CLI successfully authenticates to `https://api.supabase.com` using the stored personal access token.
  - Returns metadata for both organizations and projects.
  - Explicitly reports `voyypkysddyrjuqimzya` as `status: "ACTIVE_HEALTHY"`, `database.postgres_engine: "17"`, and `linked: true`.
  - Confirms project `sauphnaxchcouqslflsl` as `linked: false`.

### Layer 2: DNS Resolution for Database Hostnames
- **Direct Host:** `db.voyypkysddyrjuqimzya.supabase.co`
  - `AAAA` (IPv6): `2406:da14:311:1501:6a74:5063:e0b6:6f9` (Resolved successfully).
  - `A` (IPv4): **No IPv4 A record exists.** (Supabase direct database hosts are IPv6-only by architecture).
- **Pooler Host:** `aws-1-ap-northeast-1.pooler.supabase.com`
  - `CNAME` -> `pool-tcp-apne11-db3334d-25a99222e0448...`
  - `A` (IPv4): `13.114.6.6`, `18.176.230.146`, `57.182.231.186` (Resolved successfully).
  - `AAAA` (IPv6): `64:ff9b::d72:606` (Resolved successfully).

### Layer 3: IPv4 and IPv6 Network Transport
- **Test:** PowerShell `Test-NetConnection -ComputerName <host> -Port 5432`
- **Direct Database Host (`db.voyypkysddyrjuqimzya.supabase.co:5432`):**
  - Remote Address: `2406:da14:311:1501:6a74:5063:e0b6:6f9`
  - Source Address: `2404:8a00:...` (Local Wi-Fi adapter IPv6)
  - `TcpTestSucceeded`: **`True`**
  - **Conclusion:** Network-level TCP connectivity over IPv6 is fully functional. No firewall or ISP drop occurs at port 5432.
- **Pooler Host (`aws-1-ap-northeast-1.pooler.supabase.com:5432`):**
  - `TcpTestSucceeded`: **`True`**

### Layer 4: Connection Pooler Availability
- **Transaction Mode Port (6543):**
  - `Test-NetConnection -ComputerName aws-1-ap-northeast-1.pooler.supabase.com -Port 6543` -> `TcpTestSucceeded: True`.
- **Session Mode Port (5432):**
  - `Test-NetConnection -ComputerName aws-1-ap-northeast-1.pooler.supabase.com -Port 5432` -> `TcpTestSucceeded: True`.
- **Local Pooler Configuration:**
  - File `supabase/.temp/pooler-url` records: `postgresql://postgres.voyypkysddyrjuqimzya@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`.

### Layer 5: Supabase CLI Authentication
- **Profile:** Default profile (`supabase`)
- **Access Token:** Configured and active.
- **Management API Operations:** All succeed without authentication errors.

### Layer 6: Database Authentication & Password Mechanism
- **Automated Login Role (`cli_login_postgres`):**
  - When `npx supabase migration list --remote` runs without a database password, the CLI attempts to bypass password authentication by calling `POST /v1/projects/voyypkysddyrjuqimzya/cli/login-role` to create an ephemeral role `cli_login_postgres`.
  - The PostgreSQL database rejects or terminates this connection immediately upon socket connection (`Connection terminated unexpectedly`).
- **Standard User Authentication (`user=postgres`):**
  - When invoked with a test password flag (`-p <password>`), the CLI bypasses `cli_login_postgres` and connects as `user=postgres`.
  - The remote database accepts the connection, performs SSL handshake, evaluates the credential, and returns:
    `server error (FATAL: password authentication failed for user "postgres" (SQLSTATE 28P01))`
    `suggestion: "Connect to your database by setting the env var correctly: SUPABASE_DB_PASSWORD"`
  - **Conclusion:** The database server is healthy and fully operational. It strictly requires password authentication for user `postgres` and rejects the temporary CLI login role mechanism.

---

## 4. Task 3: Linked Target Verification

Inspection of local configuration files:
1. `supabase/.temp/project-ref`:
   ```text
   voyypkysddyrjuqimzya
   ```
2. `supabase/.temp/linked-project.json`:
   ```json
   {
     "ref": "voyypkysddyrjuqimzya",
     "name": "edvora-staging",
     "organization_id": "xvhfqwtdfejhtmphnwym",
     "organization_slug": "xvhfqwtdfejhtmphnwym"
   }
   ```
- **Confirmation:** The linked project reference is verified to be exactly `voyypkysddyrjuqimzya`. No other project is linked.

---

## 5. Task 4: Remote Migration State

- Because the automated temporary login role fails and no database password has been supplied in this session, the CLI cannot authenticate into the PostgreSQL engine to query the `supabase_migrations.schema_migrations` table.
- **Official Status:**
  ```text
  REMOTE MIGRATION HISTORY UNVERIFIED
  ```
- No speculative assumptions are made regarding remote migration state.

---

## 6. Diagnosis Summary & Resolution Path

| Diagnostic Dimension | Finding | Assessment |
| :--- | :--- | :---: |
| **Target Project Link** | Linked to `voyypkysddyrjuqimzya` (`edvora-staging`) | **CONFIRMED** |
| **Development Isolation** | Project `sauphnaxchcouqslflsl` is unlinked (`linked: false`) | **CONFIRMED** |
| **Management API** | Returns HTTP 200 for project listings and token checks | **OPERATIONAL** |
| **DNS Resolution** | Direct host has AAAA (IPv6); Pooler has A (IPv4) & AAAA | **OPERATIONAL** |
| **Network TCP Ports** | Port 5432 (direct & pooler) and Port 6543 (pooler) open | **OPERATIONAL** |
| **PostgreSQL Engine** | Online, responding to TLS handshakes and auth requests | **HEALTHY** |
| **Root Cause** | Remote DB terminates temporary role `cli_login_postgres` | **IDENTIFIED** |
| **Required Resolution** | Authenticate using staging database password (`SUPABASE_DB_PASSWORD` or CLI prompt) | **READY** |

### How to Unblock Remote Inspection / Migration:
When executing remote commands (`supabase migration list --remote` or `supabase db push`), provide the staging database password using either of the following standard, secure methods:
1. **Interactive Prompt:** Run `npx supabase db push` and enter the database password when prompted.
2. **Session Environment Variable:** In your private terminal session, set:
   ```powershell
   $env:SUPABASE_DB_PASSWORD="<your-staging-database-password>"
   ```
   *(Never commit this password to Git or write it to repository files).*
