# SECURITY CRITICAL: Secrets Exposed in Version Control

## Severity
🔴 **CRITICAL**

## Category
Security / Credentials

## Description
Multiple production secrets and API keys are committed to version control in `.env` files, creating severe security vulnerabilities.

## Affected Files
- `.env` (lines 8, 16-17)
- `.env.production` (lines 8, 16-17)
- `backend/.env` (lines 8, 12, 21, 23)

## Exposed Credentials
1. **Roblox Client Secret**: `RBX-XVC7lxXwdE6AFoQrdbYo3hO9PE85NLeD4CdhLoE8F3lvNmvnBWBhdxKmfcqUPh8z`
2. **Roblox Client ID**: `3756642473415882345`
3. **Supabase Service Role Key** (JWT with exp: 2085904404)
4. **Supabase Anon Key**
5. **JWT Secrets** hardcoded in multiple files

## Impact
An attacker with access to these credentials can:
- Impersonate the Roblox OAuth client
- Bypass all Supabase RLS policies (service role key bypasses RLS)
- Sign arbitrary JWTs with valid signatures
- Access/modify all user data in Supabase
- Compromise user accounts

## Recommended Fix

### Immediate Actions (Within 24 hours)
1. **Rotate all exposed credentials immediately**:
   - Generate new Roblox OAuth credentials at https://create.roblox.com/credentials
   - Generate new Supabase service role key in Supabase dashboard
   - Generate new JWT secrets using `openssl rand -base64 32`

2. **Remove from git history**:
```bash
# Option 1: BFG Repo-Cleaner (recommended)
bfg --replace-text passwords.txt  # Create file with secrets
git reflog expire --expire=now --all && git gc --prune=now --aggressive

# Option 2: git-filter-repo
git filter-repo --path .env --path .env.production --path backend/.env --invert-paths
```

3. **Update .gitignore**:
```gitignore
# Environment files
.env
.env.*
.env.local
.env.production
.env.development
backend/.env
backend/.env.*
!.env.example
!backend/.env.example
```

### Long-term Solutions
1. **Move secrets to environment variable management**:
   - Render/Railway: Use dashboard environment variables
   - Supabase: Use Supabase Vault for secrets
   - Frontend: Remove all secrets - they should NEVER be in frontend

2. **Implement pre-commit hooks** (husky):
```bash
npm install --save-dev husky
npx husky init
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg
# Add secret detection hook
```

3. **Add secret scanning**:
   - Enable GitHub secret scanning in repository settings
   - Add TruffleHog or GitGuardian to CI/CD

4. **Create .env.example files** with placeholder values

## References
- OWASP: Sensitive Data Exposure (A02:2021)
- CWE-798: Use of Hard-Coded Credentials
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)

## Priority
**P0 - Critical** - Must be fixed before production launch

## Estimated Effort
2-4 hours (including credential rotation and verification)
