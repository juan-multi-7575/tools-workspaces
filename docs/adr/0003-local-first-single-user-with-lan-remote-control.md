# Local-first single user with LAN remote control, no accounts

The app runs locally for a single user with no authentication. To let a phone on the same network trigger downloads, the backend binds to `0.0.0.0` and gates remote actions behind a per-boot random token; there are no accounts, roles, or multi-user guarantees. Considered and rejected: strict localhost (loses the phone controller) and full multi-user auth (out of scope).
