### Fixed

- **A worker on a machine whose clock is a little behind no longer refuses jobs (4.2.3, found by the reference
  deployment)**: the Studio signs a job to live 5 min to the millisecond, and the worker refused one that lived longer
  by its own clock, so a few milliseconds of skew between the two machines refused about half the jobs (health and
  previews failed with "refused the job (403)"). The worker now allows 30 s of skew, logs why it refuses a job, and the
  Studio says the worker's reason.
