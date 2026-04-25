# Repository Instructions

- After every moderate repo change, add one short dated entry to `CHANGELOG.md`.
- Keep changelog entries brief and operationally useful.
- If you add a reusable local script or tool, document it in `README.md`.
- Prefer `npm run verify:release` before concluding release or workflow changes when feasible.
- Whenever a newer demo APK is published, update the GitHub-facing `README.md` demo release link, APK link, and checksum in the same change.
- If a third-party dependency needs a local fix, persist it with `patch-package` and commit the generated patch under `patches/`.
