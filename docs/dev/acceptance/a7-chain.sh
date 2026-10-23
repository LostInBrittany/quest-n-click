#!/bin/bash
# The A7 demonstrators' chain (docs/dev/acceptance/A7-DEMONSTRATORS.md), from the checkout's committed HEAD:
#   bash docs/dev/acceptance/a7-chain.sh [output folder, /tmp/a7chain by default]
# Local only: no credential is used (the wiki is a bare repository in the output folder), nothing is published;
# `pages` runs with --skip-attestations, which is for a look on a disk, never a deployment. It empties the output folder.
set -u
W=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
C=${1:-/tmp/a7chain}
rm -rf $C; mkdir -p $C/report
cd $W
H=$(git rev-parse HEAD); echo "$H" > $C/HEAD
w() { npm run -s wiki -- "$@"; }
w check > $C/01-check.txt 2>&1; echo "exit $?" >> $C/01-check.txt
npx vitest run tests/studio-backup.test.ts --reporter=default --reporter=json --outputFile.json=$C/report/vitest.json > $C/02-vitest.txt 2>&1; echo "exit $?" >> $C/02-vitest.txt
printf '{"format":"quest-n-click-test-report","version":1,"commit":"%s","root":"%s","run":"local-a7"}\n' $H "$W" > $C/report/commit.json
w check --publish --product-ref HEAD --state candidate --candidate local-a7 --test-report $C/report/vitest.json > $C/03a-publish-local-a7.txt 2>&1; echo "exit $?" >> $C/03a-publish-local-a7.txt
printf '{"format":"quest-n-click-test-report","version":1,"commit":"%s","root":"%s","run":"0"}\n' $H "$W" > $C/report/commit.json
w check --publish --product-ref HEAD --state candidate --candidate 0 --test-report $C/report/vitest.json > $C/03b-publish.txt 2>&1; echo "exit $?" >> $C/03b-publish.txt
w check --publish --product-ref HEAD --state candidate --candidate 0 > $C/03c-publish-no-report.txt 2>&1; echo "exit $?" >> $C/03c-publish-no-report.txt
w check --publish --product-ref HEAD --state published --candidate 0 --test-report $C/report/vitest.json > $C/03d-published.txt 2>&1; echo "exit $?" >> $C/03d-published.txt
w bundle --out $C/bundle > $C/04-bundle.txt 2>&1; echo "exit $?" >> $C/04-bundle.txt
w bundle --out $C/bundle2 > /dev/null 2>&1; diff -r $C/bundle $C/bundle2 > /dev/null && echo "two bundles: identical bytes" >> $C/04-bundle.txt
node scripts/pack.mjs --out=$C/pack --build-id local-a7 > $C/05-pack.txt 2>&1; echo "exit $?" >> $C/05-pack.txt
tar -tzf $C/pack/quest-n-click-4.4.0.tgz | grep docs-bundle > $C/05b-tar.txt
mkdir -p $C/consumer/pkg && tar -xzf $C/pack/quest-n-click-4.4.0.tgz -C $C/consumer/pkg
python3 -I - "$C/consumer/pkg/package/docs-bundle" > $C/05c-sums.txt <<'PY'
import json,hashlib,os,sys
d=sys.argv[1]
m=json.load(open(os.path.join(d,'bundle-manifest.json')))
print(json.dumps({k:v for k,v in m.items() if k!='files'}))
bad=[f['path'] for f in m['files'] if hashlib.sha256(open(os.path.join(d,f['path']),'rb').read()).hexdigest()!=f['sha256']]
print(len(m['files']),'files in bundle-manifest.json, sha256 mismatches:',bad)
PY
cd $C/consumer
export GAME= GAME_DIR= WEB_SCUMM_PROJECT= npm_config_audit=false npm_config_fund=false
node pkg/package/cli/create.mjs keeper "The Keeper" --engine=file:$C/pack/quest-n-click-4.4.0.tgz > $C/06-create.txt 2>&1; echo "exit $?" >> $C/06-create.txt
cd keeper && npm install > $C/06-install.txt 2>&1; echo "exit $?" >> $C/06-install.txt
cat > a7-mcp.mjs <<'MJS'
// The A7 demonstrators' MCP queries, through a real stdio client (the MCP SDK the engine depends on), against the
// engine installed in this created project, outside the repository.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const engine = new URL('./node_modules/quest-n-click/', import.meta.url).pathname;
const c = new Client({ name: 'a7-demonstrators', version: '1' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [engine + 'cli/quest-n-click.mjs', 'mcp'], env: { ...process.env, GAME: '', GAME_DIR: '' }, stderr: 'ignore' }));
const call = (name, args) => c.callTool({ name, arguments: args });
const top = (r, n = 5) => (r.structuredContent?.results ?? []).slice(0, n).map((x) => ({ ref: x.ref, lang: x.lang, reason: x.reason, score: x.score, context: x.context.join(','), snippet: x.snippet }));
const show = (label, v) => console.log(`\n### ${label}\n` + (typeof v === 'string' ? v : JSON.stringify(v, null, 2)));
const sha = (s) => createHash('sha256').update(s).digest('hex');
console.log('engine:', engine);
show('search_docs {query:"STUDIO_SESSION_KEY"}', top(await call('search_docs', { query: 'STUDIO_SESSION_KEY' }), 3));
const r1 = await call('read_doc', { id: 'reference.environment-variables', section: 'studio-session-key', lang: 'fr' });
show('read_doc {id:"reference.environment-variables", section:"studio-session-key", lang:"fr"}: text', r1.content.map((b) => b.text).join('\n---\n'));
show('… structuredContent.provenance', r1.structuredContent?.provenance);
show('… structuredContent.url', r1.structuredContent?.url);
const legacy = await call('read_doc', { name: 'TOOLS' });
const t = legacy.content[0]?.text ?? '';
show('read_doc {name:"TOOLS"} (legacy)', { isError: !!legacy.isError, blocks: legacy.content.length, type: legacy.content[0]?.type, chars: t.length, sha256: sha(t), sameAsBundleCopy: t === readFileSync(engine + 'docs-bundle/legacy/TOOLS.md', 'utf8'), structuredContent: legacy.structuredContent === undefined ? 'absent' : 'present', headings: t.split('\n').filter((l) => /^## /.test(l)).length });
for (const lang of ['en', 'fr']) show(`search_docs {query:"423", lang:"${lang}"}`, top(await call('search_docs', { query: '423', lang }), 2));
show('search_docs {query:"409", context:"studio-hosted"}', top(await call('search_docs', { query: '409', context: 'studio-hosted' }), 3));
show('search_docs {query:"409"} (no context)', top(await call('search_docs', { query: '409' }), 5));
show('search_docs {query:"conflit de verrou"}', top(await call('search_docs', { query: 'conflit de verrou' }), 3));
show('search_docs {query:"How do I restore the Studio on an empty database?"}', top(await call('search_docs', { query: 'How do I restore the Studio on an empty database?' }), 3));
show('search_docs {query:"How do I rotate STUDIO_SESSION_KEY?"}', top(await call('search_docs', { query: 'How do I rotate STUDIO_SESSION_KEY?' }), 3));
const list = await call('list_docs', {});
show('list_docs', { total: list.structuredContent?.total, ids: (list.structuredContent?.pages ?? []).map((p) => `${p.id} (${p.state})`) });
await c.close();
MJS
node a7-mcp.mjs > $C/07-mcp.txt 2>&1; echo "exit $?" >> $C/07-mcp.txt
cd $W
w build --target wiki --out $C/wiki-build > $C/08-build.txt 2>&1; echo "exit $?" >> $C/08-build.txt
a() { w archive --out $C/arch/$1 --product-version $2 --revision $3 --build-id 0 2>&1 | tail -1; }
{ a quest-n-click-docs-4.5.0.tar.gz 4.5.0 r1; a quest-n-click-docs-4.5.0-r2.tar.gz 4.5.0 r2; a quest-n-click-docs-4.6.0.tar.gz 4.6.0 r1; a quest-n-click-docs-4.5.0-r3.tar.gz 4.5.0 r3; } > $C/09-archive.txt
w archive --out $C/arch2/quest-n-click-docs-4.5.0.tar.gz --product-version 4.5.0 --build-id 0 > /dev/null 2>&1
cmp $C/arch/quest-n-click-docs-4.5.0.tar.gz $C/arch2/quest-n-click-docs-4.5.0.tar.gz && echo "4.5.0 r1 archive built twice: identical bytes" >> $C/09-archive.txt
w archive --out $C/arch/wrong-name.tar.gz --product-version 4.5.0 2>&1 | grep '✖' >> $C/09-archive.txt
mkdir -p $C/archive-x && tar -xzf $C/arch/quest-n-click-docs-4.5.0.tar.gz -C $C/archive-x
python3 -I - "$C/archive-x" > $C/10-archive-extract.txt <<'PY'
import json,hashlib,os,collections,sys
root=sys.argv[1]
m=json.load(open(os.path.join(root,'bundle-manifest.json')))
print(json.dumps({k:v for k,v in m.items() if k!='files'}))
bad=[f['path'] for f in m['files'] if hashlib.sha256(open(os.path.join(root,f['path']),'rb').read()).hexdigest()!=f['sha256']]
on=set()
for d,_,fs in os.walk(root):
  for f in fs: on.add(os.path.relpath(os.path.join(d,f),root))
listed={f['path'] for f in m['files']}
print(len(listed),'files listed; sha256 mismatches:',bad,'; on disk and not listed:',sorted(on-listed-{'bundle-manifest.json'}))
print(dict(collections.Counter(p.split('/')[0] for p in listed)))
PY
mkdir -p $C/wikirepo && cd $C/wikirepo && git init -q --bare -b master wiki.git && git clone -q wiki.git seed 2>/dev/null && cd seed && echo "# Home" > Home.md && git add Home.md && git -c user.name=maint -c user.email=m@example.org commit -qm "Initial Home page" && git push -q origin HEAD 2>/dev/null
cd $W
R=file://$C/wikirepo/wiki.git
log=$C/11-publish.txt; : > $log
sum() { shasum -a 256 $C/arch/$1 | cut -d' ' -f1; }
p() { echo "\$ wiki -- publish $*" | sed "s#$C/arch/##g; s#$R#<local bare wiki>#" >> $log; env -u GITHUB_TOKEN -u GH_TOKEN -u WIKI_DEPLOY_KEY npm run -s wiki -- publish --target wiki --remote $R "$@" >> $log 2>&1; echo "exit $?; wiki repo: $(git -C $C/wikirepo/wiki.git rev-list --count HEAD) commits, HEAD $(git -C $C/wikirepo/wiki.git rev-parse --short HEAD)" >> $log; }
p --mode release --ref refs/heads/main --version 4.5.0 --revision r1 --tag v4.5.0 --archive $C/arch/quest-n-click-docs-4.5.0.tar.gz --sha256 $(sum quest-n-click-docs-4.5.0.tar.gz)
git -C $C/wikirepo/wiki.git show HEAD:publication.json > $C/pub-1.json
p --mode promote --ref refs/heads/main --version 4.5.0 --revision r1 --tag v4.5.0 --archive $C/arch/quest-n-click-docs-4.5.0.tar.gz --sha256 $(sum quest-n-click-docs-4.5.0.tar.gz)
git -C $C/wikirepo/wiki.git show HEAD:publication.json > $C/pub-2.json
cmp $C/pub-1.json $C/pub-2.json && echo "publication.json byte-identical after the second decision" >> $log
p --mode revision --ref refs/heads/docs/4.5.0 --version 4.5.0 --revision r2 --tag docs-v4.5.0-r2 --archive $C/arch/quest-n-click-docs-4.5.0-r2.tar.gz --sha256 $(sum quest-n-click-docs-4.5.0-r2.tar.gz)
p --mode release --ref refs/heads/main --version 4.6.0 --revision r1 --tag v4.6.0 --archive $C/arch/quest-n-click-docs-4.6.0.tar.gz --sha256 $(sum quest-n-click-docs-4.6.0.tar.gz)
B=$(git -C $C/wikirepo/wiki.git rev-parse HEAD)
p --mode revision --ref refs/heads/docs/4.5.0 --version 4.5.0 --revision r3 --tag docs-v4.5.0-r3 --archive $C/arch/quest-n-click-docs-4.5.0-r3.tar.gz --sha256 $(sum quest-n-click-docs-4.5.0-r3.tar.gz)
echo "files changed by the 4.5.0 r3 publication: $(git -C $C/wikirepo/wiki.git diff --name-only $B HEAD | tr '\n' ' ')" >> $log
p --mode revision --ref refs/heads/docs/4.5.0 --version 4.5.0 --revision r2 --tag docs-v4.5.0-r2 --archive $C/arch/quest-n-click-docs-4.5.0-r2.tar.gz --sha256 0000000000000000000000000000000000000000000000000000000000000000
p --mode release --ref refs/heads/main --version 4.5.0 --revision r1 --tag v4.5.0 --archive $C/arch/quest-n-click-docs-4.5.0.tar.gz
p --mode release --ref refs/heads/feature/x --version 4.6.0 --revision r1 --tag v4.6.0 --archive $C/arch/quest-n-click-docs-4.6.0.tar.gz
git -C $C/wikirepo/wiki.git show HEAD:publication.json > $C/publication.json
git clone -q $C/wikirepo/wiki.git $C/wiki-checkout
mkdir -p $C/arch-4.6 && tar -xzf $C/arch/quest-n-click-docs-4.6.0.tar.gz -C $C/arch-4.6
diff -r -x .git -x publication.json $C/wiki-checkout $C/arch-4.6/wiki > /dev/null && echo "the wiki repository's pages = the 4.6.0 r1 archive's wiki/, byte for byte (publication.json aside)" >> $log
mk() { d=$C/releases/$1; mkdir -p $d; cp $C/arch/$2 $d/; s=$(sum $2); echo "$s  $2" > $d/$1-SHA256SUMS; case $1 in v*) printf '{"artifacts":[{"name":"docs/%s","sha256":"%s"}]}\n' "$2" "$s" > $d/quest-n-click-$1-candidate.json;; esac; }
mk v4.5.0 quest-n-click-docs-4.5.0.tar.gz; mk docs-v4.5.0-r2 quest-n-click-docs-4.5.0-r2.tar.gz; mk docs-v4.5.0-r3 quest-n-click-docs-4.5.0-r3.tar.gz; mk v4.6.0 quest-n-click-docs-4.6.0.tar.gz
log=$C/12-pages.txt
w pages --out $C/site1 --releases $C/releases --publication $C/publication.json --skip-attestations > $log 2>&1; echo "exit $?" >> $log
w pages --out $C/site2 --releases $C/releases --publication $C/publication.json --skip-attestations >> $log 2>&1; echo "exit $?" >> $log
diff -r $C/site1 $C/site2 > /dev/null && echo "two Pages builds from the same releases: identical trees" >> $log
w pages --out $C/site3 --releases $C/releases --publication $C/publication.json 2>&1 | grep '✖' >> $log
mkdir -p $C/arch-r2 && tar -xzf $C/arch/quest-n-click-docs-4.5.0-r2.tar.gz -C $C/arch-r2 && diff -r $C/arch-r2/html $C/site1/4.5.0/r2 > /dev/null && echo "/docs/4.5.0/r2/ = the r2 archive's html/, byte for byte" >> $log
mkdir -p $C/arch-r1 && tar -xzf $C/arch/quest-n-click-docs-4.5.0.tar.gz -C $C/arch-r1 && diff -r $C/arch-r1/html $C/site1/4.5.0/r1 > /dev/null && echo "/docs/4.5.0/r1/ = the r1 archive's html/, byte for byte, after 4.6.0 was published" >> $log
(cd $C/site1 && find . -maxdepth 2 -type d | sort) >> $log
if curl -s -o /dev/null http://127.0.0.1:8765/; then echo "port 8765 is taken: stop what listens there" >&2; exit 1; fi
python3 -I -m http.server 8765 --bind 127.0.0.1 --directory "$C/site1" > /dev/null 2>&1 &
HP=$!; sleep 1
log=$C/13-render.txt; : > $log
for u in /index.html /4.5.0/r2/en/clever.restore-drill.html /4.5.0/r1/fr/team.write-refused-423.html /4.6.0/r1/fr/reference.environment-variables.html /4.5.0/en/clever.restore-drill.html /latest/en/team.write-refused-409.html /publication.json /4.6.0/r1/search-index.json; do echo "GET $u -> $(curl -s -o /dev/null -w '%{http_code} %{size_download}B' http://127.0.0.1:8765$u)" >> $log; done
kill $HP
cd $W
w acceptance > $C/14-acceptance.txt 2>&1; echo "exit $?" >> $C/14-acceptance.txt
w acceptance --json > $C/14-acceptance.json 2>/dev/null
echo "done: $C"
