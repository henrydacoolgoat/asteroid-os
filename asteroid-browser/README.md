# Asteroid Browser runtime

This is the complete deployable Asteroid Browser runtime integrated with the
current Asteroid OS GitHub Pages release.

Runtime components:

- Scramjet 2.0.67-alpha.2
- Scramjet controller 0.0.14
- Locally bundled Libcurl Transport 2.0.5 primary transport
- Bundled Epoxy Transport 3.0.1 backup
- Per-site 16-profile compatibility learning
- Asteroid OS Shards access and app-target handoff
- Background research bridge
- Self-contained compatibility-runtime fallback

Keep this folder together and serve it through HTTPS or localhost. Development
source maps, TypeScript declarations, and upstream package archives are omitted
from this deployable package; the required licenses and third-party notices are
included.

The bundle's visible interface, storage keys, documentation, and validation
surface use Asteroid Browser naming throughout.
