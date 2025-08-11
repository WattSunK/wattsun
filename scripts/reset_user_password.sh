#!/usr/bin/env bash
DB="/volume1/web/wattsun/user-setup/users.db"
EMAIL="skamunyu@gmail.com"
NEWPW="pass123"   # change to whatever you want

# 1) Make a bcrypt hash in Node
HASH=$(node -e "require('bcrypt').hash(process.argv[1],10).then(h=>console.log(h))" "$NEWPW")

# 2) Open a valid reset window (lets the guard allow the update)
sqlite3 "$DB" "
UPDATE users
SET reset_token='manual', reset_expiry=(CAST(strftime('%s','now') AS INTEGER)+3600)
WHERE lower(email)=lower('$EMAIL');
"

# 3) Set the new password hash (allowed because reset is active), then clear the reset fields
sqlite3 "$DB" "
UPDATE users
SET password_hash='$HASH', reset_token=NULL, reset_expiry=NULL
WHERE lower(email)=lower('$EMAIL');
"

# 4) Sanity check
sqlite3 "$DB" "
SELECT id,email,substr(password_hash,1,10) AS hash10 FROM users
WHERE lower(email)=lower('$EMAIL');
"
