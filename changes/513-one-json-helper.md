### Changes

- **The local Studio answers a request body the same way on every route (next, #513)**: the API, the Assistant and
  the Assets tab share one body reader, each with its own size bound (8, 4 and 96 MiB). An empty or blank body is `{}`,
  a body that is not JSON is `400 the body is not valid JSON`, and anything but a JSON object is `400 the body must be
  a JSON object`. Before, the Assistant refused a blank body and called invalid JSON "not an object", and the API let a
  JSON array through to the route.
