# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes.
Older releases are unsupported and will not receive patches.

| Version | Supported |
|---|---|
| Latest (`main`) | Yes |
| Older releases | No |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via **GitHub Security Advisories**:

1. Navigate to the repository on GitHub.
2. Click **Security** → **Advisories** → **Report a vulnerability**.
3. Fill in the details: description, reproduction steps, impact, and any
   proof-of-concept.

> **Maintainer TODO:** Add a direct contact method (e.g., a monitored email
> address or security alias) here once one is established. GitHub Security
> Advisories provide a private channel in the meantime.

You should receive an acknowledgement within **7 days**. If you have not
heard back after 14 days, follow up on the same advisory thread.

## Scope

This tool touches sensitive systems. The following categories are in scope:

- **Credential handling:** The Electron app stores OAuth2 tokens and Personal
  Access Tokens in the OS keychain (macOS Keychain, Windows Credential Manager,
  Linux libsecret). Vulnerabilities that allow credential exfiltration or
  unauthorized keychain access are high severity.
- **Bulk write operations:** The tool issues bulk `PATCH /v3/roles/{id}` calls
  to a live SailPoint ISC tenant. Vulnerabilities that allow unintended role
  membership changes, privilege escalation, or bypass of the dry-run / preview
  gate are high severity.
- **Input validation:** Role criteria JSON is parsed and patched client-side
  before submission. Malformed or adversarially crafted criteria payloads that
  produce incorrect patches are in scope.
- **Snapshot files:** Pre-run snapshots are written to the local filesystem.
  Path traversal or arbitrary write vulnerabilities are in scope.

The following are **out of scope**:

- Vulnerabilities in SailPoint ISC itself (report those to SailPoint).
- Vulnerabilities in upstream dependencies that have no direct exploit path in
  this tool.
- Social engineering or phishing attacks.
- Issues requiring physical access to the machine.

## Disclosure Policy

Once a fix is available, a coordinated disclosure will be made via a GitHub
Security Advisory. Credit will be given to the reporter unless they prefer to
remain anonymous.
