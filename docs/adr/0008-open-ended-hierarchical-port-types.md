# Open-ended hierarchical port types and MIME subsumption

Ports in the tool catalog are open-ended strings following a MIME-like taxonomy (`category/subtype[+format]`, e.g., `audio/wav`, `application/pdf`, `image/png`, `text/markdown`, `network/pcap`, `*/*`), superseding the closed 5-element enum.

Port compatibility is resolved via wildcard subsumption: `*/*` matches any input, `category/*` matches any format within the domain category (e.g. `audio/*` matches `audio/wav`), and explicit subtypes match on exact equality.

Considered and rejected: a closed enum (prohibits adding new tools from untracked domains without code changes) and unconstrained untyped strings (would allow users to wire incompatible tools and produce silent failures).
