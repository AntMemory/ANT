# Security Policy

ANT is public-alpha software. Treat cloud sync as experimental and review memories before sharing them outside your machine.

## Reporting

Please report security issues privately to the maintainers before opening a public issue. If no private channel is available, open a minimal public issue that asks for a security contact without including exploit details or secrets.

## Scope

In scope:

- Secret leakage through redaction or packaging mistakes.
- Unsafe cloud sync behavior.
- Local database handling issues that could expose private memory data.

Out of scope for the alpha:

- Availability guarantees.
- Enterprise access controls.
- Cloud authentication hardening, which is not implemented yet.

## Redaction

ANT uses deterministic regex and entropy checks. This is a safety layer, not a guarantee. Do not intentionally store real secrets in memories.
