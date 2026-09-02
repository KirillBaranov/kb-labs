# Legacy binaries-channel tombstone

**These two files are not published by any workflow in this repository, and no
test in this repository asserts that they are live. Publishing them is a manual
step, performed once, by a human with write access to the GitHub Releases of
`kb-labs-team/kb-labs`.** They are committed here so the exact bytes are
reviewed, versioned and reproducible rather than typed into a web form.

## What they are

Before the release control-plane cutover, the published `install.sh` resolved a
launcher by reading a GitHub Release asset:

```
releases/download/binaries-stable/channel.json
releases/download/binaries-canary/channel.json
```

It extracted a `tag` field from that document by regular expression and, on
failure, printed its own text — `No binary release was found for ${REPO}.` —
and exited non-zero.

Nobody can be reached through that path. The script does not print the response
body, so no message placed in the document is ever shown to the person running
it (execution addendum §7.1, population C). What *can* be controlled is whether
the old path fails **deterministically and without downloading anything**, and
whether someone who opens the URL by hand — or finds it in a CI log — gets an
explanation.

That is all a tombstone is for.

## Why the asset is frozen rather than deleted

Deleting it makes the old script fail on a 404, which is indistinguishable from
a transient outage and invites a retry loop. Freezing it makes the failure
immediate and permanent: the document has **no `tag` field**, deliberately, so
the old script's regex finds nothing and it stops before any download.

## What they are explicitly not

- Not a compatibility shim. They install nothing and contain no executable code.
- Not a supported contract. `kb.release-legacy/0` exists to be recognised and
  refused; nothing reads it as an input format.
- Not a redirect to a working legacy release. Pointing `supersededBy` at a real
  legacy binary asset is forbidden (§7.2): it would make the retired path work
  again.
- Not a stub `kb-create` binary that prints a message. Also forbidden by §7.2 —
  publishing an executable under the launcher's name is worse than publishing
  nothing.

## The manual publish step

Run once, after the first new-contract channel descriptor is live at the
`releases.kb-labs.dev` endpoint and before or alongside announcing the cutover:

```sh
gh release upload binaries-stable \
  tools/kb-create/legacy-tombstone/binaries-stable.channel.json#channel.json \
  --repo kb-labs-team/kb-labs --clobber

gh release upload binaries-canary \
  tools/kb-create/legacy-tombstone/binaries-canary.channel.json#channel.json \
  --repo kb-labs-team/kb-labs --clobber
```

`--clobber` is correct here and only here: the point is to replace the live
document in place, so that a cached old `install.sh` reaching the same URL gets
the tombstone. It does not apply to any artifact of the new release train, where
published bytes are immutable.

Then verify by hand — there is no automated check for this, because this
repository has no credentials for that release:

```sh
curl -fsSL https://github.com/kb-labs-team/kb-labs/releases/download/binaries-stable/channel.json
# expect the tombstone body, and no "tag" field anywhere in it
```

## What *is* tested here

`install_test.sh` covers the other half of the same rule from the current
script's side: the `legacy pointer` case feeds this exact document shape to
today's `install.sh` and asserts it is refused with
`KB_CREATE_RELEASE_LEGACY_UNSUPPORTED` and downloads nothing. The behaviour of
the *retired* script against these bytes cannot be tested — that script no
longer exists in the tree, which is the point.
