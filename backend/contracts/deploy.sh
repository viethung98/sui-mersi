#!/usr/bin/env bash
# Deploy the cart Move contract to Sui and update comagent/.env with the new addresses.
#
# Usage:
#   ./deploy.sh [--network testnet|mainnet|devnet|localnet] [--env-file <path>]
#
# Requirements:
#   - sui CLI in PATH
#   - jq in PATH (brew install jq)
#   - Active sui client environment pointing at the target network
#   - Funded relayer address (sui client gas to check balance)

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths — script lives next to Move.toml so all paths derive from here
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$SCRIPT_DIR"
COMAGENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

NETWORK=""
ENV_FILE=""

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)  NETWORK="$2";  shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,10p' "$0" | sed 's/^# //'
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$ENV_FILE" ]]; then
  ENV_FILE="$COMAGENT_DIR/.env"
fi

# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------

for cmd in sui jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' not found in PATH." >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Network switch (optional)
# ---------------------------------------------------------------------------

if [[ -n "$NETWORK" ]]; then
  echo "Switching sui client environment to: $NETWORK"
  sui client switch --env "$NETWORK"
fi

ACTIVE_ENV=$(sui client active-env 2>/dev/null || echo "unknown")
ACTIVE_ADDRESS=$(sui client active-address 2>/dev/null || echo "unknown")
echo "Network  : $ACTIVE_ENV"
echo "Address  : $ACTIVE_ADDRESS"
echo "Contract : $CONTRACT_DIR"
echo ".env     : $ENV_FILE"
echo ""

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

echo "Building Move contract..."
# Remove build artifacts and Published.toml before each deploy.
# Published.toml (written by a previous deploy) overrides the cart = "0x0"
# address in Move.toml, causing "Modules must all have 0x0 as their addresses"
# on subsequent publishes.
rm -rf "$CONTRACT_DIR/build" "$CONTRACT_DIR/Published.toml"
(cd "$CONTRACT_DIR" && sui move build)

echo ""
echo "Deploying..."

# ---------------------------------------------------------------------------
# Publish — capture stdout (JSON) and stderr separately so warnings from
# the sui CLI don't corrupt the JSON we need to parse.
# ---------------------------------------------------------------------------

STDERR_FILE=$(mktemp)
trap 'rm -f "$STDERR_FILE"' EXIT

RAW_FILE=$(mktemp)
trap 'rm -f "$STDERR_FILE" "$RAW_FILE"' EXIT

# Capture stdout to file; stderr goes to STDERR_FILE.
# Use 'set +e' so a non-zero exit from sui doesn't kill the script —
# we check the exit code ourselves below.
set +e
sui client publish "$CONTRACT_DIR" --json >"$RAW_FILE" 2>"$STDERR_FILE"
PUBLISH_EXIT=$?
set -e

# Always print stderr (warnings, version notices)
if [[ -s "$STDERR_FILE" ]]; then
  cat "$STDERR_FILE" >&2
fi

# sui client publish emits build progress lines to stdout before the JSON.
# Drop everything before the first '{' to isolate the JSON object.
PUBLISH_OUTPUT=$(awk '/^\{/{found=1} found{print}' "$RAW_FILE")

if [[ -z "$PUBLISH_OUTPUT" ]]; then
  echo "Error: publish produced no JSON output (exit code: $PUBLISH_EXIT). Raw output:" >&2
  cat "$RAW_FILE" >&2
  exit 1
fi

if ! echo "$PUBLISH_OUTPUT" | jq empty 2>/dev/null; then
  echo "Error: could not parse JSON from publish output (exit code: $PUBLISH_EXIT):" >&2
  echo "$PUBLISH_OUTPUT" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Extract addresses
# ---------------------------------------------------------------------------

PACKAGE_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '
  .objectChanges[] | select(.type == "published") | .packageId
')

REGISTRY_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '
  .objectChanges[]
  | select(.type == "created")
  | select(.objectType | test("::cart::CartRegistry$"))
  | .objectId
')

if [[ -z "$PACKAGE_ID" || "$PACKAGE_ID" == "null" ]]; then
  echo "Error: could not extract packageId." >&2
  echo "$PUBLISH_OUTPUT" | jq . >&2
  exit 1
fi

if [[ -z "$REGISTRY_ID" || "$REGISTRY_ID" == "null" ]]; then
  echo "Error: could not extract CartRegistry objectId." >&2
  echo "$PUBLISH_OUTPUT" | jq . >&2
  exit 1
fi

