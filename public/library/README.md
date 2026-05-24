# Pre-built plist library

Drop curated `Info.plist` files or full `.mobileconfig` profiles here. Files
in this folder are served at `/library/...` on the deployed site (via Vite's
`public/` convention), so the app can fetch them at runtime.

## Layout convention

Organise files by Apple bundle identifier (one folder per app), and add a
`manifest.json` at the root of this folder if you want the app to enumerate
them.

```
public/library/
  manifest.json                          # index of all entries (optional)
  com.microsoft.teams/
    Info.plist                           # sample bundle plist for Teams
  com.microsoft.edgemac/
    Info.plist
  com.google.Chrome/
    Info.plist
```

## Sample `manifest.json`

```json
{
  "manifestVersion": "1.0",
  "entries": [
    {
      "id": "teams-info",
      "displayName": "Microsoft Teams",
      "bundleId": "com.microsoft.teams",
      "file": "com.microsoft.teams/Info.plist",
      "description": "Bundled Info.plist for Microsoft Teams"
    }
  ]
}
```

## What goes here

- **Sanitized** `Info.plist` files — no Apple Developer team IDs scrubbed,
  no per-environment paths.
- **Pre-built `.mobileconfig`** templates that downstream users can import
  and tweak.

## What does NOT belong here

- Real customer profile UUIDs, organization names, or PayloadIdentifier
  values tied to a specific tenant.
- Any file containing plaintext passwords, SCEP challenge strings, or PKCS#12
  blobs with private keys.

> Wiring the app UI to actually browse and fetch these files is a separate
> feature — see the roadmap discussion in the project notes.
