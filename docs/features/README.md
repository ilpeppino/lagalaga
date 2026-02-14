# Feature Plans

This directory contains comprehensive implementation plans for major features.

## Active Plans

### [Hybrid Friends System](./hybrid-friends.md)
**Status:** Ready for implementation
**Last updated:** 2026-02-14

Full plan for adding a hybrid friends system:
- Roblox friends cache (discovery/suggestions)
- LagaLaga native friendships (request/accept/block)
- Friends-only session visibility enforcement
- Friends tab with 3 sections (friends/requests/suggestions)

**Key verification complete:**
- ✅ Roblox public friends API confirmed (no auth needed)
- ✅ Two-step sync process (IDs → batch username lookup)
- ✅ Database schema reviewed (composite PK confirmed)

**Next steps:** Begin PR 1 (database schema + shared types)
