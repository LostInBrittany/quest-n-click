### Changes

- **A release's candidate reuses the nightly's mutation measures (4.5.5, #329)**: the nightly's mutation shards, still
  measured from scratch, now save each passed gated shard's report in the cache on `main`, under the very key the
  candidate restores (the shard and its set's input hash). The candidate a release's merge starts then runs again only
  the sets whose inputs moved since the night, the others reused in a minute or two each: the same gate, about half an
  hour instead of over an hour when nothing shared by every set moved. `gh workflow run nightly --ref main -f
  jobs=mutation` runs the mutation jobs only, reusing what is cached: a warm-up after a release's last merge. The
  nightly's matrix runs 8 shards at a time, as the candidate's.
