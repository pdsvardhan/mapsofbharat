#!/usr/bin/env bash
# One-shot off-box backup setup (#544 / 405-A).
#
# Everything that does not need your cloud account is already done here: the config
# is written non-interactively, the remote is proved to work, the bucket is created,
# the cron line is rewritten to push instead of staying local, and a real backup runs
# and is verified end to end.
#
# The ONLY part that cannot be automated is creating the account and minting a token,
# because that means accepting a provider's terms as you. Two values come out of it.
#
#   Cloudflare R2:  dash.cloudflare.com -> R2 -> Manage API tokens -> Create
#                   "Object Read & Write". Gives an Access Key ID + Secret, and the
#                   account id is in the R2 endpoint URL.
#       ./setup-backup-remote.sh r2 <ACCOUNT_ID> <ACCESS_KEY_ID> <SECRET>
#
#   Backblaze B2:   backblaze.com -> App Keys -> Add a New Application Key.
#                   Gives a keyID + applicationKey.
#       ./setup-backup-remote.sh b2 <KEY_ID> <APPLICATION_KEY>
#
# Nothing is echoed back: secrets go straight into the config file, which is chmod 600.
set -uo pipefail

PROVIDER="${1:-}"
BUCKET="mapsofbharat-backup"
CONF="$HOME/.config/rclone/rclone.conf"
REMOTE_NAME="mobbackup"

die() { echo "setup-backup-remote: $*" >&2; exit 1; }

mkdir -p "$(dirname "$CONF")"

case "$PROVIDER" in
  r2)
    [ $# -eq 4 ] || die "usage: $0 r2 <ACCOUNT_ID> <ACCESS_KEY_ID> <SECRET>"
    ACCOUNT="$2"; KEY="$3"; SECRET="$4"
    rclone config create "$REMOTE_NAME" s3 \
      provider=Cloudflare \
      access_key_id="$KEY" \
      secret_access_key="$SECRET" \
      endpoint="https://${ACCOUNT}.r2.cloudflarestorage.com" \
      acl=private \
      --non-interactive >/dev/null || die "rclone config create failed"
    ;;
  b2)
    [ $# -eq 3 ] || die "usage: $0 b2 <KEY_ID> <APPLICATION_KEY>"
    rclone config create "$REMOTE_NAME" b2 \
      account="$2" key="$3" hard_delete=true \
      --non-interactive >/dev/null || die "rclone config create failed"
    ;;
  *)
    die "first argument must be 'r2' or 'b2' — see the header for where the values come from"
    ;;
esac

chmod 600 "$CONF"
echo "1/5  config written to $CONF (mode 600)"

# Prove the credentials actually work BEFORE rewriting the cron. A setup that
# reports success and leaves a broken remote in the crontab is the exact failure
# backup-offbox.sh was written to prevent.
rclone lsd "${REMOTE_NAME}:" >/dev/null 2>&1 || die "credentials rejected — the remote does not list. Nothing else was changed."
echo "2/5  credentials verified against the provider"

rclone mkdir "${REMOTE_NAME}:${BUCKET}" 2>/dev/null
rclone lsd "${REMOTE_NAME}:" | grep -q "$BUCKET" || die "could not create or see bucket '$BUCKET'"
echo "3/5  bucket ${BUCKET} present"

# Rewrite the 3:45am line: carry the remote, drop --local-only.
NEW="45 3 * * * MOB_BACKUP_REMOTE=${REMOTE_NAME}:${BUCKET} /mnt/storage/websites/mapsofbharat/scripts/backup-offbox.sh >> /opt/homeserver/logs/mapsofbharat-backup.log 2>&1"
crontab -l 2>/dev/null | grep -v "backup-offbox.sh" > /tmp/crontab.new
echo "$NEW" >> /tmp/crontab.new
crontab /tmp/crontab.new && rm -f /tmp/crontab.new
crontab -l | grep backup-offbox
echo "4/5  cron rewritten to push off-box"

echo "5/5  running a real backup now (this pushes ~1.3GB the first time)..."
cd /mnt/storage/websites/mapsofbharat
MOB_BACKUP_REMOTE="${REMOTE_NAME}:${BUCKET}" ./scripts/backup-offbox.sh
echo
echo "what is actually off the box now:"
rclone size "${REMOTE_NAME}:${BUCKET}"
rclone lsd "${REMOTE_NAME}:${BUCKET}"