DIGEST=$(echo "$PUBLISH_OUTPUT" | jq -r '.digest // "unknown"')
TX_STATUS=$(echo "$PUBLISH_OUTPUT" | jq -r '.effects.status.status // "unknown"')
GAS_USED=$(echo "$PUBLISH_OUTPUT" | jq -r '
  (.effects.gasUsed.computationCost // "0" | tonumber) +
  (.effects.gasUsed.storageCost     // "0" | tonumber) -
  (.effects.gasUsed.storageRebate   // "0" | tonumber)
  | . / 1000000000 * 1000 | round / 1000
  | tostring + " SUI"
' 2>/dev/null || echo "unknown")

# ---------------------------------------------------------------------------
# Print deploy status
# ---------------------------------------------------------------------------

echo ""
if [[ "$TX_STATUS" == "success" ]]; then
  echo "✓ Deploy status  : $TX_STATUS"
else
  echo "✗ Deploy status  : $TX_STATUS" >&2
  echo "$PUBLISH_OUTPUT" | jq '.effects.status' >&2
  exit 1
fi
echo "  Digest         : $DIGEST"
echo "  Gas used       : $GAS_USED"
echo "  Package ID     : $PACKAGE_ID"
echo "  CartRegistry   : $REGISTRY_ID"

# ---------------------------------------------------------------------------
# Update comagent/.env
# ---------------------------------------------------------------------------

update_env_var() {
  local key="$1" value="$2" file="$3" action

  if [[ ! -f "$file" ]]; then
    local example="$COMAGENT_DIR/.env.example"
    if [[ -f "$example" ]]; then
      cp "$example" "$file"
      echo "  Created $file from .env.example"
    else
      touch "$file"
    fi
  fi

  if grep -qE "^#?[[:space:]]*${key}=" "$file"; then
    local old_val
    old_val=$(grep -E "^#?[[:space:]]*${key}=" "$file" | tail -1 \
              | sed "s|^#\?[[:space:]]*${key}=||")
    sed -i.bak "s|^#\?[[:space:]]*${key}=.*|${key}=${value}|" "$file"
    rm -f "${file}.bak"
    if [[ "$old_val" == "$value" ]]; then
      action="unchanged"
    else
      action="updated  (was: ${old_val:-<empty>})"
    fi
  else
    echo "${key}=${value}" >> "$file"
    action="added"
  fi

  printf "  %-26s = %s  [%s]\n" "$key" "$value" "$action"
}

echo ""
echo ".env → $ENV_FILE"
update_env_var "SUI_CONTRACT_ADDRESS" "$PACKAGE_ID"   "$ENV_FILE"
update_env_var "SUI_CART_REGISTRY_ID" "$REGISTRY_ID" "$ENV_FILE"

# ---------------------------------------------------------------------------
# Save deployment record next to this script
# ---------------------------------------------------------------------------

RECORD_FILE="$SCRIPT_DIR/deployments/${ACTIVE_ENV}.json"
mkdir -p "$(dirname "$RECORD_FILE")"
cat > "$RECORD_FILE" <<EOF
{
  "network": "$ACTIVE_ENV",
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "deployedBy": "$ACTIVE_ADDRESS",
  "digest": "$DIGEST",
  "status": "$TX_STATUS",
  "packageId": "$PACKAGE_ID",
  "cartRegistryId": "$REGISTRY_ID"
}
EOF

echo ""
echo "Deployment record → $RECORD_FILE"

# ---------------------------------------------------------------------------
# Regenerate TypeScript SDK bindings from the freshly-built contract
# The build dir was recreated above by sui move build / sui client publish,
# so codegen always reads the latest bytecode.
# ---------------------------------------------------------------------------

echo ""
echo "Regenerating TypeScript SDK..."

if ! command -v bun &>/dev/null; then
  echo "  Warning: 'bun' not found — skipping SDK generation. Run 'bun run codegen' manually." >&2
elif [[ ! -f "$COMAGENT_DIR/package.json" ]]; then
  echo "  Warning: package.json not found at $COMAGENT_DIR — skipping SDK generation." >&2
elif [[ ! -f "$COMAGENT_DIR/sui-codegen.config.js" ]]; then
  echo "  Warning: sui-codegen.config.js not found — skipping SDK generation." >&2
else
  if (cd "$COMAGENT_DIR" && bun run codegen 2>&1); then
    echo "  ✓ SDK regenerated → $COMAGENT_DIR/src/generated/cart/cart.ts"
  else
    echo ""
    echo "  ✗ SDK regeneration failed. Fix the error above, then run manually:" >&2
    echo "      cd $COMAGENT_DIR && bun run codegen" >&2
    echo "  Continuing (contract is deployed; only the local SDK bindings are stale)." >&2
  fi
fi

echo ""
echo "Next steps:"
echo "  1. Restart the backend (comagent) so it picks up the new addresses."
echo "  2. The relayer calls create_cart on next wallet activation (auth-provision.ts)."
echo "  3. Old on-chain carts are gone — users get a fresh cart on next login."
