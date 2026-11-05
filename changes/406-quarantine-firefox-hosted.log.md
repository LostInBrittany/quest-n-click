## `studio-hosted`'s Firefox pass in quarantine (#406)

#406's flake ("a layout written meanwhile is what the view shows once its revision's preview is ready — PUT 200,
shown undefined", the room editor silent for 15 s, then the run's 8-min limit) struck on #390, twice on #423 and
#427's day, and on 4.7.0's release merge (run 42034234544, attempt 1). Always Firefox: Chromium's pass of
`e2e:studio-hosted` was green in the same job. One `&&` chain ran the four passes, so it failed the job, the run, and
with it what the release requires on main. Firefox's hosted pass now runs alone, `continue-on-error`, with a warning
when it fails, as `pwa-firefox` is said in `pr-gate` (#257); the job-level choice was set aside because `pr-gate`
alone cannot save a release, which reads main's whole run. Chromium's hosted pass and both collab passes still block.

→ next: #406's fix (the preview's readiness in Firefox), then the step joins the blocking one again.
