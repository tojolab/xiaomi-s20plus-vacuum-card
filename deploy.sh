#!/bin/bash
# deploy.sh — commit, release on GitHub, deploy to HA and restart

set -e

HA_HOST="192.168.1.90"
HA_PORT="8123"
# Load secrets from .deploy.env (never committed)
if [ -f "$(dirname "$0")/.deploy.env" ]; then
  source "$(dirname "$0")/.deploy.env"
fi
: "${HA_TOKEN:?HA_TOKEN not set. Add it to .deploy.env}"
: "${HA_SSH_PASS:?HA_SSH_PASS not set. Add it to .deploy.env}"
: "${GH_TOKEN:?GH_TOKEN not set. Add it to .deploy.env}"
GH_REPO="luchusnet/xiaomi-robot-vacuum-card"
GH_BRANCH="feature/xiaomi-cloud-map-extractor-support"
JS_FILE="xiaomi-robot-vacuum-card.js"
HA_PATH="/config/www/community/xiaomi-robot-vacuum-card/$JS_FILE"

# --- 1. Git commit & push ---
echo "→ Committing and pushing..."
git add -A
COMMIT_MSG="${1:-Update card}"
git commit -m "$COMMIT_MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>" 2>/dev/null || echo "  (nothing to commit)"
git push myfork "$GH_BRANCH" > /dev/null 2>&1
echo "  ✓ Pushed to fork"

# --- 2. Create GitHub release ---
echo "→ Creating GitHub release..."
LATEST_TAG=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$GH_REPO/releases/latest" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('tag_name','v0.0.0'))" 2>/dev/null)

# Bump patch version
MAJOR=$(echo "$LATEST_TAG" | cut -d. -f1 | tr -d 'v')
MINOR=$(echo "$LATEST_TAG" | cut -d. -f2)
PATCH=$(echo "$LATEST_TAG" | cut -d. -f3)
NEW_TAG="v${MAJOR}.${MINOR}.$((PATCH + 1))"

# Delete old tag if exists
curl -s -X DELETE -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$GH_REPO/releases/$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$GH_REPO/releases/latest" | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)" > /dev/null 2>&1 || true
curl -s -X DELETE -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$GH_REPO/git/refs/tags/$LATEST_TAG" > /dev/null 2>&1 || true

RELEASE_ID=$(curl -s -X POST \
  -H "Authorization: Bearer $GH_TOKEN" -H "Content-Type: application/json" \
  "https://api.github.com/repos/$GH_REPO/releases" \
  -d "{\"tag_name\":\"$NEW_TAG\",\"target_commitish\":\"$GH_BRANCH\",\"name\":\"$NEW_TAG\",\"body\":\"$COMMIT_MSG\",\"draft\":false,\"prerelease\":false}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

curl -s -X POST \
  -H "Authorization: Bearer $GH_TOKEN" -H "Content-Type: application/javascript" \
  --data-binary @"$JS_FILE" \
  "https://uploads.github.com/repos/$GH_REPO/releases/$RELEASE_ID/assets?name=$JS_FILE" > /dev/null
echo "  ✓ Release $NEW_TAG created"

# --- 3. Deploy JS to HA ---
echo "→ Deploying to HA..."
sshpass -p "$HA_SSH_PASS" scp -o StrictHostKeyChecking=no -P 22 \
  "$JS_FILE" "root@$HA_HOST:$HA_PATH" && echo "  ✓ File uploaded"

sshpass -p "$HA_SSH_PASS" ssh -o StrictHostKeyChecking=no -p 22 "root@$HA_HOST" \
  "rm -f ${HA_PATH}.gz && sed -i 's|$JS_FILE?v=[0-9]*|${JS_FILE}?v=$(date +%s)|g' /config/.storage/lovelace_resources" \
  && echo "  ✓ Cache cleared"

# --- 4. Restart HA ---
curl -s -X POST "http://$HA_HOST:$HA_PORT/api/services/homeassistant/restart" \
    -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" > /dev/null
echo "  ✓ HA restart triggered..."

# --- 5. Wait for HA ---
printf "  Waiting for HA"
sleep 10
for i in $(seq 1 30); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://$HA_HOST:$HA_PORT/api/" \
        -H "Authorization: Bearer $HA_TOKEN" 2>/dev/null)
    if [ "$STATUS" = "200" ]; then
        echo ""
        echo "  ✓ HA is back up!"
        echo ""
        echo "✅ Done! Release $NEW_TAG — reload browser (Cmd+Shift+R) to see changes."
        exit 0
    fi
    printf "."
    sleep 3
done

echo ""
echo "  ⚠ HA still starting — reload browser in a few seconds."
