# VHS tape — records the PowerShell walkthrough demo GIF.
# Uses ps-walkthrough-demo.ps1 (sandbox placeholder data, no real API calls).
# Run from the repo root:
#   vhs scripts/ps-walkthrough.tape

Output docs/media/ps-walkthrough.gif

Set Theme "Dracula"
Set FontSize 13
Set Width 1200
Set Height 600
Set PlaybackSpeed 1

# ── Launch the demo ──────────────────────────────────────────────────────────
Type "pwsh scripts/ps-walkthrough-demo.ps1 -WhatIf"
Enter
Sleep 400ms

# ── Tenant URL input — type base form to show .api. auto-insert ─────────────
Sleep 600ms
Type "https://acme.identitynow.com"
Enter
Sleep 1800ms

# ── STEP 1: Target — choose Bulk mode ───────────────────────────────────────
Type "B"
Enter
Sleep 400ms

# ── Name contains ────────────────────────────────────────────────────────────
Type "ACME"
Enter
Sleep 2500ms

# ── STEP 2: Operation — Update ───────────────────────────────────────────────
Type "U"
Enter
Sleep 400ms

# ── Attribute — bare name (no attribute. prefix) ─────────────────────────────
Type "cloudLifecycleState"
Enter
Sleep 300ms

# ── Old value ────────────────────────────────────────────────────────────────
Type "active"
Enter
Sleep 300ms

# ── New value ────────────────────────────────────────────────────────────────
Type "provisioned"
Enter
Sleep 4500ms

# ── Hold final frame (WhatIf output) before GIF loops ───────────────────────
Sleep 3s
