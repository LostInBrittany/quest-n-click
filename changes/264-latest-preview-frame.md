### Fixed

- **The hosted Studio's end-to-end run no longer waits on a Play frame that never answers after "Load the latest
  preview" (4.5.1, #264)**: on the Firefox pass, the script took the frame as soon as its address showed the expected
  revision and spent 30 s on it, and the second click still expected the revision the first one read. Both clicks now
  go through one helper that reads the latest revision at each click, looks the frame up again at each try with each
  evaluation bounded, and loads the page once more (said in the log) if it stays silent. Nothing changes in the Studio.
