### Fixed

- **The email webhook's and the Open Badges endpoint's limit per address holds against IPv6 and many clients (next,
  #500)**: `perMinutePerIp` gave each IPv6 address its own budget, so one host, usually handed a whole /64, was never
  limited; and above 10 000 addresses in memory, every request walked them all. An IPv6 address now counts by its /64
  (an IPv4-mapped one as its IPv4), as the Bridge's limits do since 4.7.2, and the idle addresses are swept at most
  once a minute.
