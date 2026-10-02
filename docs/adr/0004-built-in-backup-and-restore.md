---
status: accepted
---

# Keep backup and restore self-contained in the AppImage

Backup and restore are core features of the first public release. Users must be able to run them without installing MySQL or MariaDB dump tools separately. We will build a native backup and restore path inside the application, with engine-specific handling and round-trip tests for every supported server series. This increases implementation work, but gives the distributed AppImage a dependable workflow without external executable discovery or packaging of separate dump programs.

The backup artifact will be a documented SQL format that users can inspect. Implementation must verify that schema objects and data survive a backup and restore cycle before this feature is called complete.
