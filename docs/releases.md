# Releases and platform packages

## Current version and maturity

The current package version is `0.1.0`. This is an early pre-release implementation, not a validated stable release. The recommended first public tag is `v0.1.0-alpha.1`. Release CI can apply that version without a version-bump commit.

- **Alpha:** usable for experimentation; compatibility, native platforms, and recovery workflows still need validation. This describes the project today.
- **Beta:** core workflows and supported platforms have been exercised, feature scope is settled, and wider user testing is the main remaining work.
- **Release candidate (RC):** all release checks have passed and the build is intended to become stable unless testing finds a blocker.

Passing CI proves build/test results, not database-version compatibility or safe production restores. Follow the release checks in [the MVP specification](mvp-spec.md), and test real native workflows before promising platform support.

## Publishing through CI/CD

Review changes, passing PR checks, dependencies, licensing/attribution, and release notes before publishing. The selected commit must already contain this workflow and packaging documentation. Once the workflow is in the default branch, no separate version-bump commit or manually created tag is required for each release.

### Option A: Run workflow (no version commit or pre-created tag)

1. Open **Actions → Release → Run workflow** on GitHub.
2. Select the branch/commit to build and enter a new version, for example `0.1.0-alpha.1` (a leading `v` is optional).
3. CI checks out that exact commit, validates the version, and applies it to `package.json`/`package-lock.json` only inside its temporary workspace. Nothing is committed or pushed back to the branch.
4. After all four packages build successfully, CI creates tag `v0.1.0-alpha.1` at the selected commit and publishes the release with assets, generated notes, and checksums. Versions with a prerelease suffix are automatically marked as GitHub pre-releases.
5. Review release notes and smoke-test the downloaded artifacts before announcing availability.

Use a new version each time. The upload job rejects an existing tag to avoid attaching binaries built from a different commit to it. If a build fails before publishing, re-run it; no tag or release has been created yet. If release creation/upload fails partway, inspect GitHub's release state before retrying.

### Option B: Publish an existing GitHub release

Create a tag/release from a reviewed commit and publish it. The `release: published` event (including pre-releases) automatically builds and uploads packages to that release. Version comes from the tag, not the package version stored in Git. A tag push alone does not run this flow. Re-running this flow replaces matching asset filenames.

For this option, the release is visible before its packages are ready. A failed platform build prevents the workflow from uploading a partial set.

For both options, the release version must be valid SemVer. The tag/input determines package filenames and the ephemeral package version; native OS version metadata uses its numeric part. Source `package.json` may still say `0.1.0` even when a build is published as `0.1.0-alpha.1`—the tag and release assets identify the distributed version.

The workflow uses GitHub-hosted runners and the built-in token, not a personal access token. Build jobs have read-only permission; only the final publish job has `contents: write`. GitHub does not trigger another `release: published` workflow from a release created with this built-in token, so manual publication does not cause a second duplicate build.

## Packages

| Platform | Architecture | Package |
| --- | --- | --- |
| Linux | x86_64 | `.AppImage` |
| macOS | Apple Silicon (arm64) | `.app` inside `.tar.gz` |
| macOS | Intel (x86_64) | `.app` inside `.tar.gz` |
| Windows | x86_64 | portable `.exe` inside `.zip` |

All filenames include the release version. `SHA256SUMS` lists package checksums; it detects corrupted downloads but is not a signing or authenticity guarantee.

### Linux

Linux is the primary platform. The AppImage is built on Ubuntu 22.04 and bundles GTK/WebKit dependencies. This sets a build baseline, not a promise that every distribution works. Test at least the distributions listed in the release checks. Make the AppImage executable before launching it. Hosts may need FUSE support, or can use the AppImage runtime's extract-and-run mode.

Local packaging requires linuxdeploy, its GTK plugin and AppImage output plugin. Place them in `~/.cache/wadahdb-studio/linuxdeploy` or set `LINUXDEPLOY_DIR` and `LINUXDEPLOY`. `VERSION` defaults to `package.json`; `APPIMAGE_RUNTIME_FILE` can supply an offline runtime. Release CI downloads these tools from upstream continuous channels, so packaging is not fully reproducible yet.

### macOS (experimental)

Extract the matching architecture archive and move the `.app` into Applications. These builds are not Developer ID signed or notarized. macOS may block downloaded apps; follow Apple's documented process for apps from identified/unidentified developers only after deciding you trust the source. Do not disable Gatekeeper globally. No DMG installer or automatic updater is provided.

### Windows (experimental)

Extract the ZIP before running the executable. Install the [Microsoft Edge WebView2 Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section) if needed. These executables are unsigned and may trigger SmartScreen warnings. There is no MSI/NSIS installer yet.

### Runtime validation

macOS and Windows packages are experimental until native smoke tests cover connection profiles, TCP/TLS/SSH, saved passwords, native file dialogs, query execution, import/export, and backup/restore. A successful build does not establish these behaviors. SSH requires a system `ssh` executable on PATH on every platform. The secret-store dependency provides OS-specific backends; saved-password behavior must be checked on each native OS.

Third-party dependencies retain their own licenses. Review bundled dependency notices before distributing stable binary releases; inclusion of the project LICENSE alone does not replace third-party obligations.
