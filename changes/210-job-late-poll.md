### Fixed

- **A prepared job keeps its result on screen (4.3.0, #210)**: on a hosted Studio, the Assets panel could replace
  "prepared from revision 3: 218 files" with "Preparing the assets: done" a moment after the job ended, when a status
  check sent before the end answered after it. Once a job has ended, the page hears nothing more of it, nor of a Cancel
  sent just before the end and refused after it (the panel used to add "(the job has ended)" to its last word). This
  also made the Firefox pass of `npm run e2e:studio-hosted` fail now and then.
