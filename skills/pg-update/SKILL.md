---
name: pg-update
description: Use when updating ProxyGate CLI or SDK to latest version. Also triggers proactively when ~/.claude/cache/proxygate-update-check.json indicates an update is available and the statusline shows the update indicator. Make sure to use this whenever someone says "update proxygate", "upgrade cli", or when a session starts with an update notification.
---

# ProxyGate Update

Check for and install updates to proxygate.

<process>

<step name="get_installed_version">
```bash
proxygate --version 2>/dev/null || echo "NOT_INSTALLED"
```

If not installed, direct user to `/pg-setup`.
</step>

<step name="check_latest_version">
```bash
npm view proxygate version 2>/dev/null || echo "UNAVAILABLE"
```

If npm check fails, suggest manual update: `npm install -g proxygate@latest`
</step>

<step name="compare_versions">
- If installed == latest: "You're already on the latest version."
- If installed < latest: show both versions and proceed to update
- If not installed: direct to `/pg-setup`
</step>

<step name="run_update">
```bash
npm install -g proxygate@latest
```

Verify:
```bash
proxygate --version
```
</step>

<step name="update_skills">
Skills are bundled in the CLI, so a new version may include updated skills:

```bash
proxygate skills install
```
</step>

<step name="clear_cache">
```bash
rm -f ~/.claude/cache/proxygate-update-check.json
```
</step>

</process>

## SDK Update

If `@proxygate/sdk` is in the project's dependencies:

```bash
npm install @proxygate/sdk@latest
# or
pnpm add @proxygate/sdk@latest
```

<success_criteria>
- [ ] Installed version detected correctly
- [ ] Latest version checked via npm
- [ ] Update skipped if already current
- [ ] CLI updated successfully
- [ ] Skills updated via `proxygate skills install`
- [ ] Update cache cleared
</success_criteria>
